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

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const module = Components.utils.import;
const error = Components.utils.reportError;

module("resource://gre/modules/XPCOMUtils.jsm");

this.__defineGetter__(
	'Preferences',
	function() {
		let prefs = {}
		module('resource://dta/preferences.jsm', prefs);
		delete this.Preferences;
		return (this.Preferences = prefs); 
	}
);


function log(str, ex) {
	try {
		let _debugServ = Components.classes['@downthemall.net/debug-service;1']
			.getService(Components.interfaces.dtaIDebugService);
		log = function(str, ex) {
			if (ex) {
				_debugServ.log(str, ex);
			}
			else {
				_debugServ.logString(str);
			}
		}
		log(str, ex);
	}
	catch (oex) {
		error(str + ": " + ex);
	}
}


function MigrationService() {}
MigrationService.prototype = {
	classDescription: "DownThemAll! Migration Service",
	contractID: "@downthemall.net/migration-service;1",
	classID: Components.ID("F66539C8-2590-4e69-B189-F9F8595A7670"),
	_xpcom_categories: [{category: 'app-startup', service: true}],
	
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference, Ci.nsIWeakReference, Ci.nsIWindowMediatorListener]),
	
	QueryReferent: function(iid) this.QueryInterface(iid),
	GetWeakReference: function() this,
	
	get _os() {
		return Cc['@mozilla.org/observer-service;1']
			.getService(Ci.nsIObserverService);
	},
	
	_mediator: {},

	_migrate: function MM_migrate() {
		let DTA = {};
		module('resource://dta/version.jsm', DTA);		
		
		try {
			log("current " + DTA.VERSION);

			let lastVersion = Preferences.getExt('version', '0');
			if (0 == DTA.compareVersion(DTA.BASE_VERSION, lastVersion)) {
				return;
			}
			log("MigrationManager: migration started");
			if (DTA.compareVersion(lastVersion, "1.0.1") < 0) {
				this._execute(['ResetMaxConnections']);
			}			
			
			Preferences.setExt('version', DTA.BASE_VERSION);

			module('resource://dta/mediator.jsm', this._mediator);
			this._mediator.addListener(this);
		}
		catch(ex) {
			log("MigrationManager:", ex);
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
				log('MigrationManager: failed to migrate ' + e, ex);
			}
		}
	},
	
	// 1.0.1: #613 Multiple "slow-down" reports
	_migrateResetMaxConnections: function() {
		log("resetting connection prefs");
		for each (let e in ['network.http.max-connections', 'network.http.max-connections-per-server', 'network.http.max-persistent-connections-per-server']) {
			Preferences.reset(e);
		}
	},
	
	// nsIObserver
	observe: function MM_observe(subject, topic, prefName) {
		if (topic == 'app-startup') {
			try {
				this._os.removeObserver(this, 'app-startup');
			}
			catch (ex) { /* no-op */ }
			this._os.addObserver(this, 'final-ui-startup', false);
		}
		
		else if (topic == "final-ui-startup") {
			try {
				this._os.removeObserver(this, 'final-ui-startup');
			}
			catch (ex) { /* no-op */ }			
			this._migrate();
		}
	},
	onWindowTitleChange: function() {},
	onOpenWindow: function(window) {
		try {
		let dw = window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal);
		let tp = this;
		this._loadFunc = function() {
			dw.removeEventListener('load', tp._loadFunc, false);
			dw.setTimeout(function() { tp.onWindowLoad(dw); }, 600);
		};
		dw.addEventListener('load', this._loadFunc, false);
		}
		catch (ex) {
			log(ex);
		}
	},
	onCloseWindow: function() {},
	onWindowLoad: function(window) {
		log("loaded: " + window.location);
		if (this._loaded) {
			return;
		}
		if (this._mediator.tryOpenUrl(window, 'about:downthemall')) {
			this._loaded = true;
			this._mediator.removeListener(this);
		}
	}
};

function NSGetModule(aCompMgr, aFileSpec) XPCOMUtils.generateModule([MigrationService]);