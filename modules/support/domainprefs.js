/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// for now domain prefs are non-persistent
// XXX Make persistent and migrate limits

const {symbolize} = require("./stringfuncs");

const domains = new LRUMap(500);

function domain(url, tld) {
	try {
		return Services.eTLD.getBaseDomain(url, tld ? 0 : 3);
	}
	catch (ex) {
		try {
			log(LOG_ERROR, "Failed to get tld for " + (url.spec || url));
			return url.host;
		}
		catch (ex) {
			return null;
		}
	}
}

function getPref(url, pref, defaultValue, tld) {
	let dom = domain(url, tld);
	if (!dom) {
		return defaultValue;
	}
	let prefs = domains.get(Symbol.for(dom));
	if (!prefs) {
		return defaultValue;
	}
	return prefs.get(symbolize(pref)) || defaultValue;
}

function setPref(url, pref, value, tld) {
	let dom = domain(url, tld);
	if (!dom) {
		// We cannot store for stuff we cannot get a domain from
		// then again, no big deal, since the prefs are not persistent anyway at the moment
		// XXX this may change
		return;
	}
	dom = Symbol.for(dom);
	let prefs = domains.get(dom);
	if (!prefs) {
		prefs = new Map();
		domains.set(dom, prefs);
	}
	prefs.set(symbolize(pref), value);
}

function deletePref(url, pref, tld) {
	let dom = domain(url, tld);
	if (!dom) {
		return;
	}
	dom = Symbol.for(dom);
	let prefs = domains.get(dom);
	if (!prefs) {
		return;
	}
	prefs.delete(symbolize(pref));
	if (!prefs.size) {
		domains.delete(dom);
	}
}

Object.defineProperties(exports, {
	"get": {
		value: getPref,
		enumerable: true
	},
	"set": {
		value: setPref,
		enumerable: true
	},
	"delete": {
		value: deletePref,
		enumerable: true
	},
	"getTLD": {
		value: function(url, pref, defaultValue) {
			return getPref(url, pref, defaultValue, true);
		},
		enumerable: true
	},
	"setTLD": {
		value: function(url, pref, value) {
			return setPref(url, pref, value, true);
		},
		enumerable: true
	},
	"deleteTLD": {
		value: function(url, pref, value) {
			return deletePref(url, pref, true);
		},
		enumerable: true
	}
});
