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
 * The Original Code is DownThemAll preallocator CoThread module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2011
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

const EXPORTED_SYMBOLS = [
	'prealloc'
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

module('resource://dta/utils.jsm');
module('resource://dta/version.jsm');

try {
	module("resource://dta/preallocation/worker.jsm");
	if (Logger.enabled) {
		Logger.log("Using ChromeWorker implementation");
	}
}
catch (ex) {
	module("resource://dta/preallocation/cothread.jsm");
	if (Logger.enabled) {
		Logger.log("Using CoThread implementation");
	}
}

//Minimum size of a preallocation.
//If requested size is less then no actual pre-allocation will be performed.
const SIZE_MIN = (Version.OS == 'winnt' ? 256 : 2048) * 1024;

/**
 * Pre-allocates a given file on disk
 * and calls given callback when done
 *
 * @param file (nsIFile) file to allocate
 * @param size (int) Size to allocate
 * @param perms (int) *nix file permissions
 * @param callback (function) Callback called once done
 * @param tp (function) Scope (this) to call the callback function in
 * @return (nsICancelable) Pre-allocation object.
 */
function prealloc(file, size, perms, callback, sparseOk) {
	callback = callback || function() {};
	if (size <= SIZE_MIN || !isFinite(size)) {
		if (Logger.enabled) {
			Logger.log("pa: not preallocating");
		}
		callback(false);
		return null;
	}
	return prealloc_impl(file, size, perms, callback, sparseOk);
}
