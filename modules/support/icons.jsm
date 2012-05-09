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
 * The Original Code is DownThemAll icons module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *   Stefano Verna <stefano.verna@gmail.com>
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

const EXPORTED_SYMBOLS = ['getIcon'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

module("resource://dta/glue.jsm");
module("resource://dta/api.jsm");
module("resource://dta/utils.jsm");
module("resource://dta/support/memoize.jsm");

extendString(String);

XPCOMUtils.defineLazyGetter(this, "getFavIcon", function() {
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
		if (Logger.enabled) {
			Logger.log("FavIcon Service not available", ex);
		}
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
function getIcon(link, metalink, size) {
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
				url = url.toURL();
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
		let ext = url.getExtension();
		return "moz-icon://file" + (ext ? '.' + ext : '') + "?size=" + size;
	}
	catch (ex) {
		if (Logger.enabled) {
			Logger.log("updateIcon: failed to grab icon", ex);
		}
	}
	return "moz-icon://foo.html?size=" + size;
};
