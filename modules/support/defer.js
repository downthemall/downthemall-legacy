/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// Only used to dispatch runnables to the main thread, as a cheap alternative to setTimeout/nsITimer

Object.defineProperty(exports, "defer", {
	value: (function setup() {
		if ("dispatch" in Cu) {
			return function defer(fn, ctx) {
				if (ctx) {
					fn = fn.bind(ctx);
				}
				Cu.dispatch(fn, ctx || fn);
			};
		}
		else {
			const MainThread = Services.tm.mainThread;
			return function defer(fn, ctx) {
				if (ctx) {
					fn = fn.bind(ctx);
				}
				MainThread.dispatch(fn, 0);
			};
		}
	})(),
	enumerable: true
});
