/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const {AddonManager} = requireJSM("resource://gre/modules/AddonManager.jsm");
const Version = require("version");

// exported
exports.loadWindow = (function() {
	// xpi version
	function extract(file) {
		let jar = new Instances.ZipReader(file);
		let entries = jar.findEntries("chrome/skin/windowicons/*.(ico|png|xpm)$");
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
		srcDirectory.append('skin');
		srcDirectory.append('windowicons');
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
	function CheatDirProvider() {
		this.hasMore = false;
	}
	CheatDirProvider.prototype = Object.freeze({
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
	});

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
		if (!window) {
			return;
		}
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
