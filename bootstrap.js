/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

function flush() {
	const {Services} = Components.utils.import("resource://gre/modules/Services.jsm", {});
	//Drop XUL/XBL/JAR/CSS/etc caches
	Services.obs.notifyObservers(null, "chrome-flush-caches", null);
}

function install() {}
function uninstall() {
	flush();
}
function startup(data) {
	// will unload itself
	Components.utils.import("chrome://dta-modules/content/glue.jsm", {});
}
function shutdown(data, reason) {
	if (reason === APP_SHUTDOWN) {
		// No need to cleanup; stuff will vanish anyway
		return;
	}
	let _g = {};
	Components.utils.import("chrome://dta-modules/content/glue.jsm", _g);
	_g.unload("shutdown", reason == ADDON_UPGRADE);
}
