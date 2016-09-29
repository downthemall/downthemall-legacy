/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

class GlobalProgressStub {
	construct(window) {
		this._total = 0;
		this._value = 0;
		this.init(window);
	}
	init() {}
	exit() {}
	reset() {}

	hide() {}
	unknown() {}
	pause() {}
	activate() {}
	error() {}
	get value() {
		return this._value;
	}
	set value(nv) {
		this._value = nv;
	}
	get total() {
		return this._total;
	}
	set total(nv) {
		this._total = nv;
	}
}
exports.GlobalProgress = GlobalProgressStub;

try {
	// Windows7
	if (!Services.wintaskbar.available) {
		// Service is present but not supported
		throw new Error("not available");
	}
	/* global NO_PROGRESS, INDETERMINATE, PAUSED, NORMAL, ERROR */
	for (let s in Ci.nsITaskbarProgress) {
		if (/^STATE/.test(s)){
			this[s.slice(6)] = Ci.nsITaskbarProgress[s];
		}
	}
	class GlobalProgress extends GlobalProgressStub {
		constructor() {
			super();
			this._state = NO_PROGRESS;
		}
		init(window) {
			let docShell = window.QueryInterface(Ci.nsIInterfaceRequestor).
					getInterface(Ci.nsIWebNavigation).
					QueryInterface(Ci.nsIDocShellTreeItem).treeOwner.
					QueryInterface(Ci.nsIInterfaceRequestor).
					getInterface(Ci.nsIXULWindow).docShell;
			this._progress = Services.wintaskbar.getTaskbarProgress(docShell);
		}
		exit() {
			this.hide();
			delete this._progress;
		}
		reset() {
			this._total = 1;
			this._value = 0;
			this.hide();
		}
		hide() {
			this._state = NO_PROGRESS;
			this._setState();
		}
		unknown() {
			this._state = INDETERMINATE;
			this._setState();
		}
		pause(value, total) {
			if (value && total) {
				this._value = value;
				this._total = total;
			}
			this._state = PAUSED;
			this._setState();
		}
		activate(value, total) {
			if (value && total) {
				this._value = value;
				this._total = total;
			}
			this._state = NORMAL;
			this._setState();
		}
		error(value, total) {
			if (value && total) {
				this._value = value;
				this._total = total;
			}
			this._state = ERROR;
			this._setState();
		}
		get value() {
			return this._value;
		}
		set value(nv) {
			this.__value = nv.toFixed(0);
			this._setState();
		}
		get total() {
			return this._total;
		}
		set total(nv) {
			this._total = nv.toFixed(0);
			this._setState();
		}
		_setState() {
			if (this._state <= INDETERMINATE) {
				this._progress.setProgressState(this._state);
			}
			else {
				this._progress.setProgressState(
					this._state,
					this._value,
					this._total
					);
			}
		}
	}
	exports.GlobalProgress = GlobalProgress;
}
catch (ex) {
	// not available or failed to init
	// Stub will be used!
}
