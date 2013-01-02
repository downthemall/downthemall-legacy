/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/**
 * Determines if a window is private
 */
function isWindowPrivate() false;
try {
	let {PrivateBrowsingUtils} = requireJSM("resource://gre/modules/PrivateBrowsingUtils.jsm");
	if ("isWindowPrivate" in PrivateBrowsingUtils) {
		isWindowPrivate = function(window) {
			try {
				return PrivateBrowsingUtils.isWindowPrivate(window);
			}
			catch (ex) {
				log(LOG_ERROR, "isWindowPrivate call failed, defaulting to false", ex);
			}
			return false;
		}
	}
}
catch (ex) {
	log(LOG_DEBUG, "no PrivateBrowsingUtils");
}

Object.defineProperties(exports, {
	isWindowPrivate: {value: isWindowPrivate, enumerable: true}
});
