/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the DownThemAll! FilterManager module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const EXPORTED_SYMBOLS = ['FilterManager'];

const PREF_FILTERS_BASE = 'extensions.dta.filters.';
const LINK_FILTER = (1<<0);
const IMAGE_FILTER = (1<<1);
const TOPIC_FILTERSCHANGED = 'DTA:filterschanged';

const REG_ESCAPE = /[{}()\[\]\\^$.?]/g;
const REG_WILD = /\*/g;
const REG_WILD2 = /\./g;


const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Exception = Components.Exception;
const module = Components.utils.import;
const error = Components.utils.reportError;

let PBM = {}, RegExpMerger = {};
module("resource://dta/glue.jsm");
const Preferences = glue2.require("preferences");
module('resource://dta/support/pbm.jsm', PBM);
module('resource://dta/support/regexpmerger.jsm', RegExpMerger);

const nsITimer = Ci.nsITimer;

function flatten(arr) arr.reduce(function(a,b) {
	if (a instanceof Array) {
		a = flatten(a);
	}
	if (b instanceof Array) {
		b = flatten(b);
	}
	return Array.concat(a, b);
},[]);

/**
 * Helper: Consolidates regular expressions by combining
 * @param (Array) regs
 * @returns (Array) consolidated regs
 */
function consolidateRegs(regs) {
	regs = regs;
	if (!regs || regs.length == 1) {
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
		rv.push(new RegExp(RegExpMerger.merge(ic), 'i'));
	}
	if (nc.length) {
		rv.push(new RegExp(RegExpMerger.merge(nc)));
	}
	return rv;
}
/**
 * FilterManager
 */
// no not create DTA_Filter yourself, managed by FilterManager
function Filter(name) {
	this._id = name;
}
Filter.prototype = {
	_persist: true,
	_sessionActive: null,
	get persist() {
		return this._persist;
	},
	set persist(nv) {
		this._persist = !!nv;
		if (!this._persist) {
			this._sessionActive = this._active;
		}
	},

	// exported
	get id() {
		return this._id.slice(PREF_FILTERS_BASE.length);
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
		if (this._label == value) {
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
		if (this._expr == value) {
			return;
		}
		this._expr = value;
		this._regs = [];
		this._makeRegs(this._expr);
		this._regs = consolidateRegs(this._regs);
		if (this._regs.length == 1) {
			let r = this._regs[0];
			this.match = function(str) {
				if (!str) {
					return false;
				}
				return r.test(str.toString());
			}
		}
		else if (this.hasOwnProperty('match')) {
			delete this.match;
		}
		this._modified = true;
	},
	_makeRegs: function FM__makeRegs(str) {

		str = str.trim();

		// first of all: check if we are are a regexp.
		if (str.length > 2 && str[0] == '/') {
			try {
				var m = str.match(/^\/(.+?)(?:\/(i?))?$/);
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
			for each (var s in parts) {
				this._makeRegs(s);
			}
			return;
		}

		// we are simple text
		str = str
			.replace(REG_ESCAPE, "\\$&")
			.replace(REG_WILD, ".*")
			.replace(REG_WILD2, '.');
		if (str.length) {
			this._regs.push(new RegExp(str, 'i'));
		}
	},

	// exported
	get active() {
		return this._persist ? this._active : this._sessionActive;
	},
	set active(value) {
		if (this.active == !!value) {
			return;
		}
		if (this._persist) {
			this._active = !!value;
			this._modified = true;
		}
		else {
			this._sessionActive = !!value;
		}
	},

	// exported
	get type() {
		return this._type;
	},
	set type(t) {
		if (this._type == t) {
			return;
		}
		this._type = t;
		this._modified = true;
	},

	pref: function F_pref(str) {
		return this._id + "." + str;
	},

	match: function F_match(str) {
		if (!str) {
			return false;
		}
		str = str.toString();
		return this._regs.some(function(r) r.test(str));
	},

	/**
	 * @throws Exception in case loading failed
	 */
	load: function F_load(localizedLabel) {
		this._localizedLabel = localizedLabel;
		this._label = Preferences.get(this.pref('label'));
		if (!this._label || !this._label.length) {
			throw Exception("Empty filter!");
		}
		// localize the label, but only if user didn't change it.
		if (localizedLabel && !Preferences.hasUserValue(this.pref('label'))) {
			this._label = localizedLabel;
		}

		this._active = Preferences.get(this.pref('active'));
		this._type = Preferences.get(this.pref('type'));
		this._defFilter = this._id.search(/deffilter/) != -1;
		if (this._defFilter) {
			let ext = Preferences.get(this.pref('icon'));
			if (ext) {
				this.iconExt = ext;
			}
		}
		// may throw
		this.expression = Preferences.get(this.pref('test'));

		this._modified = false;
	},

	// exported
	save: function F_save() {
		if (!this._modified) {
			return;
		}
		Preferences.set(this.pref('active'), this._active);
		Preferences.set(this.pref('test'), this._expr);
		Preferences.set(this.pref('type'), this._type);

		// save this last as FM will test for it.
		Preferences.set(this.pref('label'), this._label);
		FilterManager._delayedReload();

		this._modified = false;
	},

	_reset: function F_reset() {
		Preferences.resetBranch(this._id);
	},

	// exported
	restore: function F_restore() {
		if (!this._defFilter) {
			throw new Exception("only default filters can be restored!");
		}
		this._reset();
	},

	// exported
	remove: function F_remove() {
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
	}
};

function FilterEnumerator(filters) {
	this._filters = filters;
	this._idx = 0;
}
FilterEnumerator.prototype = {
	QueryInterface: XPCOMUtils.generateQI([Ci.nsISimpleEnumerator]),
	__iterator__: function() {
		for each (let f in this._filters) {
			yield f;
		}
	},
	hasMoreElements: function FE_hasMoreElements() {
		return this._idx < this._filters.length;
	},
	getNext: function FE_getNext() {
		if (!this.hasMoreElements()) {
			throw NS_ERROR_FAILURE;
		}
		return this._filters[this._idx++];
	}
};

function FilterManagerImpl() {
};
FilterManagerImpl.prototype = {
	LINK_FILTER: LINK_FILTER,
	IMAGE_FILTER: IMAGE_FILTER,

	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference, Ci.nsIWeakReference]),
	QueryReferent: function(iid) this.QueryInterface(iid),
	GetWeakReference: function() this,

	init: function FM_init() {
		PBM.registerCallbacks(this);

		// load those localized labels for default filters.
		this._localizedLabels = {};
		let b = Services.strings
			.createBundle("chrome://dta/locale/filters.properties");
		let e = b.getSimpleEnumeration();
		while (e.hasMoreElements()) {
			let prop = e.getNext().QueryInterface(Ci.nsIPropertyElement);
			this._localizedLabels[prop.key] = prop.value;
		}

		// register (the observer) and initialize our timer, so that we'll get a reload event.
		this._reload();
		this.register();
	},

	enterPrivateBrowsing: function() {
		for each (let f in this._all) {
			f.persist = false;
		}
	},
	exitPrivateBrowsing: function() {
		for each (let f in this._all) {
			f.persist = true;
		}
	},

	_done: true,
	_mustReload: false,

	_timer: null,

	_delayedReload: function FM_delayedReload() {
		if (this._mustReload) {
			return;
		}
		this._mustReload = true;
		this._timer = new Instances.Timer(this, 100, nsITimer.TYPE_ONE_SHOT);
	},

	get count() {
		return this._count;
	},
	reload: function FM_reload() {
		if (!this._mustReload) {
			return;
		}
		this._mustReload = false;
		this._reload();
	},
	_reload: function FM__reload() {
		this._filters = {};
		this._all = [];

		// hmmm. since we use uuids for the filters we've to enumerate the whole branch.
		for each (let pref in Preferences.getChildren(PREF_FILTERS_BASE)) {
			// we test for label (as we get all the other props as well)
			if (pref.search(/\.label$/) == -1) {
				continue;
			}
			// cut of the label part to get the actual name
			let name = pref.slice(0, -6);
			try {
				let filter = new Filter(name);
				// overwrite with localized labels.
				let localizedLabel = null;
				let localizedTag = filter.id;
				if (localizedTag in this._localizedLabels) {
					localizedLabel = this._localizedLabels[localizedTag];
				}
				filter.load(localizedLabel);
				this._filters[filter.id] = filter;
				this._all.push(filter);
			}
			catch (ex) {
				error(ex);
			}
		}

		this._count = this._all.length;

		this._all.sort(
			function(a,b) {
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
			}
		);
		this._active = {};
		this._active[LINK_FILTER]  = this._all.filter(function(f) (f.type & LINK_FILTER) && f.active),
		this._active[IMAGE_FILTER] = this._all.filter(function(f) (f.type & IMAGE_FILTER) && f.active)
		this._activeRegs = {};
		this._activeRegs[LINK_FILTER]  = this.getMatcherFor(this._active[LINK_FILTER]);
		this._activeRegs[IMAGE_FILTER] = this.getMatcherFor(this._active[IMAGE_FILTER]);

		// notify all observers
		Services.obs.notifyObservers(this, TOPIC_FILTERSCHANGED, null);
	},

	enumAll: function FM_enumAll() {
		return new FilterEnumerator(this._all);
	},
	enumActive: function FM_enumActive(type) {
		return new FilterEnumerator(this._active[type]);
	},

	getFilter: function FM_getFilter(id) {
		if (id in this._filters) {
			return this._filters[id];
		}
		throw new Exception("invalid filter specified: " + id);
	},
	getMatcherFor: function FM_getMatcherFor(filters) {
		let regs = consolidateRegs(flatten(
			filters.map(function(f) f._regs)
		));
		if (regs.length == 1) {
			regs = regs[0];
			return function(test) {
				test = test.toString();
				if (!test) {
					return false;
				}
				return regs.test(test);
			}
		}
		return function(test) {
			test = test.toString();
			if (!test) {
				return false;
			}
			return regs.some(function(r) r.test(test));
		}
	},
	matchActive: function FM_matchActive(test, type) this._activeRegs[type](test),

	create: function FM_create(label, expression, active, type) {

		// we will use unique ids for user-supplied filters.
		// no need to keep track of the actual number of filters or an index.
		let filter = new Filter(PREF_FILTERS_BASE + Services.uuid.generateUUID().toString());
		// I'm a friend, hence I'm allowed to access private members :p
		filter._label = label;
		filter._active = active;
		filter._type = type;
		filter._modified = true;

		// this might throw!
		filter.expression = expression;


		// will call our observer so we re-init... no need to do more work here :p
		filter.save();
		return filter.id;
	},

	remove: function FM_remove(id) {
		if (id in this._filters) {
			this._filters[id].remove();
			return;
		}
		throw new Exception('filter not defined!');
	},

	save: function FM_save() {
		for each (var f in this._all) {
			try {
				f.save();
			}
			catch (ex) {
				error(ex);
			}
		}
		this._delayedReload();
	},

	getTmpFromString: function FM_getTmpFromString(expression) {
		if (!expression.length) {
			throw NS_ERROR_INVALID_ARG;
		}
		var filter = new Filter("temp", null);
		filter._active = true;
		filter._type = LINK_FILTER | IMAGE_FILTER;
		filter._modified = false;
		filter.expression = expression;
		return filter;
	},

	// nsIObserver
	observe: function FM_observe(subject, topic, prefName) {
		switch (topic){
			case 'timer-callback':
				this.reload();
				break;
			default:
				this._delayedReload();
				break;
		}
	},

	// own stuff
	register: function FM_register() {
		try {
			// Put self as observer to desired branch
			Preferences.addObserver(PREF_FILTERS_BASE, this);
		}
		catch (ex) {
			error(ex);
			return false;
		}
		return true;
	}
};
const FilterManager = new FilterManagerImpl();
FilterManager.init();
