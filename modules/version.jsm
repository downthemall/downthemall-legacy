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
 * The Original Code is DownThemAll Version module.
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

var EXPORTED_SYMBOLS = ['Version'];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var ID = 'dta@downthemall.net'; 

var runtime = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).QueryInterface(Ci.nsIXULRuntime);
var comparator = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);

var _callbacks = [];

var Version = {
		TOPIC_SHOWABOUT: "DTA:showAbout",
		ID: ID,
		LOCALE: Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIXULChromeRegistry).getSelectedLocale('global'),
		APP_NAME: runtime.name.toLowerCase().replace(/ /, ''),
		OS: runtime.OS.toLowerCase(),
		APP_VERSION: runtime.version,
		APP_ID: runtime.ID,
		VERSION: '0.0',
		BASE_VERSION: '0.0',
		NAME: 'DownThemAll!',
		moz1: false,
		moz2: false,
		ready: false,
		showAbout: null,
		compareVersion: function(version, cmp) {
			if (!cmp) {
				[version, cmp] = [this.VERSION, version];
			}
			return comparator.compare(version, cmp);
		},
		getInfo: function(callback) {
			if (this.ready) {
				callback.call(callback, this);
			}
			else {
				_callbacks.push(callback);
			}
		}
};

function completeVersion(addon) {
	if (addon) {
		Version.VERSION = addon.version;
		Version.BASE_VERSION = Version.VERSION.replace(/^([\d\w]+\.[\d\w]+).*?$/, '$1');
		Version.NAME = addon.name;
		Version.ready = true;
	}
	
	_callbacks.forEach(function(c) c.call(c, Version));
	_callbacks = [];
}

/**
 * Compares two version literals according to mozilla rules
 * @param version (string) Optional. Version.  If not given extension version will be used.
 * @param cmp (string) Version to compare to.
 * @return nsIVersionComparator result
 */

try {
	// moz-1.9.3+
	Cu.import("resource://gre/modules/AddonManager.jsm");
	Version.moz2 = true;
	AddonManager.getAddonByID(Version.ID, function(addon) {
		completeVersion(addon);
	});
}
catch (ex) {
	// moz-1.9.2-
	Version.moz1 = true;
	const ITEM = Cc["@mozilla.org/extensions/manager;1"].getService(Ci.nsIExtensionManager).getItemForID(ID);
	completeVersion(ITEM);
}