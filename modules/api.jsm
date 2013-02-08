/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const Cu = Components.utils;
const EXPORTED_SYMBOLS = [];

Cu.import("chrome://dta-modules/content/glue.jsm");
let api = require("api");

for (let [k,v] in Iterator(api)) {
	let [_k,_v] = [k,v];
	Object.defineProperty(this, _k, {
		get: function() {
			Cu.reportError("deprecated DownThemAll! API access; see glue.jsm/require(). Symbol was " + _k);
			return _v;
		},
		enumerable: true,
	});
	EXPORTED_SYMBOLS.push(_k);
}
