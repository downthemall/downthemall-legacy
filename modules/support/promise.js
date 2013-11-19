/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const PROMISE_MODULES = [
	"resource://gre/modules/Promise.jsm",
	"resource://gre/modules/commonjs/sdk/core/promise.js", // Gecko 21 to 24
	"resource://gre/modules/commonjs/promise/core.js", // Gecko 17 to 20
	];
for (let m of PROMISE_MODULES) {
	try {
		exports.Promise = requireJSM(m).Promise;
		break;
	}
	catch (ex) {
		log(LOG_ERROR, m);
	}
}

exports.Task = requireJSM("resource://gre/modules/Task.jsm").Task;
