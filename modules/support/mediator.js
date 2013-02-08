/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
	'getMostRecent', 'getMostRecentByUrl', 'getAllByType',
	'openExternal', 'openUrl', 'tryOpenUrl', 'openWindow',
	'addListener', 'removeListener',
	'showNotice', 'showAbout', 'showPreferences', 'showToolbarInstall'
];

const Prefs = require("preferences");

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
		for (let t of type) {
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
	log(LOG_INFO, "Mediator: Using external handler for " + link);
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
			log(LOG_ERROR, "No luck getting hp");
		}
		return 'about:blank';
	}
);

function openUrl(window, link, ref) {
	if (!link) {
		link = homePage;
	}
	log(LOG_INFO, "Mediator: Request to open " + link);
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
		log(LOG_ERROR, "Mediator: Failed to open tab", ex);
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

for (let i of [
	'getMostRecent', 'getMostRecentByUrl', 'getAllByType',
	'openExternal', 'openUrl', 'tryOpenUrl', 'openWindow',
	'addListener', 'removeListener',
	'showNotice', 'showAbout', 'showPreferences', 'showToolbarInstall'
]) {
	exports[i] = this[i];
}
