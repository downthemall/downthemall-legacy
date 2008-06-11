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
 * The Original Code is DownThemAll! Filter Manager.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007
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

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const Exception = Components.Exception;

const NS_ERROR_NO_INTERFACE = Components.results.NS_ERROR_NO_INTERFACE;
const NS_ERROR_FAILURE = Components.results.NS_ERROR_FAILURE;
const NS_ERROR_NO_AGGREGATION = Components.results.NS_ERROR_NO_AGGREGATION;
const NS_ERROR_INVALID_ARG = Components.results.NS_ERROR_INVALID_ARG;

const LINK_FILTER = Ci.dtaIFilter.LINK_FILTER;
const IMAGE_FILTER = Ci.dtaIFilter.IMAGE_FILTER;

function include(uri) {
	Cc["@mozilla.org/moz/jssubscript-loader;1"]
		.getService(Ci.mozIJSSubScriptLoader)
		.loadSubScript(uri);
}
include("chrome://dta/content/common/module.js");

// no not create DTA_Filter yourself, managed by DTA_FilterManager
function Filter(name, prefs) {
	this._id = name;
	this._prefs = prefs;
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
		
		this._modified = true;		
	},
	_makeRegs: function FM__makeRegs(str) {
	
		str = str.replace(/^\s+|\s+$/g, '');
		
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
			.replace(/([/{}()\[\]\\^$.])/g, "\\$1")
			.replace(/\*/g, ".*")
			.replace(/\?/g, '.');
		if (str.length) {				
			this._regs.push(new RegExp(str, 'i'));
		}
	},

	// exported
	get active() {
		return this._active;
	},
	set active(value) {
		if (this._active == value) {
			return;
		}
		this._active = value;
		this._modified = true;
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
			return;
		}
		return this._regs.some(
			function(reg) {
				return str.search(reg) != -1;
			}
		);
	},

	/**
	 * @throws Exception in case loading failed
	 */
	load: function F_load(localizedLabel) {
		this._localizedLabel = localizedLabel;
		this._label = this.getMultiBytePref(this.pref('label'));
		if (!this._label || !this._label.length) {
			throw Components.Exception("Empty filter!");
		}
		// localize the label, but only if user didn't change it.
		if (localizedLabel && !this._prefs.prefHasUserValue(this.pref('label'))) {
			this._label = localizedLabel;
		}
		
		this._active = this._prefs.getBoolPref(this.pref('active'));
		this._type = this._prefs.getIntPref(this.pref('type'));
		this._defFilter = this._id.search(/^deffilter/) != -1;
		
		// may throw
		this.expression = this.getMultiBytePref(this.pref('test'));
		
		this._modified = false;
	},

	// exported
	save: function F_save() {
		if (!this._prefs) {
			throw NS_ERROR_INVALID_ARG;
		}
		if (!this._modified) {
			return;
		}
		this._prefs.setBoolPref(this.pref('active'), this._active);
		
		this.setMultiBytePref(this.pref('test'), this._expr);
		this._prefs.setIntPref(this.pref('type'), this._type);
			
		// save this last as FM will test for it.
		this.setMultiBytePref(this.pref('label'), this._label);

		this._modified = false;
	},

	_reset: function F_reset() {
		// BEWARE: 1.8, no implementation for resetBranch
		var c = {value: 0};
		var prefs = this._prefs.getChildList(this._id, c);
		for (var i = 0; i < c.value; ++i) {
			if (this._prefs.prefHasUserValue(prefs[i])) {
				this._prefs.clearUserPref(prefs[i]);
			}
		}
	},

	// exported
	restore: function F_restore() {
		if (!this._defFilter) {
			throw new Components.Exception("only default filters can be restored!");
		}
		this._reset();
	},

	// exported
	remove: function F_remove() {
		if (this._defFilter) {
			throw new Components.Exception("default filters cannot be deleted!");
		}
		this._reset();
	},

	getMultiBytePref: function F_getMultiBytePref(pref) {
		var rv = this._prefs.getComplexValue(
			pref,
			Ci.nsISupportsString
		);
		return rv.data;
	},

	setMultiBytePref: function F_setMultiBytePref(pref, value) {
		var str = Cc["@mozilla.org/supports-string;1"]
			.createInstance(Ci.nsISupportsString);
		str.data = value;
		this._prefs.setComplexValue(
			pref,
			Ci.nsISupportsString,
			str
		);
	},
	toString: function() {
		return this._label + " (" + this._id + ")";
	},
	toSource: function() {
		return this.toString() + ": " + this._regs.toSource();
	}
};
implementComponent(
	Filter.prototype,
	Components.ID("{1CF86DC0-33A7-43b3-BDDE-7ADC3B35D114}"),
	"@downthemall.net/filter;2",
	"DownThemAll! Filter",
	[Ci.dtaIFilter]
);

function FilterEnumerator(filters) {
	this._filters = filters;
	this._idx = 0;
}
FilterEnumerator.prototype = {
	QueryInterface: function FE_QI(iid) {
		if (
			iid.equals(Ci.nsISupports)
			|| iid.equals(Ci.nsISimpleEnumerator)
		) {
			return this;
		}
		throw NS_ERROR_NO_INTERFACE;
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

// XXX: reload() should be called delayed when we observe changes (as many changes might come in)
var FilterManager = {
	_done: true,
	_mustReload: true,
	
	_prefs: Cc['@mozilla.org/preferences-service;1']
		.getService(Ci.nsIPrefService)
		.getBranch("extensions.dta.filters."),
	
	_timer: Cc['@mozilla.org/timer;1']
			.createInstance(Ci.nsITimer),

	init: function FM_init() {
		this._prefs = this._prefs.QueryInterface(Ci.nsIPrefBranch2);

		// load those localized labels for default filters.
		this._localizedLabels = {};
		var b = Cc['@mozilla.org/intl/stringbundle;1']
			.getService(Ci.nsIStringBundleService)
			.createBundle("chrome://dta/locale/filters.properties");
		var e = b.getSimpleEnumeration();
		while (e.hasMoreElements()) {
			var prop = e.getNext().QueryInterface(Ci.nsIPropertyElement);
			this._localizedLabels[prop.key] = prop.value;
		}

		// register (the observer) and initialize our timer, so that we'll get a reload event.
		this.register();
		this._timer.initWithCallback(
			this,
			100,
			this._timer.TYPE_ONE_SHOT
		);
		this.init = new Function();
	},

	_delayedReload: function FM_delayedReload() {
		this._mustReload = true;
		this._timer.delay = 100;
	},

	get count() {
		return this._count;
	},

	reload: function FM_reload() {
		if (!this._mustReload) {
			return;
		}
		this._mustReload = false;

		this._filters = {};
		this._all = [];
		this._count = 0;

		// hmmm. since we use uuids for the filters we've to enumerate the whole branch.
		var c = {value: 0};
		var prefs = this._prefs.getChildList('', c);

		for (var i = 0; i < c.value; ++i) {
			// we test for label (as we get all the other props as well)
			if (prefs[i].search(/\.label$/) == -1) {
				continue;
			}
			// cut of the label part to get the actual name
			var name = prefs[i].slice(0, -6);

			try {
				var filter = new Filter(name, this._prefs);
				// overwrite with localized labels.
				var localizedLabel = null;
				if (filter.id in this._localizedLabels) {
					localizedLabel = this._localizedLabels[filter.id];
				}
				filter.load(localizedLabel);
				this._filters[filter.id] = filter;
				this._all.push(filter);
				this._count++;
			}
			catch (ex) {
				debug("Failed to load: " + name + " / " + ex);
			}
		}
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
		this._active = this._all.filter(function(f) { return f.active; });

		// notify all observers
		var observerService = Cc["@mozilla.org/observer-service;1"]
			.getService(Ci.nsIObserverService);
		observerService.notifyObservers(this, 'DTA:filterschanged', null);
	},

	enumAll: function FM_enumAll() {
		return new FilterEnumerator(this._all);
	},
	enumActive: function FM_enumActive(type) {
		return new FilterEnumerator(
			this._active.filter(
				function(i) {
					return i.type & type;
				}
			)
		);
	},

	getFilter: function FM_getFilter(id) {
		if (id in this._filters) {
			return this._filters[id];
		}
		throw new Exception("invalid filter specified: " + id);
	},

	matchActive: function FM_matchActive(test, type) {
		return this._active.some(function(i) { return (i.type & type) && i.match(test); });
	},

	create: function FM_create(label, expression, active, type) {

		// we will use unique ids for user-supplied filters.
		// no need to keep track of the actual number of filters or an index.
		var uuid = Cc["@mozilla.org/uuid-generator;1"]
			.getService(Ci.nsIUUIDGenerator)
			.generateUUID();

		//
		var filter = new Filter(uuid.toString(), this._prefs);
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
		throw new Components.Exception('filter not defined!');
	},

	save: function FM_save() {
		for each (var f in this._all) {
			try {
				f.save();
			}
			catch (ex) {
				debug(ex);
			}
		}
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
		this._delayedReload();
	},

	// own stuff
	register: function FM_register() {
		try {
			// Put self as observer to desired branch
			this._prefs.addObserver("", this, true);
		}
		catch (ex) {
			error(ex);
			return false;
		}
		return true;
	},

	// nsITimerCallback
	notify: function FM_notify() {
		//error("DTAFM: notify");
		this.reload();
	}
};
implementComponent(
	FilterManager,
	Components.ID("{435FC5E5-D4F0-47a1-BDC1-F325B78188F3}"),
	"@downthemall.net/filtermanager;2",
	"DownThemAll! Filtermanager",
	[Ci.nsITimerCallback, Ci.nsIObserver, Ci.dtaIFilterManager]
);

// entrypoint
function NSGetModule(compMgr, fileSpec) {
	return new ServiceModule(FilterManager, false);
}