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

const EXPORTED_SYMBOLS = ['getIcon'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const Exception = Components.Exception;

Cu.import("resource://dta/api.jsm");
Cu.import("resource://dta/utils.jsm");

extendString(String);

setNewGetter(this, "FavIcons", function() {
	try {
		return Cc['@mozilla.org/browser/favicon-service;1']
				 .getService(Ci.nsIFaviconService);
	}
	catch (ex) {
		Debug.log("FavIcon Service not available", ex);
		return null;
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
			if (FavIcons && /(?:\/|html?|aspx?|php\d?)$|\/[^.]*$/i.test(url.filePath)) {
				let icon = FavIcons.getFaviconImageForPage(url);
				if (icon.spec == FavIcons.defaultFavicon.spec) {
					let host = url.clone().QueryInterface(Ci.nsIURL);
					host.ref = host.query = host.filePath = "";
					icon = FavIcons.getFaviconImageForPage(host);
				}
				return icon.spec;
			}
			url = url.spec;
		}
		let ext = url.getExtension();
		return "moz-icon://file" + (ext ? '.' + ext : '') + "?size=" + size;
	}
	catch (ex) {
		Debug.log("updateIcon: failed to grab icon", ex);
	}
	return "moz-icon://foo.html?size=" + size;
};