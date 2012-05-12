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
 * The Original Code is DownThemAll Icon Cheat Module
 *   Support loading window icons without unpacking
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2010
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

const EXPORTED_SYMBOLS = ['loadWindow'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const re = Cu.reportError;
const module = Cu.import;
const Exception = Components.Exception;

function loadWindow() {};

// moz-2.0+
module("resource://gre/modules/AddonManager.jsm");
module("resource://dta/glue2.jsm");
const Version = require("version");

// exported
loadWindow = (function() {
	// xpi version
	function extract(file) {
		let jar = new Instances.ZipReader(file);
		let entries = jar.findEntries("chrome/icons/default/*.(ico|png|xpm)$");
		while (entries.hasMore()) {
			let entry = entries.getNext();
			try {
				let name = entry.split(/[/\\]/).pop();
				let dst = iconDir.clone();
				dst.append(name);
				jar.extract(entry, dst);
			}
			catch (ex) {
				re(ex);
			}
		}
	}

	// flat-package version
	function copy(directory) {
		let srcDirectory = directory.clone();
		srcDirectory.append('chrome');
		srcDirectory.append('icons');
		srcDirectory.append('default');
		let icons = srcDirectory.directoryEntries;
		while (icons.hasMoreElements()) {
			let icon = icons.getNext();
			if ((icon instanceof Ci.nsIFile) && icon.isFile()) {
				try {
					icon.copyTo(iconDir, icon.leafName);
				}
				catch (ex) {
					// no op
				}
			}
		}
	}

	// Directory Provider we use to check the system :p
	function CheatDirProvider() {}
	CheatDirProvider.prototype = {
		hasMore: false,
		QueryInterface: XPCOMUtils.generateQI([Ci.nsIDirectoryServiceProvider, Ci.nsIDirectoryServiceProvider2, Ci.nsISimpleEnumerator]),
		getFile: function(prop, persist) {
			throw Cr.NS_ERROR_FAILURE;
		},
		getFiles: function(prop, persist) {
			if (prop == "AChromDL") {
				this.hasMore = true;
				return this;
			}
			throw Cr.NS_ERROR_FAILURE;
		},
		hasMoreElements: function() this.hasMore,
		getNext: function() {
			if (!this.hasMore) {
				throw Cr.NS_ERROR_FAILURE;
			}
			this.hasMore = false;
			return profileDir.clone();
		}
	};

	let profileDir = Services.dirsvc.get("ProfD", Ci.nsILocalFile);
	let iconDir = profileDir.clone();
	iconDir.append('icons');
	iconDir.append('default');

	// Create icons if not there yet, or if we got a major version update
	if (!iconDir.exists() || Version.showAbout) {
		if (!iconDir.exists()) {
			iconDir.create(Ci.nsIFile.DIRECTORY_TYPE, 493 /* 0755 */);
		}
		AddonManager.getAddonByID(Version.ID, function(addon) {
			let uri = addon.getResourceURI('icon.png');
			if (uri instanceof Ci.nsIJARURI) {
				uri = uri.JARFile;
				if (uri instanceof Ci.nsIFileURL) {
					extract(uri.file);
				}
			}
			else if (uri instanceof Ci.nsIFileURL) {
				copy(uri.file.parent);
			}
		});
	}

	return function(window) {
		let _p = new CheatDirProvider();
		Services.dirsvc.registerProvider(_p);
		let _load = function() {
			window.removeEventListener('load', _load, true);
			window.setTimeout(function() {
				Services.dirsvc.unregisterProvider(_p);
				_p = null;
			}, 0);
		};
		window.addEventListener('load', _load, true);
	}
})();
