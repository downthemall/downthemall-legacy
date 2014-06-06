/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

/**
 * This nasty piece of work attempts to create multiple OS.File main-thread
 * copies. The rational being:
 *  1. We perform a lot of writes in particular, which are long running. In the
 *     mean time, since OS.File will use only a single worker, we block other
 *     operations, incl. but not limited to: yourself.
 *  2. So we want more than one OS.File:
 *    - The "real" one.
 *    - At least one more for writing incoming download data.
 *    - At least one more for moving files, which may be across Disks, aka.
 *      copy-rename, or even across systems. Shoveling a few GBs over a low-end
 *      Wifi-LAN isn't a piece of cake, after all.
 *  3. We could use OS.File in workers, but that losses us Tasks on the
 *     main-thread. Hence this is not really an option for most stuff.
 *  4. We could copy/re-implement the async front-end, but that is at least as
 *     error prone as just re-initation the existing one.
 *  5. Hence just create a Sandbox and load another instance of OS.File in.
 */

const REAL_OSFILE_URI = "resource://gre/modules/osfile/osfile_async_front.jsm";
const MAX_INSTANCES = 3;

try {
	const {OS, SysAll} = Cu.import(REAL_OSFILE_URI, {});
	Object.defineProperty(exports, "create", {
		"value": function() {
			try {
				let scope = {};
				scope = new Cu.Sandbox(Services.sysprincipal, {
					sandboxName: REAL_OSFILE_URI + " (cloned by DownThemAll!, b/c don't block other consumers that much)",
					sandboxPrototype: scope,
					wantXRays: false
				});
				// XXX Need to re-write this, because osfile in all its might and glory
				// defines a non-configurable property on this, which comes from another module.
				SysAll.AbstractInfo.prototype = Object.create(SysAll.AbstractInfo.prototype);
				Services.scriptloader.loadSubScript(REAL_OSFILE_URI, scope);
				if (!scope.OS || !scope.OS.File) {
					throw new Error("Loaded as a supscript, but no OS.File");
				}
				log(LOG_DEBUG, "loaded another OS.File instance");
				return scope.OS;
			}
			catch (ex) {
				log(LOG_ERROR, "Failed to dupe OS.File :(", ex);
				return OS;
			}
		},
		"enumerable": true
	});
	/**
	 * Basically a round-robin getter for OS.File instances
	 */
	const getter = (function*() {
		const insts = [];
		for (var i = 0; i < MAX_INSTANCES; ++i) {
			insts.push(exports.create());
			yield insts[i];
		}
		for (var i = 0; ; i = ++i % MAX_INSTANCES) {
			yield insts[i];
		}
	})();
	Object.defineProperty(exports, "OS", {
		"get": () => getter.next().value,
		"enumerable": true
	});
}
catch (ex) {
	log(LOG_ERROR, "Failed to setup OS.File duper", ex);
	Object.defineProperty(exports, "OS", {
		"value": requireJSM("resource://gre/modules/osfile.jsm").OS,
		"enumerable": true
	});
	Object.defineProperty(exports, "get", {
		"value": () => exports.OS,
		"enumerable": true
	});
}
