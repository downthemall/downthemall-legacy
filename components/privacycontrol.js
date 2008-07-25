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

function include(uri) {
	Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(
		Components.interfaces.mozIJSSubScriptLoader).loadSubScript(uri);
}
include('chrome://dta/content/common/xpcom.jsm');

var PrivacyControl = {
	initialize : function() {
		// install required observers, so that we may process on shutdown
		const	os = Components.classes['@mozilla.org/observer-service;1']
			.getService(Components.interfaces.nsIObserverService);
		os.addObserver(this, 'profile-change-teardown', false);
		os.addObserver(this, 'xpcom-shutdown', false);
	},
	dispose: function() {
		// always remove observers ;)
		const	os = Components.classes['@mozilla.org/observer-service;1']
			.getService(Components.interfaces.nsIObserverService);
		os.removeObserver(this, 'profile-change-teardown');
		os.removeObserver(this, 'xpcom-shutdown');
	},
	observe: function(subject, topic, data) {
		switch (topic) {
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
		var prefs = Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefService).getBranch(
				'extensions.dta.');
		for each (let e in ['directory', 'filter', 'renaming']) {
			try {
				prefs.clearUserPref(e);
			}
			catch (ex) {
				debug("Cannot clear pref: " + e, ex);
			}
		}
		
		// Cleaning files
		try {
			var prof = Components.classes["@mozilla.org/file/directory_service;1"]
				.getService(Components.interfaces.nsIProperties).get("ProfD",
					Components.interfaces.nsIFile);
			for each (let e in ['dta_history.xml', 'dta_log.txt', 'dta_queue.sqlite']) {
				try {
					var file = prof.clone();
					file.append(e);
					if (file.exists()) {
						file.remove(false);
					}
				}
				catch (ex) {
					debug('cannot remove: ' + e, ex);
				}
			}
		}
		catch (oex) {
			debug('failed to clean files: ', oex);
		}
	},

	sanitize : function() {
		debug("sanitize()");
		const prefs = Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefService).getBranch('privacy.');

		// in case UI should be used the cleaning will be processed there.
		// Furthermore we have to ensure user wants us to sanitize.
		if (!prefs.getBoolPref('sanitize.promptOnSanitize')
			&& prefs.getBoolPref('item.extensions-dta')){
				this.clean(prefs);
			}

	},

	onShutdown : function() {
		const prefs = Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefService).getBranch('privacy.');

		// has user pref'ed to sanitize on shutdown?
		if (prefs.getBoolPref('sanitize.sanitizeOnShutdown')){
			this.sanitize();
		}
	}
};
implementComponent(
	PrivacyControl,
	Components.ID("{db7a8d60-a4c7-11da-a746-0800200c9a66}"),
	"@downthemall.net/privacycontrol;1",
	"DownThemAll! Privacy Control",
	[Ci.nsIObserver]
);
PrivacyControl.initialize();

function NSGetModule(mgr, spec) {
	return new ServiceModule(PrivacyControl, true);
}