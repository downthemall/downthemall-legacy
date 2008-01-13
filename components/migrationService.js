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
 * The Original Code is DownThemAll! Migration Service.
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

function include(uri) {
	CC["@mozilla.org/moz/jssubscript-loader;1"]
		.getService(CI.mozIJSSubScriptLoader)
		.loadSubScript(uri);
}
 
const CC = Components.classes;
const CI = Components.interfaces;
const error = Components.utils.reportError;

var MigrationService = {

	// nsIClassInfo
	classID: Components.ID("{F66539C8-2590-4e69-B189-F9F8595A7670}"),
	contractID: "@downthemall.net/migration-service;1",
	classDescription: "DownThemAll! Migration Service",
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
				CI.nsIClassInfo
			].some(function(e) { return iid.equals(e); });
	},

	_init: function MM_init() {
    // observer registration
    CC['@mozilla.org/observer-service;1']
			.getService(CI.nsIObserverService)
			.addObserver(this, "final-ui-startup", true);
	},
	
	_migrate: function MM_migrate() {
		include("chrome://dta/content/common/verinfo.js");
		include("chrome://dta/content/common/overlayFunctions.js");
		
		try {
			DTA_debug.logString("current " + DTA_VERSION);
			var vc = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
				.getService(Components.interfaces.nsIVersionComparator);
		
			var lastVersion = DTA_preferences.getDTA('version', '0');
			if (0 == vc.compare(DTA_VERSION, lastVersion)) {
				return;
			}
			DTA_debug.logString("MigrationManager: migration started");
			if (vc.compare(lastVersion, "1.0a1") < 0) {
				this._execute(['Prefs', 'DropDowns', 'Filters', 'Remove']);
			}
    	var params = Components.classes["@mozilla.org/embedcomp/dialogparam;1"]
				.createInstance(Components.interfaces.nsIDialogParamBlock);
    	params.SetNumberStrings(1);
    	params.SetString(0, DTA_VERSION);
    	Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
				.getService(Components.interfaces.nsIWindowWatcher)
    		.openWindow(
	    		null,
	    		"chrome://dta/content/about/notice.xul",
	    		"_blank",
	    		"chrome,centerscreen,all,alwaysRaised,dialog,modal",
	    		params
	    	);			
		}
		catch(ex) {
			DTA_debug.log("MigrationManager:", ex);
			try {
				DTA_preferences.resetDTA("version");
			}
			catch (ex) {
				// XXX
			}
		}
	},
	_execute: function MM_execute(types) {
		types.forEach(
			function(e) {
				try {
					this['_migrate' + e]();
				}
				catch (ex) {
					error('MigrationManager: failed to migrate ' + e + ", " + ex);
				}
			},
			this
		);
	},
	
	// pre-1.0: convert prefs
	_migratePrefs: function MM_migratePrefs() {
		DTA_debug.logString("migrating prefs");
		const toMigrate = [
			['context.infophrases', 'infophrases', true],
			['context.closetab', 'closetab', false],
			['context.closedta', 'closedta', false],
			['context.menu', 'ctxmenu', ''],
			['context.compact', 'ctxcompact', false],
			['tool.menu', 'toolsmenu', ''],
			['tool.compact', 'toolscompact', false],
			['context.history', 'history',5],
			['context.downloadWin', 'downloadWin', true],
			['context.ntask', 'ntask', 4],
			['context.maxchunks', 'maxchunks', 5],
			['context.reduce', 'showonlyfilenames', true],
			['context.saveTemp', 'saveTemp', true],
			['context.tempLocation', 'tempLocation', ''],
			['context.seltab', 'seltab', 0],
			['context.timeout', 'timeout', 300],
			['directory.visibledump', 'logging', false],
			['context.removeaborted', 'removeaborted', false],
			['context.removecanceled', 'removecanceled', false],
			['context.removecompleted', 'removecompleted', true],
			['numistance', 'counter', 0]
		];
		toMigrate.forEach(
			function(e) {
				try {
					var oldName = e[0], newName = e[1], defaultValue = null;
					if (e.length == 3) {
						defaultValue = e[2];
					}
					var nv = DTA_preferences.getDTA(newName, defaultValue);
					var ov = DTA_preferences.getDTA(oldName, nv);
					if (ov != nv) {	
						DTA_preferences.setDTA(newName, ov);
					}
				}
				catch (ex) {
					error('MM: failed ' + newName + ", " + ex);
				}
			},
			this
		);
	},
	
	// pre 1.0: migrate Filters
	_migrateFilters: function MM_migrateFilters() {
		DTA_debug.log("migrating filters");
		const defFilters = [
			"/\./", "/\\./", '/(\\.*)/',
			"/\\/[^\\/\\?]+\\.(z(ip|\\d{2})|r(ar|\\d{2})|jar|bz2|gz|tar|rpm)$/", "/\\/[^\\/\\?]+\\.(z(ip|[0-9]{2})|r(ar|[0-9]{2})|jar|bz2|gz|tar|rpm)$/", "/(\\.(z(ip|[0-9]{2})|r(ar|[0-9]{2})|jar|bz2|gz|tar|rpm))$/",
			"/\\/[^\\/\\?]+\\.(mp(eg?|[g4])|rm|avi|mov|divx|asf|qt|wmv|ram|m1v|m2v|rv|vob|asx)$/", "/(\\.(mpeg|rm|mpe|avi|mpg|mp4|mov|divx|asf|qt|wmv|ram|m1v|m2v|rv|vob|asx))$/",
			"/\\/[^\\/\\?]+\\.(jpe?g|jpe|gif|png|tiff?|bmp|ico)$/",
			"/\\/[^\\/\\?]+\\.(jpe?g|jpe)$/", '/\\.jp(?:e|e?g|2)$/',
			"/\\/[^\\/\\?]+\\.gif$/",
			"/\\/[^\\/\\?]+\\.png$/"
		];
		const LINK_FILTER = CI.dtaIFilter.LINK_FILTER;
		const IMAGE_FILTER = CI.dtaIFilter.IMAGE_FILTER;
		const prefs = CC['@mozilla.org/preferences-service;1']
			.getService(Components.interfaces.nsIPrefService)
			.getBranch("extensions.dta.context.")
			.QueryInterface(Components.interfaces.nsIPrefBranch2);
		var c = {value: 0};
		var children = prefs.getChildList('', c);
		for (var i = 0; i < c.value; ++i) {
			if (!children[i].match(/filter\d+\.caption/)) {
				continue;
			}
			var name = 'context.' + children[i].slice(0, -8);
			try {
				var reg = DTA_preferences.getMultiByteDTA(name + '.filter', '');
				if (-1 != defFilters.indexOf(reg) || !reg.length) {
					continue;
				}
				var label = DTA_preferences.getMultiByteDTA(name + '.caption', 'imported');
				var active = DTA_preferences.getDTA(name + '.checked', false);
				var type = 0;
				if (DTA_preferences.getDTA(name + '.isImageFilter', false)) {
					type |= IMAGE_FILTER;
				}
				if (DTA_preferences.getDTA(name + '.isLinkFilter', false)) {
					type |= LINK_FILTER;
				}
				DTA_FilterManager.create(label, reg, active, type, true);
			}
			catch (ex) {
				error("failed to migrate filter," + ex);
			}
		}
	},
	
	// pre 1.0: dropdown history
	_migrateDropDowns: function MM_migrateDropdowns() {
		DTA_debug.logString("migrating dropdowns");
		['renaming', 'filter', 'directory'].forEach(
			function(e) {
				try { DTA_preferences.resetDTA(e); } catch (ex) { /*no-op*/ }
				try {
						var cv = DTA_preferences.getMultiByteDTA('dropdown.' + e + '-history', null);
						if (cv == null) {
							return;
						}
						cv = cv.split('|@|');
						DTA_preferences.setMultiByteDTA(e, cv.toSource());
				}
				catch (ex) {
					error("failed to migrate dropdown " + e + ", " + ex);
				}
			},
			this
		);
	},
	
	// all: remove all prefs
	_migrateRemove: function MM_migrateRemove() {
		['context.', 'tool.', 'dropdown.', 'windows.', 'rename.'].forEach(function(e) { DTA_preferences.resetBranch(e); });
	},
	
		// nsiSupports
	QueryInterface: function MM_QI(iid) {
		if (this.implementsIID(iid)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},

	// nsiWeakReference
	QueryReferent: function MM_QR(iid) {
		return this;
	},

	// nsiSupportsWeakReference
	GetWeakReference: function MM_GWR() {
		return this;
	},

	// nsIObserver
	observe: function MM_observe(subject, topic, prefName) {
		if (topic == "final-ui-startup") {
			this._migrate();
		}
	}
};
MigrationService._init();

var Module = {
	_firstTime: true,

	registerSelf: function M_registerSelf(compMgr, fileSpec, location, type) {
		if (!this._firstTime) {
			return;
		}
		this._firstTime = false;

		compMgr.QueryInterface(CI.nsIComponentRegistrar)
			.registerFactoryLocation(
				MigrationService.classID,
				MigrationService.classDescription,
				MigrationService.contractID,
				fileSpec,
				location,
				type
			);
		CC['@mozilla.org/categorymanager;1']
			.getService(CI.nsICategoryManager)
			.addCategoryEntry('app-startup', MigrationService.contractID, MigrationService.contractID, true, true, null);
	},
	unregisterSelf: function(compMgr, fileSpec, location) {
		compMgr.QueryInterface(CI.nsIComponentRegistrar)
			.unregisterFactoryLocation(
				MigrationService.classID,
				fileSpec
			);
		CC['@mozilla.org/categorymanager;1']
			.getService(CI.nsICategoryManager)
			.deleteCategoryEntry('app-startup', MigrationService.contractID, true);
	},
	getClassObject: function (compMgr, cid, iid) {
		if (cid.equals(MigrationService.classID)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	canUnload: function(compMgr) {
		return true;
	},

	// nsIFactory
	QueryInterface : function(aIID) {
		if (aIID.equals(CI.nsIFactory)) {
			return this;
		}

		return Components.results.NS_ERROR_NO_INTERFACE;
	},
	createInstance: function (outer, iid) {
		if (outer != null) {
			throw Components.results.NS_ERROR_NO_AGGREGATION;
		}
		if (MigrationService.implementsIID(iid)) {
			return MigrationService;
		}
		throw Components.results.NS_ERROR_INVALID_ARG;
	}
}

// entrypoint
function NSGetModule(compMgr, fileSpec) {
	return Module;
}