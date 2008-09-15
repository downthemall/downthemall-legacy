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
	Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
		.getService(Components.interfaces.mozIJSSubScriptLoader)
		.loadSubScript(uri);
}
include('chrome://dta/content/common/xpcom.jsm');

var Preferences = {};

var MigrationService = {
	_init: function MM_init() {
	    // observer registration
	    Cc['@mozilla.org/observer-service;1']
				.getService(Ci.nsIObserverService)
				.addObserver(this, "final-ui-startup", true);
	},
	
	_migrate: function MM_migrate() {
		let DTA = {};
		Components.utils.import('resource://dta/version.jsm', DTA);		
		Components.utils.import('resource://dta/preferences.jsm', Preferences);
		include("chrome://dta/content/common/overlayFunctions.js");
		
		try {
			debug("current " + DTA.VERSION);

			let lastVersion = Preferences.getExt('version', '0');
			if (0 == DTA.compareVersion(DTA.BASE_VERSION, lastVersion)) {
				return;
			}
			debug("MigrationManager: migration started");
			if (DTA.compareVersion(lastVersion, "1.0a1") < 0) {
				this._execute(['Prefs', 'DropDowns', 'Filters', 'Remove']);
			}
			if (DTA.compareVersion(lastVersion, "1.0.1") < 0) {
				this._execute(['ResetMaxConnections']);
			}			
    	var params = Components.classes["@mozilla.org/embedcomp/dialogparam;1"]
				.createInstance(Components.interfaces.nsIDialogParamBlock);
    	params.SetNumberStrings(1);
    	params.SetString(0, DTA.BASE_VERSION);
    	let mediator = {};
    	Components.utils.import('resource://dta/mediator.jsm', mediator);
    	mediator.showNotice(null, params);		
		}
		catch(ex) {
			debug("MigrationManager:", ex);
			try {
				Preferences.resetExt("version");
			}
			catch (ex) {
				// XXX
			}
		}
	},
	_execute: function MM_execute(types) {
		for each (let e in types) {
			try {
				this['_migrate' + e]();
			}
			catch (ex) {
				debug('MigrationManager: failed to migrate ' + e, ex);
			}
		}
	},
	
	// pre-1.0: convert prefs
	_migratePrefs: function MM_migratePrefs() {
		debug("migrating prefs");
		const toMigrate = [
			['context.infophrases', 'infophrases', true],
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
		for each (let [oldName, newName, defaultValue] in toMigrate) {
			try {
				let nv = Preferences.getExt(newName, defaultValue);
				let ov = Preferences.getExt(oldName, nv);
				if (ov != nv) {	
					Preferences.setExt(newName, ov);
				}
				Preferences.reset(oldName);				
			}
			catch (ex) {
				debug('MM: failed ' + newName + ", ", ex);
			}
		}
	},
	
	// 1.0.1: #613 Multiple "slow-down" reports
	_migrateResetMaxConnections: function() {
		debug("resetting connection prefs");
		for each (let e in ['network.http.max-connections', 'network.http.max-connections-per-server', 'network.http.max-persistent-connections-per-server']) {
			Preferences.reset(e);
		}
	},
	
	// pre 1.0: migrate Filters
	_migrateFilters: function MM_migrateFilters() {
		debug("migrating filters");
		const defFilters = [
			"/\./", "/\\./", '/(\\.*)/',
			"/\\/[^\\/\\?]+\\.(z(ip|\\d{2})|r(ar|\\d{2})|jar|bz2|gz|tar|rpm)$/", "/\\/[^\\/\\?]+\\.(z(ip|[0-9]{2})|r(ar|[0-9]{2})|jar|bz2|gz|tar|rpm)$/", "/(\\.(z(ip|[0-9]{2})|r(ar|[0-9]{2})|jar|bz2|gz|tar|rpm))$/",
			"/\\/[^\\/\\?]+\\.(mp(eg?|[g4])|rm|avi|mov|divx|asf|qt|wmv|ram|m1v|m2v|rv|vob|asx)$/", "/(\\.(mpeg|rm|mpe|avi|mpg|mp4|mov|divx|asf|qt|wmv|ram|m1v|m2v|rv|vob|asx))$/",
			"/\\/[^\\/\\?]+\\.(jpe?g|jpe|gif|png|tiff?|bmp|ico)$/",
			"/\\/[^\\/\\?]+\\.(jpe?g|jpe)$/", '/\\.jp(?:e|e?g|2)$/',
			"/\\/[^\\/\\?]+\\.gif$/",
			"/\\/[^\\/\\?]+\\.png$/"
		];
		const LINK_FILTER = Ci.dtaIFilter.LINK_FILTER;
		const IMAGE_FILTER = Ci.dtaIFilter.IMAGE_FILTER;
		const prefs = Cc['@mozilla.org/preferences-service;1']
			.getService(Components.interfaces.nsIPrefService)
			.getBranch("extensions.dta.context.")
			.QueryInterface(Components.interfaces.nsIPrefBranch2);
		var c = {value: 0};
		var children = prefs.getChildList('', c);
		for (let i = 0; i < c.value; ++i) {
			if (!children[i].match(/filter\d+\.caption/)) {
				continue;
			}
			var name = 'context.' + children[i].slice(0, -8);
			try {
				var reg = Preferences.getExt(name + '.filter', '');
				if (-1 != defFilters.indexOf(reg) || !reg.length) {
					continue;
				}
				var label = Preferences.getExt(name + '.caption', 'imported');
				var active = Preferences.getExt(name + '.checked', false);
				var type = 0;
				if (Preferences.getExt(name + '.isImageFilter', false)) {
					type |= IMAGE_FILTER;
				}
				if (Preferences.getExt(name + '.isLinkFilter', false)) {
					type |= LINK_FILTER;
				}
				DTA_FilterManager.create(label, reg, active, type, true);
			}
			catch (ex) {
				debug("failed to migrate filter", ex);
			}
		}
	},
	
	// pre 1.0: dropdown history
	_migrateDropDowns: function MM_migrateDropdowns() {
		debug("migrating dropdowns");
		for each (let e in ['renaming', 'filter', 'directory']) {
			try {
				Preferences.resetExt(e);
			}
			catch (ex) {
				/*no-op*/
			}
			try {
				let cv = Preferences.getExt('dropdown.' + e + '-history', null);
				if (cv == null) {
					return;
				}
				cv = cv.split('|@|');
				Preferences.setExt(e, cv.toSource());
			}
			catch (ex) {
				debug("failed to migrate dropdown " + e, ex);
			}
		}
	},
	
	// all: remove all prefs
	_migrateRemove: function MM_migrateRemove() {
		for each (let e in ['context.', 'tool.', 'dropdown.', 'windows.', 'rename.']) {
			Preferences.resetBranchExt(e);
		}
	},
	
	// nsIObserver
	observe: function MM_observe(subject, topic, prefName) {
		if (topic == "final-ui-startup") {
			this._migrate();
		}
	}
};
implementComponent(
	MigrationService,
	Components.ID("{F66539C8-2590-4e69-B189-F9F8595A7670}"),
	"@downthemall.net/migration-service;1",
	"DownThemAll! Migration Service",
	[Ci.nsIObserver]
);
MigrationService._init();

// entrypoint
function NSGetModule(compMgr, fileSpec) {
	return new ServiceModule(MigrationService, true);
}