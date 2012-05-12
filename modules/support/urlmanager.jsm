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
 * The Original Code is DownThemAll URLManager module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2009
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

"use strict";

const EXPORTED_SYMBOLS = [
	"UrlManager"
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

module("resource://dta/utils.jsm");
extendString(String);

const DTA = {};
module("resource://dta/glue.jsm");
module("resource://dta/api.jsm", DTA);

const Limits = glue2.require("support/serverlimits");

function compareFn(a, b) {
	const rv = b.preference - a.preference;
	return rv ? rv : (Math.floor(Math.random() * 3) - 1);
}

function UrlManager(urls) {
	this.initByArray(urls);
}
UrlManager.prototype = {
	initByArray: function um_initByArray(urls) {
		this._urls = [];
		for each (let u in urls) {
			if (u instanceof DTA.URL || (u.url && u.url instanceof Ci.nsIURI)) {
				this.add(u);
			}
			else if (u instanceof Ci.nsIURI) {
				this.add(new DTA.URL(u, null, true));
			}
			else {
				this.add(
					new DTA.URL(
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
		this._usableURL = this._usable.toURL();
		this._usableURLPath = this._usableURL.path.removeLeadingChar("/");
		if (this._usableURLPath.length) {
			this._usableURLPath = this._usableURLPath
				.substring(0, this._usableURLPath.lastIndexOf("/"))
				.normalizeSlashes()
				.removeFinalSlash();
		}
		this._host = this.usableURL.host;
		this._domain = Limits.getEffectiveHost(this._url);
		this._makeGood();
	},
	add: function um_add(url) {
		if (!url instanceof DTA.URL) {
			throw new Exception(url + " is not an DTA.URL");
		}
		for (let i = 0; i < this._urls.length; ++i) {
			if (this._urls[i]._urlSpec == url._urlSpec) {
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
			for each (let u in this._urls) {
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
	get usableURL() this._usableURL,
	get usableURLPath() this._usableURLPath,
	get length() this._urls.length,
	get host() this._host,
	get domain() this._domain,
	get all() {
		for each (let i in this._urls) {
			yield i;
		}
	},
	replace: function(url, newurl) {
		this._urls = this._urls.map(function(u) u.url.spec == url.url.spec ? newurl : u);
		this._makeGood();
	},
	markBad: function um_markBad(url) {
		if (this.good.length == 1) {
			// cannot mark the last url bad :p
			return false;
		}
		for each (let u in this._urls) {
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
};
