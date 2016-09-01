/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const PREF_FILTERS_BASE = 'extensions.dta.filters.';
const LINK_FILTER = (1<<0);
const IMAGE_FILTER = (1<<1);
const TOPIC_FILTERSCHANGED = 'DTA:filterschanged';

const FILTERS_FILE = "filters.json";

const REG_ESCAPE = /[{}()\[\]\\^$.?]/g;
const REG_WILD = /\*/g;
const REG_WILD2 = /\./g;
const REG_FNMATCH = /[*.]/;

const Preferences = require("preferences");
const RegExpMerger = require("./regexpmerger");
const {mapInSitu} = require("utils");
const {OS} = requireJSM("resource://gre/modules/osfile.jsm");
const {Task} = requireJSM("resource://gre/modules/Task.jsm");
const {DeferredSave} = requireJSM("resource://gre/modules/DeferredSave.jsm");

const nsITimer = Ci.nsITimer;

function flatten(arr) { return arr.reduce(function(a,b) {
	if (a instanceof Array) {
		a = flatten(a);
	}
	if (b instanceof Array) {
		b = flatten(b);
	}
	return Array.concat(a, b);
}, []); }

function merge_map(e) { return `(?:${e})`; };
function merge_unique(e) {
	return !((e in this) || (this[e] = null));
};

function merge_naive(strs) {
	if (strs.length < 2) {
		return strs[0];
	}
	return mapInSitu(strs.filter(merge_unique, {}), merge_map).join("|");
}

function merge_regs(regs) {
	if (Preferences.getExt("optimizeregex", false)) {
		return RegExpMerger.merge(regs);
	}
	return merge_naive(regs);
}

/**
 * Helper: Consolidates regular expressions by combining
 * @param (Array) regs
 * @returns (Array) consolidated regs
 */
function consolidateRegs(regs) {
	regs = regs;
	if (!regs || regs.length === 1) {
		return regs;
	}
	let nc = [];
	let ic = [];
	for (let i = 0; i < regs.length; ++i) {
		let reg = regs[i];
		if (reg.ignoreCase) {
			ic.push(reg.source);
		}
		else {
			nc.push(reg.source);
		}
	}
	let rv = [];
	if (ic.length) {
		rv.push(new RegExp(merge_regs(ic), 'i'));
	}
	if (nc.length) {
		rv.push(new RegExp(merge_regs(nc)));
	}
	return rv;
}
/**
 * FilterManager
 */
// no not create DTA_Filter yourself, managed by FilterManager
function Filter(name) {
	this._id = name;
	this._expr = null;
}
Filter.prototype = {
	// exported
	get id() {
		return this._id;
	},

	// exported
	get defFilter() {
		return this._defFilter;
	},

	// exported
	get label() {
		return this._label;
	},
	set label(value) {
		if (this._label === value) {
			return;
		}
		this._label = value;
		this._modified = true;
	},

	// exported
	get expression() {
		return this._expr;
	},
	set expression(value) {
		if (this._expr === value) {
			return;
		}
		this._expr = value;
		this._regs = [];
		this._makeRegs(this._expr);
		this._regs = consolidateRegs(this._regs);
		if (this._regs.length === 1) {
			let r = this._regs[0];
			this.match = function(str) {
				if (!str) {
					return false;
				}
				return r.test(str.toString());
			};
		}
		else if (this.hasOwnProperty('match')) {
			delete this.match;
		}
		this._modified = true;
	},
	_makeRegs: function(str) {
		str = str.trim();
		// first of all: check if we are are a regexp.
		if (str.length > 2 && str[0] === '/') {
			try {
				var m = str.match(/^\/(.+?)\/(i)?$/);
				if (!m) {
					throw new Exception("Invalid RegExp supplied");
				}
				if (!m[1].length) {
					return;
				}
				this._regs.push(new RegExp(m[1], m[2]));
				return;
			}
			catch (ex) {
				// fall-through
			}
		}

		var parts = str.split(',');
		// we contain multiple filters
		if (parts.length > 1) {
			for (var s of parts) {
				this._makeRegs(s);
			}
			return;
		}

		// we are simple text
		const fnmatch = REG_FNMATCH.test(str);
		str = str.replace(REG_ESCAPE, "\\$&");
		if (fnmatch) {
			str = "^" + str.replace(REG_WILD, ".*").replace(REG_WILD2, '.') + "$";
		}

		if (str.length) {
			this._regs.push(new RegExp(str, 'i'));
		}
	},

	// exported
	get active() {
		return this._active;
	},
	set active(value) {
		if (this.active === !!value) {
			return;
		}
		this._active = !!value;
		this._modified = true;
	},

	// exported
	get type() {
		return this._type;
	},
	set type(t) {
		if (this._type === t) {
			return;
		}
		this._type = t;
		this._modified = true;
	},

	pref: function(str) {
		return this._id + "." + str;
	},

	match: function(str) {
		if (!str) {
			return false;
		}
		str = str.toString();
		return this._regs.some(r => r.test(str));
	},

	/**
	 * @throws Exception in case loading failed
	 */
	load: function(obj) {
		this._label = obj.label;
		if (!this._label || !this._label.length) {
			throw new Exception("Empty filter!");
		}

		this._active = !!obj.active;
		this._type = obj.type;
		this._defFilter = this._id.search(/deffilter/) !== -1;
		this.iconExt = obj.icon;
		// may throw
		this.expression = obj.expr;

		this._modified = false;
	},

	// exported
	save: function() {
		if (!this._modified) {
			return;
		}
		exports.FilterManager.save();
		this._modified = false;
	},

	_reset: function() {
		exports.FilterManager.remove(this._id);
	},

	// exported
	restore: function() {
		if (!this._defFilter) {
			throw new Exception("only default filters can be restored!");
		}
		this._reset();
	},

	// exported
	remove: function() {
		if (this._defFilter) {
			throw new Exception("default filters cannot be deleted!");
		}
		this._reset();
	},

	toString: function() {
		return this._label + " (" + this._id + ")";
	},

	toSource: function() {
		return this.toString() + ": " + this._regs.toSource();
	},

	toJSON: function() {
		return {
			id: this.id,
			label: this._label,
			expr: this._expr,
			type: this._type,
			active: this._active,
		};
	}
};

function FilterEnumerator(filters) {
	this._filters = filters;
	this._idx = 0;
}
FilterEnumerator.prototype = {
	QueryInterface: QI([Ci.nsISimpleEnumerator]),
	hasMoreElements: function() {
		return this._idx < this._filters.length;
	},
	getNext: function() {
		if (!this.hasMoreElements()) {
			throw Cr.NS_ERROR_FAILURE;
		}
		return this._filters[this._idx++];
	}
};
FilterEnumerator.prototype[Symbol.iterator] = function*() {
	for (let f of this._filters) {
		yield f;
	}
};

function FilterManagerImpl() {
	this.init();
};
FilterManagerImpl.prototype = {
	LINK_FILTER: LINK_FILTER,
	IMAGE_FILTER: IMAGE_FILTER,

	init: function() {
		log(LOG_DEBUG, "initializing filter manager");
		// load those localized labels for default filters.
		this._localizedLabels = {};
		let b = Services.strings
			.createBundle("chrome://dta/locale/filters.properties");
		let e = b.getSimpleEnumeration();
		while (e.hasMoreElements()) {
			let prop = e.getNext().QueryInterface(Ci.nsIPropertyElement);
			this._localizedLabels[prop.key] = prop.value;
		}
		this._file = require("api").getProfileFile(FILTERS_FILE, true);
		this._saver = new DeferredSave(
			this._file.path,
			JSON.stringify.bind(JSON, this, null, 2),
			100);
		this._reload();
	},

	get count() {
		return this._count;
	},
	reload: function() {
		this._reload();
	},
	_reload: function() {
		if (this._pending) {
			log(LOG_DEBUG, "reload pending");
			return this._pending;
		}
		log(LOG_DEBUG, "reload spawning");
		this._pending = Task.spawn((function*() {
			log(LOG_DEBUG, "reload commencing");
			try {
				let decoder = new TextDecoder();
				if (!this.defFilters) {
					yield new Promise(function(resolve, reject) {
						let x = new Instances.XHR();
						this._filters = {};
						this._all = [];
						x.overrideMimeType("application/json");
						x.open("GET", BASE_PATH + "support/filters.json");
						x.onloadend = (function() {
							try {
								this.defFilters = JSON.parse(x.responseText);
								for (let id in this.defFilters) {
									if (id in this._localizedLabels) {
										this.defFilters[id].label = this._localizedLabels[id];
									}
								}
								Object.freeze(this.defFilters);
							}
							catch (ex) {
								log(LOG_ERROR, "Failed to load default filters", ex);
								this.defFilters = {};
							}
							resolve();
						}).bind(this);
						x.send();
					}.bind(this));
				}
				let filters = {};
				try {
					filters = JSON.parse(decoder.decode(yield OS.File.read(this._file.path)));
					if (!filters) {
						throw new Error ("No filters where loaded");
					}
					for (let f of Object.keys(filters)) {
						if (!(f in this.defFilters)) {
							continue;
						}
						let filter = filters[f];
						let no = Object.create(this.defFilters[f]);
						for (let i of Object.getOwnPropertyNames(filter)) {
							Object.defineProperty(no, i, Object.getOwnPropertyDescriptor(filter, i));
						}
						filters[f] = no;
					}
				}
				catch (lex) {
					log(LOG_DEBUG, "Couldn't load filters file", lex);
					filters = this._migrateFromPrefs(this._pending);
				}
				// merge with defFilters
				for (let f in this.defFilters) {
					if (!(f in filters)) {
						filters[f] = Object.create(this.defFilters[f]);
					}
				}

				// Load all
				let all = [];
				for (let [id, obj] in Iterator(filters)) {
					try {
						let f = new Filter(id);
						f.load(obj);
						filters[f.id] = f;
						all.push(f);
					}
					catch (ex) {
						log(LOG_DEBUG, "failed to load filter: " + id, ex);
						delete filters[id];
					}
				}
				this._filters = filters;
				this._all = all;
				log(LOG_DEBUG, "loaded all filters");
			}
			catch (ex) {
				log(LOG_ERROR, "failed to load filters", ex);
			}

			this._rebuild();
			delete this._pending;
		}).bind(this)).then(null, function(ex) {
			log(LOG_ERROR, "Task did not finish", ex);
		});
		return this._pending;
	},

	_rebuild: function() {
		this._count = this._all.length;
		this._all.sort(function(a,b) {
			if (a.defFilter && !b.defFilter) {
				return -1;
			}
			else if (!a.defFilter && b.defFilter) {
				return 1;
			}
			else if (a.defFilter) {
				if (a.id < b.id) {
					return -1;
				}
				return 1;
			}
			var i = a.label.toLowerCase(), ii = b.label.toLowerCase();
			return i < ii ? -1 : (i > ii ? 1 : 0);
		});
		this._active = {};
		this._active[LINK_FILTER]  = this._all.filter(f => (f.type & LINK_FILTER) && f.active);
		this._active[IMAGE_FILTER] = this._all.filter(f => (f.type & IMAGE_FILTER) && f.active);
		this._activeRegs = {};
		this._activeRegs[LINK_FILTER]  = this.getMatcherFor(this._active[LINK_FILTER]);
		this._activeRegs[IMAGE_FILTER] = this.getMatcherFor(this._active[IMAGE_FILTER]);

		// notify all observers
		require("./observers").notify(this, TOPIC_FILTERSCHANGED, null);
	},

	_migrateFromPrefs: function(pending) {
		log(LOG_DEBUG, "migrating from prefs");

		let rv = {};
		let kill = new Set();
		let checks = [".label", ".test", ".type", ".active"];
		let checkfn = (name, c) => Preferences.hasUserValue(name + c);
		for (let pref of Preferences.getChildren(PREF_FILTERS_BASE)) {
			// we test for label (as we get all the other props as well)
			let name = pref.replace(/\.[^.]+?$/, "");
			if (name in kill) {
				continue;
			}
			kill.add(name);
			if (pending && (name in this.defFilters) && !checks.some(checkfn.bind(null, name))) {
				log(LOG_DEBUG, "skipping (not modified) " + name + " pref: " + pref);
				continue;
			}
			try {
				rv[name.slice(PREF_FILTERS_BASE.length)] = {
					"label": Preferences.get(name + ".label", ""),
					"expr": Preferences.get(name + ".test", ""),
					"type": Preferences.get(name + ".type", LINK_FILTER),
					"active": Preferences.get(name + ".active", true)
				};
				log(LOG_DEBUG, "migrated " + name);
			}
			catch (ex) {
				log(LOG_DEBUG, "Failed to migrate " + name, ex);
			}
		}
		if (pending && kill.size) {
			Task.spawn((function*() {
				try {
					yield this._save();
					for (let i of kill) {
						log(LOG_DEBUG, "killing " + i);
						Preferences.resetBranch(i);
					}
				}
				catch (ex) {
					log(LOG_ERROR, "failed to reset prefs", ex);
				}
			}).bind(this));
		}
		return rv;
	},

	enumAll: function() {
		return new FilterEnumerator(this._all);
	},

	getFilter: function(id) {
		if (id in this._filters) {
			return this._filters[id];
		}
		if (id.startsWith("deffilter-")) {
			// compat: Other add-ons, in particular anticontainer, may have
			// added filters, which weren't completely present at the time
			// filters.json was first generated, but are accessed just now.
			// Try to migrate the filter now.
			let filters = this._migrateFromPrefs(null);
			if (id in filters) {
				try {
					let f = new Filter(id);
					f.load(filters[id]);
					this._filters[f.id] = f;
					this._all.push(f);
					this._rebuild();
					this._save();
					return f;
				}
				catch (ex) {
					log(LOG_DEBUG, "failed to re-migrate filter: " + id, ex);
					delete this._filters[id];
				}
			}
		}
		throw new Exception("invalid filter specified: " + id);
	},
	getMatcherFor: function(filters) {
		let regs = consolidateRegs(flatten(
			filters.map(f => f._regs)
		));
		if (regs.length === 1) {
			regs = regs[0];
			return function(test) {
				test = test.toString();
				if (!test) {
					return false;
				}
				return regs.test(test);
			};
		}
		return function(test) {
			test = test.toString();
			if (!test) {
				return false;
			}
			return regs.some(r => r.test(test));
		};
	},
	matchActive: function(test, type) { return this._activeRegs[type](test); },

	create: function(label, expression, active, type) {

		// we will use unique ids for user-supplied filters.
		// no need to keep track of the actual number of filters or an index.
		let filter = new Filter(Services.uuid.generateUUID().toString());
		// I'm a friend, hence I'm allowed to access private members :p
		filter._label = label;
		filter._active = active;
		filter._type = type;
		filter._modified = true;

		// this might throw!
		filter.expression = expression;

		// will call our observer so we re-init... no need to do more work here :p
		this._filters[filter.id] = filter;
		this._all.push(filter);
		this._rebuild();
		this._save();
		return filter.id;
	},

	remove: function(id) {
		if (id in this._filters) {
			delete this._filters[id];
			this.save();
			this._saver.flush();
			return;
		}
		throw new Exception('filter not defined!');
	},

	_save: function() {
		return Task.spawn((function*() {
			try {
				yield OS.File.makeDir(this._file.parent.path, {unixMode: 0x775, ignoreExisting: true});
			}
			catch (ex if ex.becauseExists) {
				// no op;
			}
			yield this._saver.saveChanges();
		}).bind(this));
	},
	save: function() {
		Task.spawn((function*() {
			try {
				yield this._save();
				this._reload();
			}
			catch (ex) {
				log(LOG_ERROR, "failed to save filters", ex);
			}
		}).bind(this));
	},

	getTmpFromString: function(expression) {
		if (!expression.length) {
			throw Cr.NS_ERROR_INVALID_ARG;
		}
		var filter = new Filter("temp", null);
		filter._active = true;
		filter._type = LINK_FILTER | IMAGE_FILTER;
		filter._modified = false;
		filter.expression = expression;
		return filter;
	},

	ready: function(callback) {
		if (this._pending) {
			log(LOG_DEBUG, "waiting for ready");
			this._pending.then(callback);
			return;
		}
		callback();
	},

	toJSON: function() {
		return this._filters;
	}
};
exports.FilterManager = new FilterManagerImpl();
