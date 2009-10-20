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
 * The Original Code is the DownThemAll! Privacy component.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2006
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

this.__defineGetter__(
	'Preferences',
	function() {
		let prefs = {}
		module('resource://dta/preferences.jsm', prefs);
		delete this.Preferences;
		return (this.Preferences = prefs); 
	}
);

this.__defineGetter__(
	'Observers',
	function() {
		let obs = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
		delete this.Observers;
		return (this.Observers = obs); 
	}
);
function PrivacyControl() {};
PrivacyControl.prototype = {
	classDescription: "DownThemAll! Privacy Control",
	contractID: "@downthemall.net/privacycontrol;1",
	classID: Components.ID("db7a8d60-a4c7-11da-a746-0800200c9a66"),		
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference, Ci.nsIWeakReference]),				
	_xpcom_categories: [{category: 'app-startup', service: true}],		

	init: function() {
		Observers.addObserver(this, 'profile-change-teardown', false);
		Observers.addObserver(this, 'xpcom-shutdown', false);
	},
	dispose: function() {
		// always remove observers ;)
		Observers.removeObserver(this, 'profile-change-teardown');
		Observers.removeObserver(this, 'xpcom-shutdown');
	},
	observe: function(subject, topic, data) {
		switch (topic) {
		case 'app-startup':
			this.init();
			break;
			
		case 'xpcom-shutdown':
			this.dispose();
			break;

		case 'profile-change-teardown':
			this.onShutdown();
			break;

		case 'sanitize':
			this.sanitize();
			break;

		case 'clean':
			this.clean();
			break;
		}
	},

	clean: function() {
		debug('clean()');
		
		// Cleaning prefs
		for each (let e in ['directory', 'filter', 'renaming']) {
			try {
				resetExt.resetExt(e);
			}
			catch (ex) {
				debug("Cannot clear pref: " + e, ex);
			}
		}
		
		// Cleaning files
		try {
			let prof = Cc["@mozilla.org/file/directory_service;1"]
				.getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
			for each (let e in ['dta_history.xml', 'dta_log.txt', 'dta_queue.sqlite']) {
				try {
					var file = prof.clone();
					file.append(e);
					if (file.exists()) {
						file.remove(false);
					}
				}
				catch (ex) {
					debug('Cannot remove: ' + e, ex);
				}
			}
		}
		catch (oex) {
			debug('failed to clean files: ', oex);
		}
	},

	sanitize : function() {
		debug("sanitize()");
		let branch = Preferences.getBranch('privacy.');

		// in case UI should be used the cleaning will be processed there.
		// Furthermore we have to ensure user wants us to sanitize.
		if (!branch.getBoolPref('sanitize.promptOnSanitize')
			&& branch.getBoolPref('item.extensions-dta')){
			this.clean(prefs);
		}
	},

	onShutdown : function() {
		let branch = Preferences.getBranch('privacy.');

		// has user pref'ed to sanitize on shutdown?
		if (branch.getBoolPref('sanitize.sanitizeOnShutdown')){
			this.sanitize();
		}
	}
};

function NSGetModule(mgr, spec) XPCOMUtils.generateModule([PrivacyControl]);