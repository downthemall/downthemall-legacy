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
 * The Original Code is DownThemAll! Verificator module
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *	 Nils Maier <MaierMan@web.de>
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

const EXPORTED_SYMBOLS = ['overrideUA', 'amendUA'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const Ctor = Components.Constructor;
const module = Cu.import;
const Exception = Components.Exception;

module('resource://dta/version.jsm');
module('resource://dta/utils.jsm');

ServiceGetter(this, "CookieManager", "@mozilla.org/cookiemanager;1", "nsICookieManager2");

function Manipulator() {
	this._m = {};
}
Manipulator.prototype = {
	register: function(id, matcher) {
		this._m[id] = {
				matcher: matcher,
				funcs: Array.slice(arguments, 2)
		};
	},
	unregister: function(id) {
		if (id in this._m) {
			delete this._m[id];
		}
	},
	modify: function(context, spec) {
		for each (let m in this._m) {
			if (m.matcher.test(spec)) {
				try {
					for each (let func in m.funcs) {
						func.apply(context);
					}
				}
				catch (ex) {
					Cu.reportError(ex);
				}
			}
		}
	}
}

for each (let [m, sp] in [['URL', function(c) c.spec], ['Http', function(c) c.URI.spec]]) {
	let _m = new Manipulator();
	let _sp = sp;
	this['register' + m] = function() _m.register.apply(_m, arguments);
	this['unregister' + m] = function(id) _m.unregister(id);
	this['modify' + m] = function(context) _m.modify(context, _sp(context));
	EXPORTED_SYMBOLS.splice(EXPORTED_SYMBOLS.length, 3, 'register' + m, 'unregister' + m, 'modify' + m);
}

var _uaextra = "DownThemAll!";
var _uaplatform = (function() {
	let ph = Cc["@mozilla.org/network/protocol;1?name=http"].getService(Ci.nsIHttpProtocolHandler);
	return ph.platform + "; " + ph.oscpu + "; " + ph.language;
})();
var _uaextrap = _uaextra + " (" + _uaplatform + "; like wget)";
Version.getInfo(function(v) {
	_uaextrap = _uaextra + "/" + v.BASE_VERSION + " (" + _uaplatform + "; 2.0; like wget)";
	_uaextra += "/" + v.BASE_VERSION;
});

function overrideUA() {
	this.setRequestHeader('User-Agent', _uaextrap, false);
}
function makeAnonymous() {
	try { this.referrer = null; } catch (ex) { /* no op */ }
	this.setRequestHeader('Referer', '', false);
	//this.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
	this.setRequestHeader('Cookie', '', false);
}
function makeCompletelyAnonymous() {
	makeAnonymous();
	this.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
}

function amendUA() {
	let ua = this.getRequestHeader('User-Agent');
	if (!/^DownThemAll/.test(ua)) {
		this.setRequestHeader('User-Agent', ua + " " + _uaextra, false);
	}
}

// Sourceforge
registerHttp(
	'sourceforge.net',
	/(?:https?:\/\/|\.)(?:sf|sourceforge)\.net\//,
	overrideUA,
	makeAnonymous
);

// Rapidshare direct
registerURL(
	'rapidshare direct',
	/^https?:\/\/(?:[\w\d_.-]+\.)?rapidshare\.com\/files\/[^?]*?(?!\?directstart=1)$/,
	function() this.spec += "?directstart=1"
);

// Filesonic premium original
// This is here because filesonic is fucking lazy/stupid when it comes to premium links:
// p-links still time out (wtf?!)
// This is furthermore here, nsHelperAppLauncher does not expose the originating channel (wtf?!)
registerURL(
	'filesonic premium original',
	/^https?:\/\/s\d+\.filesonic\.com\/download\//,
	function() {
		try {
			for (let c in new SimpleIterator(CookieManager.getCookiesFromHost(this.host), Ci.nsICookie)) {
				if (c.name == "role" && c.value == "premium") {
					// only for premium :p
					this.spec = this.spec.replace(/^https?:\/\/s\d+\.filesonic\.com\/download\//, 'http://www.filesonic.com/file/');
					return;
				}
			}
		}
		catch (ex) {}
	}
);
