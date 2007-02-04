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
 * The Original Code is downTHEMall.
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

// var fm = Components.classes['@tn123.ath.cx/dtamod/filtermanager;1'].getService(Components.interfaces.dtaIFilterManager); var id = fm.create('a', 'b', false, 1, false); fm.remove(id);

const CC = Components.classes;
const CI = Components.interfaces;
const error = Components.utils.reportError;

function include(uri) {
	CC["@mozilla.org/moz/jssubscript-loader;1"]
		.getService(CI.mozIJSSubScriptLoader)
		.loadSubScript(uri);
}

include("chrome://dta/content/common/regconvert.js");

// no not create DTA_Filter yourself, managed by DTA_FilterManager
function Filter(name, prefs) {
	this._id = name;
	this._prefs = prefs;
}
Filter.prototype = {

	LINK_FILTER: (1 << 0),
	IMAGE_FILTER: (1 << 1),

	_modified: false,

	// nsIClassInfo
	classID: Components.ID("{3F872ADC-35A4-4c79-B771-F2BC130FB792}"),
	contractID: "@tn123.ath.cx/dtamod/filter;1",
	classDescription: "DownTHEMAll! Mod Filter",
	implementationLanguage: 0x02,
	flags: (1 << 2), // MAIN_THREAD_ONLY
	classIDNoAlloc: this.classID,
	getHelperForLanguage: function() {
		return null;
	},
	getInterfaces: function(count) {
		// XXX
		count.value = 0;
		return null;
	},

	QueryInterface: function F_QI(iid) {
		if (
			iid.equals(CI.nsISupports)
			|| iid.equals(CI.nsIClassInfo)
			|| iid.equals(CI.dtaIFilter)
		) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},

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
	get test() {
		return this._test;
	},
	set test(value) {
		if (this._defFilter) {
			throw new Components.Exception("default filters cannot be modified!");
		}
		if (this._test == value) {
			return;
		}
		try {
			this._test = value;
			this._createRegex();
		} catch (ex) {
			// hope we don't throw again ROFL
			this.isRegex = false;
			throw Components.Exception("Failed to create Regex");
		}
		this._modified = true;
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
	get isRegex() {
		return this._isRegex;
	},
	set isRegex(value) {
		if (this._defFilter) {
			throw new Components.Exception("default filters cannot be deleted!");
		}
		if (this._isRegex == value) {
			return;
		}
		try {
			this._isRegex = value;
			this._createRegex();
		} catch (ex) {
			// hope we don't throw again ROFL
			this.isRegex = false;
			throw Components.Exception("Failed to create Regex");
		}
		this._modified = true;
	},

	// exported
	get type() {
		return this._type;
	},
	set type(t) {
		if (this._defFilter) {
			throw new Components.Exception("default filters cannot be modified!");
		}
		if (this._type == t) {
			return;
		}
		this._type = t;
		this._modified = true;
	},

	_createRegex: function F_createRegex() {
		this._regex = this._isRegex ? DTA_regToRegExp(this._test) : DTA_strToRegExp(this._test);
	},

	pref: function F_pref(str) {
		return this._id + "." + str;
	},

	match: function F_match(str) {
		return str.search(this._regex) != -1;
	},

	/**
	 * @throws Exception in case loading failed
	 */
	load: function F_load(localizedLabel) {
		this._label = this.getMultiBytePref(this.pref('label'));
		if (!this._label || !this._label.length) {
			throw Components.Exception("Empty filter!");
		}
		// localize the label, but only if user didn't change it.
		if (localizedLabel || !this._prefs.prefHasUserValue(this.pref('label'))) {
			this._label = localizedLabel;
		}
		this._test = this.getMultiBytePref(this.pref('test'));
		this._active = this._prefs.getBoolPref(this.pref('active'));
		this._type = this._prefs.getIntPref(this.pref('type'));
		this._isRegex = this._prefs.getBoolPref(this.pref('regex'));
		this._defFilter = this._id.search(/deffilter\d+/) != -1;
		this._createRegex();
		this._modified = false;
	},

	// exported
	save: function F_save() {
		if (!this._modified) {
			return;
		}
		this._prefs.setBoolPref(this.pref('active'), this._active);

		// do not change defFilters
		if (!this.defFilter) {
			this.setMultiBytePref(this.pref('test'), this._test);
			this._prefs.setIntPref(this.pref('type'), this._type);
			this._prefs.setBoolPref(this.pref('regex'), this._isRegex);

		}
		// save this last as FM will test for it.
		this.setMultiBytePref(this.pref('label'), this._label);

		this._modified = false;
	},

	// exported
	remove: function F_remove() {
		// BEWARE: 1.8, no implementation for resetBranch
		if (this._defFilter) {
			throw new Components.Exception("default filters cannot be deleted!");
		}
		var c = {value: 0};
		var prefs = this._prefs.getChildList(this._id, c);
		for (var i = 0; i < c.value; ++i) {
			this._prefs.clearUserPref(prefs[i]);
		}
	},

	getMultiBytePref: function F_getMultiBytePref(pref) {
		var rv = this._prefs.getComplexValue(
			pref,
			CI.nsISupportsString
		);
		return rv.data;
	},

	setMultiBytePref: function F_setMultiBytePref(pref, value) {
		var str = CC["@mozilla.org/supports-string;1"]
			.createInstance(CI.nsISupportsString);
		str.data = value;
		this._prefs.setComplexValue(
			pref,
			CI.nsISupportsString,
			str
		);
	}
};

function FilterEnumerator(filters) {
	this._filters = filters;
	this._idx = 0;
	this._filters.sort(function(a,b) {
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
}
FilterEnumerator.prototype = {
	QueryInterface: function FE_QI(iid) {
		if (
			iid.equals(Components.intefaces.nsISupports)
			|| iid.equals(Components.intefaces.nsISimpleEnumerator)
		) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	hasMoreElements: function FE_hasMoreElements() {
		return this._idx < this._filters.length;
	},
	getNext: function FE_getNext() {
		if (!this.hasMoreElements()) {
			throw Components.results.NS_ERROR_FAILURE;
		}
		return this._filters[this._idx++];
	}
};

// XXX: reload() should be called delayed when we observe changes (as many changes might come in)
var FilterManager = {

	// nsIClassInfo
	classID: Components.ID("{3F872ADC-35A4-4c79-B771-F2BC130FB791}"),
	contractID: "@tn123.ath.cx/dtamod/filtermanager;1",
	classDescription: "DownTHEMAll! Mod Filtermanager",
	implementationLanguage: 0x02,
	flags: (1 << 0) | (1 << 2), // SINGLETON | MAIN_THREAD_ONLY
	classIDNoAlloc: this.classID,
	getHelperForLanguage: function() {
		return null;
	},
	getInterfaces: function(count) {
		// XXX
		count.value = 0;
		return null;
	},

	implementsIID: function FM_implementID(iid) {
			return [
				CI.nsISupports,
				CI.nsISupportsWeakReference,
				CI.nsIWeakReference,
				CI.nsIObserver,
				CI.nsIClassInfo,
				CI.nsITimerCallback,
				this.classID
			].some(function(e) { return iid.equals(e); });
	},

	_done: true,
	_mustReload: true,
	_prefs: CC['@mozilla.org/preferences-service;1']
		.getService(CI.nsIPrefService)
		.getBranch("extensions.dta.filters."),
	_timer: CC['@mozilla.org/timer;1']
			.createInstance(CI.nsITimer),

	_init: function FM_init() {
		this._prefs = this._prefs.QueryInterface(CI.nsIPrefBranch2);

		// load those localized labels for default filters.
		this._labels = {};
				var b = CC['@mozilla.org/intl/stringbundle;1']
			.getService(CI.nsIStringBundleService)
			.createBundle("chrome://dta/locale/filters.properties");
		var e = b.getSimpleEnumeration();
		while (e.hasMoreElements()) {
			var prop = e.getNext().QueryInterface(CI.nsIPropertyElement);
			this._labels[prop.key] = prop.value;
		}

		// register (the observer) and initialize our timer, so that we'll get a reload event.
		this.register();
		this._timer.initWithCallback(
			this,
			100,
			this._timer.TYPE_ONE_SHOT
		);
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

		//error("DTAFM: reload");
		this._filters = {};
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
				if (filter.id in this._labels) {
					localizedLabel = this._labels[filter.id];
				}
				filter.load(localizedLabel);
				this._filters[filter.id] = filter;
				this._count++;
			}
			catch (ex) {
				error("Failed to load: " + name + " / " + ex);
			}
		}

		// notify all observers
		var observerService = CC["@mozilla.org/observer-service;1"]
			.getService(CI.nsIObserverService);
		observerService.notifyObservers(this, 'DTA:filterschanged', null);
	},

	enumAll: function FM_enumAll() {
		var a = [];
		for (x in this._filters) {
			a.push(this._filters[x]);
		}
		return new FilterEnumerator(a);
	},
	enumActive: function FM_enumActive(type) {
		var a = [];
		for (x in this._filters) {
			if (this._filters[x].active && this._filters[x].type & type) {
				a.push(this._filters[x]);
			}
		}
		return new FilterEnumerator(a);
	},

	getFilter: function FM_getFilter(id) {
		if (id in this._filters) {
			return this._filters[id];
		}
		throw new Components.Exception("invalid filter specified: " + id);
	},

	matchActive: function FM_matchActive(test, type) {
		var e = this.enumActive(type);
		// we're a friend :p
		return e._filters.some(function(i) { return i.match(test); });
	},

	create: function FM_create(label, test, active, type, isRegex) {

		// we will use unique ids for user-supplied filters.
		// no need to keep track of the actual number of filters or an index.
		var uuid = CC["@mozilla.org/uuid-generator;1"]
			.getService(CI.nsIUUIDGenerator)
			.generateUUID();

		//
		var filter = new Filter(uuid.toString(), this._prefs);
		// I'm a friend, hence I'm allowed to access private members :p
		filter._label = label;
		filter._test = test;
		filter._active = active;
		filter._type = type;
		filter._modified = true;

		// this might throw!
		filter.isRegex = isRegex;

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
		var e = this.enumAll();
		while (e.hasMoreElements()) {
			var f = e.getNext();
			try {
				f.save();
			} catch (ex) {
				error(ex);
			}
		}
	},

		// nsiSupports
	QueryInterface: function FM_QI(iid) {
		if (this.implementsIID(iid)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},

	// nsiWeakReference
	QueryReferent: function FM_QR(iid) {
		return this;
	},

	// nsiSupportsWeakReference
	GetWeakReference: function FM_GWR() {
		return this;
	},

	// nsIObserver
	observe : function FM_observe(subject, topic, prefName) {
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
FilterManager._init();

var Module = {
	_firstTime: true,

	registerSelf: function M_registerSelf(compMgr, fileSpec, location, type) {
		if (!this._firstTime) {
			return;
		}
		this._firstTime = false;

		compMgr.QueryInterface(CI.nsIComponentRegistrar)
			.registerFactoryLocation(
				FilterManager.classID,
				FilterManager.classDescription,
				FilterManager.contractID,
				fileSpec,
				location,
				type
			);
		CC['@mozilla.org/categorymanager;1']
			.getService(CI.nsICategoryManager)
			.addCategoryEntry('app-startup', FilterManager.contractID, FilterManager.contractID, true, true, null);
	},
	unregisterSelf: function(compMgr, fileSpec, location) {
		compMgr.QueryInterface(CI.nsIComponentRegistrar)
			.unregisterFactoryLocation(
				FileManager.classID,
				fileSpec
			);
		CC['@mozilla.org/categorymanager;1']
			.getService(CI.nsICategoryManager)
			.deleteCategoryEntry('app-startup', FileManager.contractID, true);
	},
	getClassObject: function (compMgr, cid, iid) {
		if (cid.equals(FilterManager.classID)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	canUnload: function(compMgr) {
		return true;
	},

	// nsIFactory
	QueryInterace : function(aIID) {
		if (aIID.equals(CI.nsIFactory)) {
			return this;
		}

		return Components.results.NS_ERROR_NO_INTERFACE;
	},
	createInstance: function (outer, iid) {
		if (outer != null) {
			throw Components.results.NS_ERROR_NO_AGGREGATION;
		}
		if (FilterManager.implementsIID(iid)) {
			return FilterManager;
		}
		throw Components.results.NS_ERROR_INVALID_ARG;
	}
}

// entrypoint
function NSGetModule(compMgr, fileSpec) {
	return Module;
}