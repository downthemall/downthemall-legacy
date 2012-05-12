/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

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
	exports['register' + m] = function() _m.register.apply(_m, arguments);
	exports['unregister' + m] = function(id) _m.unregister(id);
	exports['modify' + m] = function(context) _m.modify(context, _sp(context));
}

var _uaextra = "DownThemAll!";
var _uaplatform = (function() {
	return Services.httphandler.platform + "; "
		+ Services.httphandler.oscpu + "; "
		+ Services.httphandler.language;
})();
var _uaextrap = _uaextra + " (" + _uaplatform + "; like wget)";
require("version").getInfo(function(v) {
	_uaextrap = _uaextra + "/" + v.BASE_VERSION + " (" + _uaplatform + "; 2.0; like wget)";
	_uaextra += "/" + v.BASE_VERSION;
});

exports.overrideUA = function overrideUA() {
	this.setRequestHeader('User-Agent', _uaextrap, false);
}
exports.makeAnonymous = function makeAnonymous() {
	try { this.referrer = null; } catch (ex) { /* no op */ }
	this.setRequestHeader('Referer', '', false);
	this.setRequestHeader('Cookie', '', false);
}
exports.makeCompletelyAnonymous = function makeCompletelyAnonymous() {
	makeAnonymous();
	this.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
}

exports.amendUA = function amendUA() {
	let ua = this.getRequestHeader('User-Agent');
	if (!/^DownThemAll/.test(ua)) {
		this.setRequestHeader('User-Agent', ua + " " + _uaextra, false);
	}
}

// Sourceforge
exports.registerHttp(
	'sourceforge.net',
	/(?:https?:\/\/|\.)(?:sf|sourceforge)\.net\//,
	exports.overrideUA,
	exports.makeAnonymous
);

// Rapidshare direct
exports.registerURL(
	'rapidshare direct',
	/^https?:\/\/(?:[\w\d_.-]+\.)?rapidshare\.com\/files\/[^?]*?(?!\?directstart=1)$/,
	function() this.spec += "?directstart=1"
);

Object.freeze(exports);
