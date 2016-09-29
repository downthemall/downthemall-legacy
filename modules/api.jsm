/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/* global Cu:true */

const Cu = Components.utils;
const EXPORTED_SYMBOLS = [];

Cu.import("chrome://dta-modules/content/glue.jsm");
let api = require("api");

let wrap = (_k, _v) => {
	return function() {
		Cu.reportError("deprecated DownThemAll! API access; see glue.jsm/require(). Symbol was " + _k);
		return _v;
	};
};

for (let [k,v] in Iterator(api)) {
	let [_k,_v] = [k,v];
	Object.defineProperty(this, _k, {
		get: wrap(_k, _v),
		enumerable: true
	});
	EXPORTED_SYMBOLS.push(_k);
}
