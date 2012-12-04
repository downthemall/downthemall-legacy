/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const {URL} = require("api");
const {memoize} = require("support/memoize");
const {getExtension, toURL} = require("support/stringfuncs");

lazy(this, "getFavIcon", function() {
	try {
		const fs = Services.favicons;
		const RE_HTML = /\/$|html?$|aspx?$|php\d?$|py$|\/[^.]*$/i;
		const gfi = function getFavIconInternal(url) fs.getFaviconImageForPage(url);
		const gfim = memoize(gfi, 200);
		const defaultFavicon = fs.defaultFavicon;

		return function getFavIcon(url) {
			try {
				if (RE_HTML.test(url.filePath)) {
					let icon = gfi(url);
					if (defaultFavicon.equals(icon)) {
						let host = url.clone();
						host.path = "";
						return gfim(host).spec;
					}
					return icon.spec;
				}
			}
			catch (ex) {
				// nop op
			}
			return null;
		};
	}
	catch (ex) {
		log(LOG_INFO, "FavIcon Service not available", ex);
		return function getFavIconStub() null;
	}
});

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
const getIcon = exports.getIcon = function getIcon(link, metalink, size) {
	if (metalink) {
		if (size > 16) {
			return "chrome://dta/skin/icons/metalink48.png";
		}
		return "chrome://dta/skin/icons/metalink.png";
	}
	if (typeof(size) != 'number') {
		size = 16;
	}
	try {
		let url = link;
		if (link instanceof URL) {
			url = link.url;
		}
		else if (link instanceof Ci.nsIURI) {
			url = link.QueryInterface(Ci.nsIURL);
		}
		else if (link && link.url) {
			url = link.url;
		}
		if (typeof url == 'string' || url instanceof String) {
			try {
				url = toURL(url);
			}
			catch (ex) { /* no op */ }
		}
		if (url && url instanceof Ci.nsIURL) {
			let icon = getFavIcon(url);
			if (icon) {
				return icon;
			}
			url = url.spec;
		}
		let ext = getExtension(url);
		return "moz-icon://file" + (ext ? '.' + ext : '') + "?size=" + size;
	}
	catch (ex) {
		log(LOG_ERROR, "updateIcon: failed to grab icon", ex);
	}
	return "moz-icon://foo.html?size=" + size;
};


exports.getLargeIcon = (function() {
	const _s = (require("version").OS == "darwin" ? 48 : 32);
	return memoize(function(name, metalink) getIcon(name, metalink, _s), 150);
})();
