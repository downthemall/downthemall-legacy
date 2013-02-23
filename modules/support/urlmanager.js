/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const {URL} = require("api");
const Limits = require("support/serverlimits");
const {
	normalizeSlashes,
	removeFinalSlash,
	removeLeadingChar,
	toURL
	} = require("support/stringfuncs");

function compareFn(a, b) {
	const rv = b.preference - a.preference;
	return rv ? rv : (Math.floor(Math.random() * 3) - 1);
}

function UrlManager(urls) {
	this.initByArray(urls);
}
UrlManager.prototype = Object.freeze({
	initByArray: function um_initByArray(urls) {
		this._urls = [];
		for (let u of urls) {
			if (u instanceof URL || (u.url && u.url instanceof Ci.nsIURI)) {
				this.add(u);
			}
			else if (u instanceof Ci.nsIURI) {
				this.add(new URL(u, null, true));
			}
			else {
				this.add(
					new URL(
						Services.io.newURI(u.url,	u.charset, null),
						u.preference,
						true
					)
				);
			}
		}
		this._urls.sort(compareFn);
		this._url = this._urls[0].url;
		this._usable = this._urls[0].usable;
		lazy(this, "usableURL", this._usableURL);
		lazy(this, "usableURLPath", this._usableURLPath);
		lazy(this, "host", this._host);
		lazy(this, "spec", this._spec);
		this._domain = Limits.getEffectiveHost(this._url);
		this._makeGood();
	},
	_usableURL: function() toURL(this._usable),
	usableURLPath: function() {
		let rv = removeLeadingChar(this.usableURL.path, "/");
		if (rv.length) {
			rv = removeFinalSlash(normalizeSlashes(rv.substring(0, rv.lastIndexOf("/"))));
		}
		return rv;
	},
	_host: function() this.usableURL.host,
	_spec: function() this._url.spec,
	add: function um_add(url) {
		if (!url instanceof URL) {
			throw new Exception(url + " is not an URL");
		}
		for (let i = 0; i < this._urls.length; ++i) {
			if (this._urls[i].spec == url.spec) {
				return;
			}
		}
		this._urls.push(url);
	},
	_rotate: function um_rotate() {
		if (this.good.length < 2) {
			return;
		}
		this.good.push(this.good.shift());
	},
	_makeGood_check: function(u) !('bad' in u),
	_makeGood: function um_makeGood() {
		this.good = this._urls.filter(this._makeGood_check);
		if (!this.good.length) {
			// all marked bad; actually a bug
			Cu.reportError("UM: all marked bad");
			for (let u of this._urls) {
				delete u.bad;
			}
			this.good = this._urls.map(function(e) e);
		}
	},
	getURL: function um_getURL(idx) {
		let rv = this.good[0];
		this._rotate();
		return rv;
	},
	get url() this._url,
	get usable() this._usable,
	get length() this._urls.length,
	get domain() this._domain,
	get all() {
		for (let i of this._urls) {
			yield i;
		}
	},
	replace: function(url, newurl) {
		this._urls = this._urls.map(function(u) u.spec == url.spec ? newurl : u);
		this._makeGood();
	},
	markBad: function um_markBad(url) {
		if (this.good.length == 1) {
			// cannot mark the last url bad :p
			return false;
		}
		for (let u of this._urls) {
			if (u != url) {
				continue;
			}
			u.bad = true;
			// lower the preference
			u.preference = 0;
			break;
		}
		this._makeGood();
		return true;
	},
	toJSON: function um_toJSON() this._urls,
	toString: function() {
		return this._urls.reduce(function(v, u) v + u.preference + " " + u.url + "\n");
	},
	// clone ;)
	toArray: function() this._urls.map(function(e) e)
});
exports.UrlManager = Object.freeze(UrlManager);
