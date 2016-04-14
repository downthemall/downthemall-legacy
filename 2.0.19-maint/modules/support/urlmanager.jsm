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

var EXPORTED_SYMBOLS = [
	"UrlManager"
];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;
var Exception = Components.Exception;

Cu.import("resource://dta/utils.jsm");

var DTA = {};
Cu.import("resource://dta/api.jsm", DTA);
var IOService = DTA.IOService;

var Limits = {};
Cu.import("resource://dta/support/serverlimits.jsm", Limits);

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
		for (let u of urls) {
			if (u instanceof DTA.URL || (u.url && u.url instanceof Ci.nsIURI)) {
				this.add(u);
			}
			else if (u instanceof Ci.nsIURI) {
				this.add(new DTA.URL(u));
			}
			else {
				this.add(
					new DTA.URL(
						IOService.newURI(u.url,	u.charset, null),
						u.preference
					)
				);
			}
		}
		this._urls.sort(compareFn);
		this._usable = this._urls[0].usable;
		this.eHost = Limits.getEffectiveHost(this._urls[0].url);
		this._makeGood();	
	},
	add: function um_add(url) {
		if (!url instanceof DTA.URL) {
			throw new Exception(url + " is not an DTA.URL");
		}
		if (!this._urls.some(function(ref) ref.url.spec == url.url.spec)) {
			this._urls.push(url);
		}
	},
	_rotate: function um_rotate() {
		this.good.push(this.good.shift());
	},
	_makeGood_check: function(u) !("bad" in u),
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
	get url() {
		return this._urls[0].url;
	},
	get usable() {
		return this._urls[0].usable;
	},
	get length() {
		return this._urls.length;
	},
	get all() {
		for (let i of this._urls) {
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
	serialize: function um_serialize() {
		let rv = [];
		for (let url of this._urls) {
			rv.push(url.serialize());
		}
		return rv;
	},
	toString: function() {
		return this._urls.reduce(function(v, u) v + u.preference + " " + u.url + "\n");
	},
	// clone ;)
	toArray: function() this._urls.map(function(e) e)
};
