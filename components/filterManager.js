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
const ctor = Components.Constructor;
const module = Components.utils.import;
const error = Components.utils.reportError; 

module("resource://gre/modules/XPCOMUtils.jsm");

const Exception = Components.Exception;
const BASE = 'extensions.dta.filters.';

const NS_ERROR_NO_INTERFACE = Cr.NS_ERROR_NO_INTERFACE;
const NS_ERROR_FAILURE = Cr.NS_ERROR_FAILURE;
const NS_ERROR_NO_AGGREGATION = Cr.NS_ERROR_NO_AGGREGATION;
const NS_ERROR_INVALID_ARG = Cr.NS_ERROR_INVALID_ARG;

const LINK_FILTER = Ci.dtaIFilter.LINK_FILTER;
const IMAGE_FILTER = Ci.dtaIFilter.IMAGE_FILTER;
const TOPIC_FILTERSCHANGED = 'DTA:filterschanged';

const nsITimer = Ci.nsITimer;
const Timer = ctor('@mozilla.org/timer;1', 'nsITimer', 'init');
 
let Preferences = {};

this.__defineGetter__(
	"debug",
	function() {
		try {
			let _ds = Cc['@downthemall.net/debug-service;1'].getService(Ci.dtaIDebugService);
			delete this.debug;
			return (this.debug = function(str, ex) {
				if (ex) {
					_ds.log(str, ex);
				}
				else {
					_ds.logString(str);
				}
			});
		}
		catch (ex) {
			return function(str, ex) {
				if (ex) {
					str += ", " + ex;
					error(str);
				}
			}
		}
	}
);

// no not create DTA_Filter yourself, managed by FilterManager
function Filter(name) {
	this._id = name;
}
Filter.prototype = {
	classDescription: "DownThemAll! Filter",
	contractID: "@downthemall.net/filter;1",
	classID: Components.ID("1CF86DC0-33A7-43b3-BDDE-7ADC3B35D114"),		
	QueryInterface: XPCOMUtils.generateQI([Ci.dtaIFilter]),		
	
	// exported
	get id() {
		return this._id.slice(BASE.length);
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
		this._label = Preferences.get(this.pref('label'));
		if (!this._label || !this._label.length) {
			throw Components.Exception("Empty filter!");
		}
		// localize the label, but only if user didn't change it.
		if (localizedLabel && !Preferences.hasUserValue(this.pref('label'))) {
			this._label = localizedLabel;
		}
				
		this._active = Preferences.get(this.pref('active'));
		this._type = Preferences.get(this.pref('type'));
		this._defFilter = this._id.search(/deffilter/) != -1;
		
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

		this._modified = false;
	},

	_reset: function F_reset() {
		Preferences.resetBranch(this._id);
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
function FilterManager() {};
FilterManager.prototype = {
	classDescription: "DownThemAll! Filtermanager",
	contractID: "@downthemall.net/filtermanager;2",
	classID: Components.ID("435FC5E5-D4F0-47a1-BDC1-F325B78188F3"),		
	QueryInterface: XPCOMUtils.generateQI([Ci.dtaIFilterManager, Ci.nsIObserver, Ci.nsISupportsWeakReference, Ci.nsIWeakReference]),				
	_xpcom_categories: [{category: 'app-startup', service: true}],

	QueryReferent: function(iid) this.QueryInterface(iid),
	GetWeakReference: function() this,
	
	get _os() {
		return Cc['@mozilla.org/observer-service;1']
			.getService(Ci.nsIObserverService);
	},	
	
	init: function FM_init() {
		module('resource://dta/preferences.jsm', Preferences);

		// load those localized labels for default filters.
		this._localizedLabels = {};
		let b = Cc['@mozilla.org/intl/stringbundle;1']
			.getService(Ci.nsIStringBundleService)
			.createBundle("chrome://dta/locale/filters.properties");
		let e = b.getSimpleEnumeration();
		while (e.hasMoreElements()) {
			let prop = e.getNext().QueryInterface(Ci.nsIPropertyElement);
			this._localizedLabels[prop.key] = prop.value;
		}
		
		// register (the observer) and initialize our timer, so that we'll get a reload event.
		this.reload();
		this.register();
	},
		
	_done: true,
	_mustReload: true,
	
	_timer: null,

	_delayedReload: function FM_delayedReload() {
		if (this._mustReload) {
			return;
		}
		this._mustReload = true;
		this._timer = new Timer(this, 100, nsITimer.TYPE_ONE_SHOT);
	},

	get count() {
		return this._count;
	},

	reload: function FM_reload() {
		debug("FM: reload requested");
		if (!this._mustReload) {
			return;
		}
		this._mustReload = false;
		

		this._filters = {};
		this._all = [];

		// hmmm. since we use uuids for the filters we've to enumerate the whole branch.
		for each (let pref in Preferences.getChildren(BASE)) {
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
				debug("Failed to load: " + name + " / ", ex);
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
		this._active = this._all.filter(function(f) { return f.active; });
		
		// notify all observers
		debug("FM: reload done");
		this._os.notifyObservers(this, TOPIC_FILTERSCHANGED, null);
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
		let uuid = Cc["@mozilla.org/uuid-generator;1"]
			.getService(Ci.nsIUUIDGenerator)
			.generateUUID();

		//
		let filter = new Filter(BASE + uuid.toString());
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
				debug('Failed to save filters', ex);
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
		if (topic == 'app-startup') {
			this._os.addObserver(this, 'final-ui-startup', true);
		}
		else if (topic == "final-ui-startup") {
			this._os.removeObserver(this, 'final-ui-startup');
			this.init();
		}
		else if (topic == 'timer-callback') {
			this.reload();
		}
		else {
			this._delayedReload();
		}
	},

	// own stuff
	register: function FM_register() {
		try {
			// Put self as observer to desired branch
			Preferences.addObserver(BASE, this);
		}
		catch (ex) {
			error(ex);
			return false;
		}
		return true;
	}
};

// entrypoint
function NSGetModule(compMgr, fileSpec) XPCOMUtils.generateModule([FilterManager]);