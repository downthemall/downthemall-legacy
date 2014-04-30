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

const EXPORTED_SYMBOLS = ['loadWindow'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const Ctor = Components.Constructor;
const Exception = Components.Exception;

function loadWindow() {};

try {
	// moz-1.9.3+
	Cu.import("resource://gre/modules/AddonManager.jsm");
	
	const ZipReader = Ctor("@mozilla.org/libjar/zip-reader;1", "nsIZipReader", "open");
	
	Cu.import("resource://dta/version.jsm");
	Cu.import("resource://gre/modules/XPCOMUtils.jsm");
	
	const DirectoryService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
	if (!(DirectoryService instanceof Ci.nsIDirectoryService)) {
		throw new Exception("eek");
	}
	let profileDir = DirectoryService.get("ProfD", Ci.nsILocalFile);
	let iconDir = profileDir.clone();
	iconDir.append('icons');
	iconDir.append('default');
	
	// xpi version
	function extract(file) {
		let jar = new ZipReader(file);
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
				Cu.reportError(ex);
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
	
	// Create icons if not there yet, or if we got a major version update
	if (!iconDir.exists() || Version.showAbout) {
		if (!iconDir.exists()) {
			iconDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0755);
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
	
	// exported
	loadWindow = function(window) {
		let _p = new CheatDirProvider();
		DirectoryService.registerProvider(_p);
		window.addEventListener('load', function() {
			window.removeEventListener('load', arguments.callee, true);
			window.setTimeout(function() {
				DirectoryService.unregisterProvider(_p);
				delete _p;				
			}, 0);
		}, true);
	}	
}
catch (ex) {
	// moz-1.9.2-
	// no need to do anything;
}