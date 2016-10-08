/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const DOMAINS_FILE = "domain-prefs.json";

const {symbolize} = require("./stringfuncs");
const {Task} = requireJSM("resource://gre/modules/Task.jsm");
const {DeferredSave} = requireJSM("resource://gre/modules/DeferredSave.jsm");

const domains = new LRUMap(1000);

const PENDING = Symbol();

class Saver extends DeferredSave {
	constructor() {
		let file = require("api").getProfileFile(DOMAINS_FILE, true).path;
		super(file, () => this.serialize(), 5000);
		this.load();
	}
	get file() {
		return this._path || this._file;
	}
	load() {
		if (!this[PENDING]) {
			this[PENDING] = this._loadAsync();
		}
		return this[PENDING];
	}
	serialize() {
		let rv = [];
		for (let [domain, prefs] of domains.entries()) {
			domain = Symbol.keyFor(domain);
			if (!domain) {
				continue;
			}
			let cur = [];
			for (let [pref, value] of prefs.entries()) {
				pref = Symbol.keyFor(pref);
				cur.push([pref, value]);
			}
			if (cur.length) {
				rv.push([domain, cur]);
			}
		}
		return JSON.stringify(rv);
	}
}
Object.assign(Saver.prototype, {
	_loadAsync: Task.async(function*() {
		try {
			let req = yield fetch(Services.io.newFileURI(new Instances.LocalFile(this.file)).spec);
			let json = yield req.json();
			for (let [domain, prefs] of json) {
				domain = Symbol.for(domain);
				for (let [pref, value] of prefs) {
					let prefs = domains.get(domain);
					if (!prefs) {
						prefs = new Map();
						domains.set(domain, prefs);
					}
					prefs.set(symbolize(pref), value);
				}
			}
		}
		catch (ex) {
			this.saveChanges();
		}
	}),
});
let saver = new Saver();
unload(function() {
	if (saver) {
		saver.flush();
	}
	saver = null;
});

function domain(url, tld) {
	try {
		return Services.eTLD.getBaseDomain(url, tld ? 0 : 3);
	}
	catch (ex) {
		try {
			log(LOG_DEBUG, "Failed to get tld for " + (url.spec || url));
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
	saver.saveChanges();
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
	saver.saveChanges();
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
