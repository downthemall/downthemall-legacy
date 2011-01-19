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
 * The Original Code is the DownThemAll! Migration module.
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

const EXPORTED_SYMBOLS = ['migrate'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const ctor = Components.Constructor;
const Exception = Components.Exception;
const module = Components.utils.import;
const error = Components.utils.reportError;

let Preferences = {};
module("resource://dta/version.jsm");
module("resource://dta/preferences.jsm", Preferences);

function log(str, ex) {
	try {
		let _u = {};
		module('resource://dta/utils.jsm', _u);
		log = function() _u.Debug.log.apply(_u.Debug, arguments);
		log(str, ex);
	}
	catch (oex) {
		error(str + ": " + ex);
	}
}

/*
 * Various migration
 */
const fn1_0 = [
	function() {
		// 1.0.1: #613 Multiple "slow-down" reports
		log("resetting connection prefs");
		for each (let e in ['network.http.max-connections', 'network.http.max-connections-per-server', 'network.http.max-persistent-connections-per-server']) {
			Preferences.reset(e);
		}
	},
];


/**
 * Migration entry point
 */
function migrate() Version.getInfo(function(v) {
	try {
		let lastVersion = Preferences.getExt('version', '0');
		if (0 == v.compareVersion(v.BASE_VERSION, lastVersion)) {
			return;
		}
		if (v.compareVersion(lastVersion, "1.0.1") < 0) {
			fn1_0.forEach(function(fn) fn());
		}
		Preferences.setExt('version', v.BASE_VERSION);

		v.showAbout = true;
		Cc["@mozilla.org/observer-service;1"]
			.getService(Ci.nsIObserverService)
			.notifyObservers(null, v.TOPIC_SHOWABOUT, null);
		let _ic = {};

		// Need to extract icons
		module('resource://dta/support/iconcheat.jsm');
	}
	catch (ex) {
		log("MigrationManager:", ex);
		try {
			Preferences.resetExt("version");
		}
		catch (iex) {
			// XXX
		}
	}
});
