/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// Only used to dispatch runnables to the main thread, as a cheap alternative to setTimeout/nsITimer
const MainThread = Services.tm.mainThread;

exports.defer = function defer(fn, ctx) {
	if (ctx) {
		fn = fn.bind(ctx);
	}
	MainThread.dispatch(fn, 0);
}
