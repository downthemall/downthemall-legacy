/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const {URL} = require("api");
const {memoize} = require("./memoize");
const {getExtension} = require("./stringfuncs");

const favCache = new LRUMap(200);

/**
 * Get the icon URI corresponding to an URI (special mac handling)
 *
 * @author Nils
 * @author Stefano
 * @param link
 *          Some sort of DTA.URL, nsIURI or string to get the icon for
 * @param metalink
 *          Is it a metalink?
 * @param size
 *          The desired iconsize;
 * @return String containing the icon URI
 */
const getIcon = exports.getIcon = function(link, metalink, size) {
	if (metalink) {
		if (size >= 96) {
			return "chrome://dta/skin/common/metalink96.png";
		}
		if (size >= 64) {
			return "chrome://dta/skin/common/metalink64.png";
		}
		if (size >= 48) {
			return "chrome://dta/skin/common/metalink48.png";
		}
		if (size >= 32) {
			return "chrome://dta/skin/common/metalink32.png";
		}
		return "chrome://dta/skin/common/metalink16.png";
	}
	if (typeof(size) !== 'number') {
		size = 16;
	}
	try {
		let url = link;
		if (link instanceof URL) {
			url = link.url.spec;
		}
		else if (link instanceof Ci.nsIURI) {
			url = link.spec;
		}
		else if (link && link.url) {
			url = link.url.spec;
		}
		let ext = getExtension(url);
		return "moz-icon://file" + (ext ? '.' + ext.toLowerCase() : '') + "?size=" + size;
	}
	catch (ex) {
		log(LOG_ERROR, "updateIcon: failed to grab icon", ex);
	}
	return "moz-icon://foo.html?size=" + size;
};

if ("mozIAsyncFavicons" in Ci && Services.favicons instanceof Ci.mozIAsyncFavicons) {
	let fis = Services.favicons;
	exports.getFavIcon = function getFavIcon(uri, callback, tp) {
		const spec = uri.spec;
		if (favCache.has(spec)) {
			callback.call(tp, favCache.get(spec), false);
			return;
		}
		const ficb = function(aFavURI) {
			if (!aFavURI) {
				log(LOG_DEBUG, "getFavIconAsync: failed " + spec + " " + uri.spec);
				let path = uri.path || uri.pathQueryRef;
				if (path !== "/") {
					uri = uri.clone();
					if ("pathQueryRef" in uri) {
						uri.pathQueryRef = "/";
					}
					else {
						uri.path = "/";
					}
					path = "/";
					let hostSpec = uri.spec;
					if (favCache.has(hostSpec)) {
						let rv = favCache.get(hostSpec);
						callback.call(tp, rv, true);
						return;
					}
					log(LOG_DEBUG, "getFavIconAsync: reattempting " + spec + " " + uri.spec);
					fis.getFaviconURLForPage(uri, ficb);
					return;
				}
				log(LOG_DEBUG, "getFavIconAsync: perm failed " + spec);
				let rv = getIcon(spec);
				callback.call(tp, rv, true);
				return;
			}
			let rv = fis.getFaviconLinkForIcon(aFavURI).spec;
			if (path !== "/") {
				favCache.set(uri.spec, rv);
			}
			callback.call(tp, rv, true);
		};
		fis.getFaviconURLForPage(uri, ficb);
	};
}
else if ("nsIFaviconService" in Ci) {
	let fis = Services.favicons;
	let defIcon = fis.defaultFavicon;
	exports.getFavIcon = function getFavIcon(uri, callback, tp) {
		const spec = uri.spec;
		if (favCache.has(spec)) {
			callback.call(tp, favCache.get(spec), false);
			return;
		}
		let fi = fis.getFaviconImageForPage(uri);
		if (!fi || fi.equals(defIcon)) {
			uri = uri.clone();
			if ("pathQueryRef" in uri) {
				uri.pathQueryRef = "/";
			}
			else {
				uri.path = "/";
			}
			if (favCache.has(uri.spec)) {
				callback.call(tp, favCache.get(uri.spec));
				return;
			}
			fi = fis.getFaviconImageForPage(uri);
			if (fi && fi.equals(defIcon)) {
				fi = null;
			}
			if (fi) {
				favCache.set(uri.spec, fi.spec);
			}
		}
		if (fi) {
			fi = fi.spec;
		}
		else {
			fi = getIcon(spec);
		}
		callback.call(tp, fi, false);
	};
}
else {
	exports.getFavIcon = function(uri, callback, tp) {
		callback.call(tp, getIcon(uri), false);
	};
}

// The Windows icon loader does not support icons > 32px at the moment
exports.getLargeIcon = (function() {
	let _s = 32, _sh = 32;
	switch (require("version").OS) {
	case "darwin":
		_s = 48;
		_sh = 96;
		break;
	case "winnt":
		_s = 64;
		_sh = 256;
		break;
	default:
		_s = 48;
		_sh = 256;
		break;
	}
	return memoize(function(name, metalink, hidpi) {
		return getIcon(name, metalink, hidpi ? _sh : _s);
	}, 150);
})();
