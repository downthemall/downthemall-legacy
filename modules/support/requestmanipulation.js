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
		for (let [,m] in new Iterator(this._m)) {
			if (m.matcher.test(spec)) {
				try {
					for (let func of m.funcs) {
						func.apply(context);
					}
				}
				catch (ex) {
					Cu.reportError(ex);
				}
			}
		}
		return context;
	}
};

function defineManipulator(m, sp) {
	const _m = new Manipulator();
	exports['register' + m] = function() { _m.register.apply(_m, arguments); };
	exports['unregister' + m] = function(id) { _m.unregister(id); };
	exports['modify' + m] = function(context) { return _m.modify(context, sp(context)); };
}

const mans = [
	['URL', c => c.spec],
	['Http', c => c.URI.spec],
	["Download", d => d.urlManager.spec],
	];
for (let [m, sp] of mans) {
	defineManipulator(m, sp);
}

var _uaextra = "DownThemAll!";
var _uaplatform = (function() {
	return Services.httphandler.platform + "; " +
		Services.httphandler.oscpu + "; " +
		Services.httphandler.language;
})();
var _uaextrap = _uaextra + " (" + _uaplatform + "; like wget)";
require("version").getInfo(function(v) {
	_uaextrap = _uaextra + "/" + v.BASE_VERSION + " (" + _uaplatform + "; 2.0; like wget)";
	_uaextra += "/" + v.BASE_VERSION;
});

exports.overrideUA = function overrideUA() {
	this.setRequestHeader('User-Agent', _uaextrap, false);
};

exports.makeAnonymous = function makeAnonymous() {
	try { this.referrer = null; } catch (ex) { /* no op */ }
	this.setRequestHeader('Referer', '', false);
	this.setRequestHeader('Cookie', '', false);
	if (("nsIPrivateBrowsingChannel" in Ci) && (this instanceof Ci.nsIPrivateBrowsingChannel)) {
		try { this.setPrivate(true); } catch (ex) {}
	}
};

exports.makeCompletelyAnonymous = function makeCompletelyAnonymous() {
	exports.makeAnonymous();
	this.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
};

exports.amendUA = function amendUA() {
	let ua = this.getRequestHeader('User-Agent');
	if (!/^DownThemAll/.test(ua)) {
		this.setRequestHeader('User-Agent', ua + " " + _uaextra, false);
	}
};

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
	function() { this.spec += "?directstart=1"; }
);

exports.registerURL(
	"youtube; strip video ranges",
	/youtube.*&range=/,
	function() { this.spec = this.spec.replace(/&range=.*?&/, "&"); }
);
exports.registerURL(
	"DumpTruck container pages",
	/^https:\/\/app\.dumptruck\.goldenfrog\.com\/p\/(.+)$/i,
	function() {
		this.spec =
			this.spec.replace(/^https:\/\/app\.dumptruck\.goldenfrog\.com\//, "https://dl.dumptruck.goldenfrog.com/") +
			"?dl=1";
	}
);

exports.registerDownload(
	"chan CDN",
	/^https?:\/\/(?:media\.8ch\.net|(?:[^.]?\.)?4cdn\.org)\//i,
	function() {
		log(LOG_ERROR, `4cdn ${this.urlManager.spec}`);
		this.cleanRequest = true;
	}
);

Object.freeze(exports);
