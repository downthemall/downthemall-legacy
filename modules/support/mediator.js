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
 * The Original Code is DownThemAll Mediator module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2008
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

const EXPORTED_SYMBOLS = [
	'getMostRecent', 'getMostRecentByUrl', 'getAllByType',
	'openExternal', 'openUrl', 'tryOpenUrl', 'openWindow',
	'addListener', 'removeListener',
	'showNotice', 'showAbout', 'showPreferences', 'showToolbarInstall'
];

let Prefs = require("preferences");

lazy(this, "Logger", function() {
	let _u = {};
	Cu.import("resource://dta/utils.jsm", _u);
	return _u.Logger;
});

function objToString(obj) {
	if (obj == null || obj == undefined || !obj) {
		return null;
	}
	if (
		typeof obj == 'string'
		|| obj instanceof String
	) {
		return obj.toString();
	}
	if (
		obj instanceof Ci.nsIURL
		|| obj instanceof Ci.nsIURI
	) {
		return obj.spec;
	}
	if (obj.url) {
		return objToString(obj.url);
	}
	throw new Exception("Not a valid type");
}
function objToUri(obj) {
	if (obj == null || obj == undefined || !obj) {
		return null;
	}
	if (obj instanceof Ci.nsIURL || obj instanceof Ci.nsIURI) {
		return obj;
	}
	if (typeof obj == 'string' || obj instanceof String) {
		return Services.io.newURI(obj.toString(), null, null);
	}
	if (obj.url) {
		return objToUri(obj.url);
	}
	throw new Exception("Not a valid type");
}

/**
 * Gets the most recent window
 * @param type Either a string or an array of string specifying the type of the window
 */
function getMostRecent(type) {
	if (type && type instanceof Array) {
		for each (t in type) {
			let rv = getMostRecent(t);
			if (rv) {
				return rv;
			}
		}
	}
	return Services.wm.getMostRecentWindow(type ? type.toString() : null);
}

/**
 * Gets the most recent window by url instead of type
 */
function getMostRecentByUrl(url) {
	if (!url) {
		return null;
	}
	url = objToString(url);

	let enumerator = Services.wm.getEnumerator(null);
	while (enumerator.hasMoreElements()) {
		var win = enumerator.getNext();
		if (win.location == url) {
			return win;
		}
	}
	return null;
}

function getAllByType(type) {
	let rv = [];
	let enumerator = Services.wm.getEnumerator(type);
	while (enumerator.hasMoreElements()) {
		rv.push(enumerator.getNext());
	}
	return rv;
}

function openExternal(link) {
	if (Logger.enabled) {
		Logger.log("Mediator: Using external handler for " + link);
	}
	Services.eps.loadUrl(objToUri(link));
}


this.__defineGetter__(
	'homePage',
	function() {
		let hp = Prefs.get('browser.startup.homepage', null);
		if (hp && !/^(?:resource|chrome):/.test(hp)) {
			return hp;
		}
		try {
			return Services.strings.createBundle(hp || 'resource:/browserconfig.properties').GetStringFromName('browser.startup.homepage');
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("No luck getting hp");
			}
		}
		return 'about:blank';
	}
);

function openUrl(window, link, ref) {
	if (!link) {
		link = homePage;
	}
	if (Logger.enabled) {
		Logger.log("Mediator: Request to open " + link);
	}
	if (!tryOpenUrl(window, link, ref)) {
		try {
			window.open(objToString(link));
		}
		catch (ex) {
			openExternal(link);
		}
	}
}
function tryOpenUrl(window, link, ref) {
	try {
		let win = getMostRecent('navigator:browser');
		if (win) {
			// browser
			if ('delayedOpenTab' in win) {
				win.delayedOpenTab(objToString(link), objToUri(ref));
				return true;
			}
			win.getBrowser().addTab(objToString(link), objToString(ref));
			return true;
		}
	}
	catch (ex) {
		if (Logger.enabled) {
			Logger.log('Mediator: Failed to open tab', ex);
		}
	}
	return false;
}

function openWindow(window, link) {
	if (!link) {
		link = homePage;
	}
	window.open(link);
}

function addListener(listener) {
	Services.wm.addListener(listener);
}
function removeListener(listener) {
	Services.wm.removeListener(listener);
}

function showNotice(window) {
	openUrl(window, 'about:downthemall#privacy');
}
function showAbout(window) {
	openUrl(window, 'about:downthemall');
}
function showPreferences(window, pane, command) {
	var instantApply = Prefs.get("browser.preferences.instantApply", false);
	window.openDialog(
		'chrome://dta/content/preferences/prefs.xul',
		'dtaPrefs',
		'chrome,titlebar,toolbar,resizable,centerscreen'+ (instantApply ? ',dialog=no' : ''),
		pane,
		command
	);
}
function showToolbarInstall(browserWindow) {
	browserWindow.openDialog(
		"chrome://dta/content/integration/toolbarinstall.xul",
		null,
		"chrome,dialog,centerscreen");
}

for each (let i in ['getMostRecent', 'getMostRecentByUrl', 'getAllByType',
										'openExternal', 'openUrl', 'tryOpenUrl', 'openWindow',
										'addListener', 'removeListener',
										'showNotice', 'showAbout', 'showPreferences', 'showToolbarInstall'
										]) {
	exports[i] = this[i];
}
