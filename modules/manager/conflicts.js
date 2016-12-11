/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {cropCenter} = require("support/stringfuncs");
const {defer} = require("support/defer");
const Preferences = require("preferences");

var {OS} = requireJSM("resource://gre/modules/osfile.jsm");

module.exports = class Manager {
	constructor(window, formatter, prefs, l10n) {
		this._items = new Map();
		this._queue =  [];
		this._pinned = new Map();
		this._window = window;
		this._formatter = formatter;
		this._prefs = prefs;
		this._l10n = l10n;
	}
	resolve(download) {
		return this._resolve(download, true);
	}
	check(download) {
		return this._resolve(download, false);
	}
	_resolve(download, pinned) {
		log(LOG_DEBUG, "ConflictManager: Resolving " + download);
		let data = this._items.get(download);
		if (data) {
			// Make sure pinning request is carried over
			data.pinned |= pinned;
			log(LOG_DEBUG, "ConflictManager: Resolving already " + data);
			return data.promise;
		}
		data = {pinned: pinned};
		data.promise = new Promise(function(resolve, reject) {
			data.reject = reject;
			data.resolve = resolve;
		});
		this._items.set(download,data);
		this._queue.push(download);
		log(LOG_DEBUG, "ConflictManager: Resolving new " + data);
		this._processNext();
		return data.promise;
	}
	pin(name, unique) {
		let count = (this._pinned.get(name) || 0) + 1;
		if (unique && count > 1) {
			throw new Error("Invalid pin; not unique");
		}
		this._pinned.set(name, count);
	}
	unpin(name) {
		let count = this._pinned.get(name);
		if (!isFinite(count)) {
			log(LOG_ERROR, "ConflictManager: trying to unpin a name that does not exist");
			this._pinned.delete(name);
			return;
		}
		if (--count <= 0) {
			this._pinned.delete(name);
			return;
		}
		this._pinned.set(name, count); // store new count
	}
	_processNext() {
		log(LOG_DEBUG, "ConflictManager: Resolving next");
		if (this._processing) {
			log(LOG_DEBUG, "ConflictManager: Resolving rescheduling");
			return;
		}
		let download = this._queue.shift();
		if (!download) {
			return;
		}
		let data = this._items.get(download);
		this._items.delete(download);

		this._processing = true;
		this._runNext(download, data);
	}
	async _runNext(download, data) {
		try {
			data.resolve(await this._processOne(download, data));
		}
		catch (ex) {
			log(LOG_ERROR, "ConflictManager: Failed to resolve", ex);
			data.reject(null);
		}
		finally {
			this._processing = false;
			defer(() => this._processNext());
		}
	}
	async _findUnique(newDest, basename, conflicts) {
		// first try to find a "free" name by just incrementing the counter
		for (;conflicts <= 10; ++conflicts) {
			newDest.leafName = this._formatter(basename, conflicts);
			let exists = this._pinned.has(newDest.path);
			if (!exists) {
				exists = await OS.File.exists(newDest.path);
				// recheck
				exists = exists || this._pinned.has(newDest.path);
			}
			if (!exists) {
				return conflicts;
			}
		}
		// alright that did not work, now lets find the bounds
		let low = conflicts - 1;
		for (conflicts += 300;; conflicts += 1000) {
			newDest.leafName = this._formatter(basename, conflicts);
			let exists = this._pinned.has(newDest.path);
			if (!exists) {
				exists = await OS.File.exists(newDest.path);
				// recheck
				exists = exists || this._pinned.has(newDest.path);
			}
			if (!exists) {
				break;
			}
			low = conflicts;
		}
		let high = conflicts;
		// and do a binary search
		// There might be "gaps" still, but that's a tradeoff we're willing to make
		while (low !== high) {
			conflicts = (low + high) >>> 1;
			newDest.leafName = this._formatter(basename, conflicts);
			let exists = this._pinned.has(newDest.path);
			if (!exists) {
				exists = await OS.File.exists(newDest.path);
				// recheck
				exists = exists || this._pinned.has(newDest.path);
			}
			if (!exists) {
				high = conflicts;
			}
			else {
				low = conflicts + 1;
			}
		}
		return high;
	}
	async _processOne(download, data) {
		log(LOG_DEBUG, "ConflictManager: Starting conflict resolution for " + download);
		let dest = download.destinationLocalFile;
		let exists = this._pinned.has(dest.path);
		if (!exists) {
			exists = await OS.File.exists(dest.path);
			// recheck
			exists = exists || this._pinned.has(dest.path);
		}
		if (!exists) {
			log(LOG_DEBUG, "ConflictManager: Does not exist " + download);
			if (data.pinned) {
				this.pin(dest.path, true);
			}
			return dest.path;
		}

		let cr = -1;

		let conflicts = 0;
		const basename = download.destinationName;
		let newDest = download.destinationLocalFile.clone();

		if (this._prefs.conflictResolution !== 3) {
			cr = this._prefs.conflictResolution;
		}
		else if (download.shouldOverwrite) {
			cr = 1;
		}
		else if ('_sessionSetting' in this) {
			cr = this._sessionSetting;
		}
		else if ('_conflictSetting' in download) {
			cr = download._conflictSetting;
		}

		if (cr < 0) {
			let dialog = {};
			dialog.promise = new Promise(function(resolve, reject) {
				dialog.resolve = resolve;
				dialog.reject = reject;
			});
			conflicts = await this._findUnique(newDest, basename, conflicts);
			let options = {
				url: cropCenter(download.urlManager.usable, 45),
				fn: cropCenter(download.destinationLocalFile.leafName, 45),
				newDest: cropCenter(newDest.leafName, 45)
			};
			this._window.openDialog(
				"chrome://dta/content/dta/manager/conflicts.xul",
				"_blank",
				"chrome,centerscreen,resizable=no,dialog,close=no,dependent",
				options, dialog
				);
			let ctype = 0;
			[cr, ctype] = await dialog.promise;

			if (ctype === 1) {
				this._sessionSetting = cr;
			}
			else if (ctype === 2) {
				Preferences.setExt('conflictresolution', cr);
			}
			else {
				download._conflictSetting = cr;
			}
		}

		switch (cr) {
			case 0: {
				if (!data.pinned) {
					// No need to actually check here...
					// Check will be performed once we pin
					return;
				}
				conflicts = await this._findUnique(newDest, basename, conflicts);
				let pinned = null;
				if (data.pinned) {
					download.conflicts = conflicts;
					pinned = download.destinationFile;
					download.shouldOverwrite = false;
					this.pin(pinned, true);
				}
				log(LOG_DEBUG, "ConflictManager: resolved setting conflicts for " + download);
				return pinned;
			}
			case 1: {
				let pinned = null;
				if (data.pinned) {
					pinned = download.destinationFile;
					download.shouldOverwrite = true;
					this.pin(pinned, false);
				}
				return pinned;
			}
			default:
				download.cancel(this.l10n('skipped'));
				return false;
		}
	}
};
