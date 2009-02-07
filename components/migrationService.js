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
		
		try {
			debug("current " + DTA.VERSION);

			let lastVersion = Preferences.getExt('version', '0');
			if (0 == DTA.compareVersion(DTA.BASE_VERSION, lastVersion)) {
				return;
			}
			debug("MigrationManager: migration started");
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
	
	// 1.0.1: #613 Multiple "slow-down" reports
	_migrateResetMaxConnections: function() {
		debug("resetting connection prefs");
		for each (let e in ['network.http.max-connections', 'network.http.max-connections-per-server', 'network.http.max-persistent-connections-per-server']) {
			Preferences.reset(e);
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