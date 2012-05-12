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
 * The Original Code is the DownThemAll! Services component.
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

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Exception = Components.Exception;
const module = Components.utils.import;
const error = Components.utils.reportError;

module("resource://gre/modules/Services.jsm");
module("resource://gre/modules/XPCOMUtils.jsm");

const ABOUT_URI = 'https://about.downthemall.net/%BASE_VERSION%/?locale=%LOCALE%&app=%APP_ID%&version=%APP_VERSION%&os=%OS%';

function requireMod(m) {
	let _m = {};
	module("resource://dta/glue.jsm", _m);
	return _m.require(m);
}

XPCOMUtils.defineLazyGetter(this, "Preferences", function() requireMod("preferences"));
XPCOMUtils.defineLazyGetter(this, "Version", function() requireMod("version"));
XPCOMUtils.defineLazyGetter(this, "IconCheat", function() requireMod("support/iconcheat"));

function log(str, ex) {
	try {
		let _u = {};
		module('resource://dta/utils.jsm', _u);
		log = function() _u.Logger.log.apply(_u.Logger, arguments);
		log(str, ex);
	}
	catch (oex) {
		error(str + ": " + ex);
	}
}

/**
 * Stuff
 */
function Stuff() {}
Stuff.prototype = {
	classDescription: "DownThemAll! stuff",
	contractID: "@downthemall.net/stuff;1",
	classID: Components.ID("{27a344f4-7c1b-43f3-af7f-bb9dd65114bb}"),
	_xpcom_categories: [{category: 'profile-after-change'}],

	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),

	observe: function(aSubject, aTopic, aData) {
		switch (aTopic) {
		case 'profile-after-change':
			Services.obs.addObserver(this, 'final-ui-startup', false);
			Services.obs.addObserver(this, 'profile-change-teardown', false);
			break;
		case 'final-ui-startup':
			Services.obs.removeObserver(this, 'final-ui-startup');
			this.bootstrap();
			break;
		case 'profile-change-teardown':
			Services.obs.removeObserver(this, 'profile-change-teardown');
			this.onShutdown();
			break;
		case 'clean':
			this.clean();
			break;
		}
	},
	migrate: function MM_migrate() {
		// called only once

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

		(function migrate() Version.getInfo(function(v) {
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
				Services.obs.notifyObservers(null, v.TOPIC_SHOWABOUT, null);

				// Need to extract icons
				IconCheat.loadWindow(null);
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
		}))();
	},
	bootstrap: function MM_bootstrap() {
		this.migrate();
		try {
			module("resource://dta/glue.jsm", {}).require("support/contenthandling");
		}
		catch (ex) {
			log("ch", ex);
		}
		try {
			// DownloadHelper integration
			if (("dhICore" in Ci) && ("dhIProcessor" in Ci)) {
				module("resource://dta/glue.jsm", {}).require("support/downloadHelper");
			}
		}
		catch (ex) {
			log("dh", ex);
		}
	},
	clean: function() {
		log('clean()');

		// Cleaning prefs
		for each (let e in ['directory', 'filter', 'renaming']) {
			try {
				Preferences.resetExt(e);
			}
			catch (ex) {
				log("Cannot clear pref: " + e, ex);
			}
		}

		// Cleaning files
		try {
			let prof = Services.dirsvc.get("ProfD", Ci.nsIFile);
			for each (let e in ['dta_history.xml']) {
				try {
					var file = prof.clone();
					file.append(e);
					if (file.exists()) {
						file.remove(false);
					}
				}
				catch (ex) {
					log('Cannot remove: ' + e, ex);
				}
			}
		}
		catch (oex) {
			log('failed to clean files: ', oex);
		}

		// Diagnostic log
		try {
			let _d = {};
			module('resource://dta/Logger.jsm', _d);
			_d.Logger.clear();
		}
		catch (ex) {
			log("Cannot clear diagnostic log", ex);
		}

		try {
			module('resource://dta/glue.jsm', {}).require("manager/queuestore").QueueStore.clear();
		}
		catch (ex) {
			log("Cannot clear queue", ex);
		}
	},
	onShutdown : function() {
		let branch = Preferences.getBranch('privacy.');

		// has user pref'ed to sanitize on shutdown?
		if (branch.getBoolPref('sanitize.sanitizeOnShutdown') && branch.getBoolPref('clearOnShutdown.extensions-dta')){
			this.clean();
		}
	}
};

/**
 * AboutModule
 */
function AboutModule() {
}
AboutModule.prototype = {
	classDescription: "DownThemAll! about module",
	classID: Components.ID('{bbaedbd9-9567-4d11-9255-0bbae236ecab}'),
	contractID: '@mozilla.org/network/protocol/about;1?what=downthemall',

	QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),

	newChannel : function(aURI) {
		try {
				if (!Version.ready) {
					throw new Exception("Cannot build about:downthemall, version module not ready");
				}

				let ru = ABOUT_URI.replace(
					/%(.+?)%/g,
					function (m, m1) (m1 in Version) ? Version[m1] : m
				);

				let uri = Services.io.newURI(ru, null, null);
				let chan = Services.io.newChannelFromURI(uri);
				chan.originalURI = aURI;

				let sec = Cc['@mozilla.org/scriptsecuritymanager;1'].getService(Ci.nsIScriptSecurityManager);
				chan.owner = sec.getCodebasePrincipal(uri);

				return chan;
		}
		catch (ex) {
			log(ex);
			throw ex;
		}
	},

	getURIFlags: function(aURI) Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT
};

if (XPCOMUtils.generateNSGetFactory) {
		var NSGetFactory = XPCOMUtils.generateNSGetFactory([Stuff, AboutModule]);
}
else {
		function NSGetModule() XPCOMUtils.generateModule([Stuff, AboutModule]);
}
