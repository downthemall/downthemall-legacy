/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/**
 * Returns whether in PBM or not
 */
function browsingPrivately() false;

/**
 * Register a callback
 * @param obj Callback object.
 * 		The callback object can implement enter-/exitPrivateBrowsing.
 *    These functions have no parameters. No return value is expected.
 *    If Private Browsing Mode is currently active enterPrivateBrowsingMode will be called immediately
 *
 *    Furthermore canEnterPrivateBrowsing/canLeavePrivateBrowsing functions may be implemented.
 *    These have no parameters, but a boolean return value is expected stating whether a mode switch might be performed.
 *
 *    All callbacks will be called in the scope of obj.
 */
function registerCallbacks() {};

/**
 * Unregister a callback again
 */
function unregisterCallbacks() {};

if (("@mozilla.org/privatebrowsing-wrapper;1" in Cc) && ("nsIPrivateBrowsingService" in Ci)) {
	(function() {
		function Observer() {
			Services.obs.addObserver(this, "private-browsing", false);
			Services.obs.addObserver(this, "private-browsing-cancel-vote", false);
			unload((function() {
				Services.obs.removeObserver(this, "private-browsing");
				Services.obs.removeObserver(this, "private-browsing-cancel-vote");
			}).bind(this));
		}
		Observer.prototype = {
			QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),
			observe: function(aSubject, aTopic, aData) {
				switch (aTopic) {
				case 'private-browsing-cancel-vote':
					if (aData == 'enter') {
						this.doVote('canEnterPrivateBrowsing', aSubject);
					}
					else if (aData == 'exit') {
						this.doVote('canExitPrivateBrowsing', aSubject);
					}
					break;
				case 'private-browsing':
					this.notify(aData + "PrivateBrowsing");
					break;
				}
			},
			doVote: function(prop, cancel) {
				cancel.QueryInterface(Ci.nsISupportsPRBool);
				if (cancel.data) {
					// already canceled
					return;
				}
				cancel.data = !_callbacks.every(function(c) {
					if (prop in c) {
						return c[prop].call(c);
					}
					return true;
				});
			},
			notify: function(prop) {
				_callbacks.forEach(function(c) !(prop in c) || c[prop].call(c));
			},
			teardown: function() {
				Services.obs.removeObserver(this, "private-browsing");
				Services.obs.removeObserver(this, "private-browsing-cancel-vote");
				_callbacks = null;
			}
		};
		const observer = new Observer();
		unload(function() observer.teardown());

		const pbm = Cc["@mozilla.org/privatebrowsing-wrapper;1"].getService(Ci.nsIPrivateBrowsingService);

		let _callbacks = [];

		browsingPrivately = function browsingPrivately() pbm.privateBrowsingEnabled;
		registerCallbacks = function registerCallbacks(obj) {
			_callbacks.push(obj);
			if (browsingPrivately() && 'enterPrivateBrowsing' in obj) {
				obj['enterPrivateBrowsing'].call(obj);
			}
		}
		unregisterCallbacks = function unregisterCallbacks(obj) {
			let idx = _callbacks.indexOf(obj);
			if (idx > -1) {
				_callbacks.splice(idx, 1);
			}
		}
	})();
}

Object.defineProperties(exports, {
	browsingPrivately: {get: browsingPrivately, enumerable: true},
	registerCallbacks: {value: registerCallbacks, enumerable: true},
	unregisterCallbacks: {value: unregisterCallbacks, enumerable: true}
});
