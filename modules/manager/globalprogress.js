/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

function GlobalProgress(window) {
	this.init(window);
}

/**
 * Stub implementation, furthermore showing the interface
 * Right now it is fairly similar to Win7 capabilities,
 * but that may change in the future (UNFROZEN)
 */
GlobalProgress.prototype = {

	init: function() {},
	exit: function() {},
	reset: function() {},

	hide: function() {},
	unknown: function() {},
	pause: function() {},
	activate: function() {},
	error: function() {},

	total: 0,
	value: 0
};

try {
	// Windows7
	if (!Services.wintaskbar.available) {
		// Service is present but not supported
		throw new Exception("not available");
	}
	/* global NO_PROGRESS, INDETERMINATE, PAUSED, NORMAL, ERROR */
	for (let s in Ci.nsITaskbarProgress) {
		if (/^STATE/.test(s)){
			this[s.slice(6)] = Ci.nsITaskbarProgress[s];
		}
	}
	GlobalProgress.prototype = {
		_state: NO_PROGRESS,
		init: function(window) {
			let docShell = window.QueryInterface(Ci.nsIInterfaceRequestor).
					getInterface(Ci.nsIWebNavigation).
					QueryInterface(Ci.nsIDocShellTreeItem).treeOwner.
					QueryInterface(Ci.nsIInterfaceRequestor).
					getInterface(Ci.nsIXULWindow).docShell;
			this._progress = Services.wintaskbar.getTaskbarProgress(docShell);
		},
		exit: function() {
			this.hide();
			delete this._progress;
		},
		reset: function() {
			this._total = 1;
			this._value = 0;
			this.hide();
		},
		hide: function() {
			this._state = NO_PROGRESS;
			this._setState();
		},
		unknown: function() {
			this._state = INDETERMINATE;
			this._setState();
		},
		pause: function(value, total) {
			if (value && total) {
				this._value = value;
				this._total = total;
			}
			this._state = PAUSED;
			this._setState();
		},
		activate: function(value, total) {
			if (value && total) {
				this._value = value;
				this._total = total;
			}
			this._state = NORMAL;
			this._setState();
		},
		error: function(value, total) {
			if (value && total) {
				this._value = value;
				this._total = total;
			}
			this._state = ERROR;
			this._setState();
		},
		get value() {
			return this._value;
		},
		set value(nv) {
			this._value = nv.toFixed(0);
			this._setState();
		},
		get total() {
			return this._total;
		},
		set total(nv) {
			this._total = nv.toFixed(0);
			this._setState();
		},
		_setState: function() {
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
		},
		_total: 1,
		_value: 0
	};
}
catch (ex) {
	// not available or failed to init
	// Stub will be used!
}

exports.GlobalProgress = GlobalProgress;
