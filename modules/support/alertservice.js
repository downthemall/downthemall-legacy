/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {makeObserver} = require("preferences");

let available = false;
let service = null;
let alerting = false;
let supportsClickable = true;
(function() {
	// XXX enhance: query libnotify via ctypes.
	if (require("version").OS == 'linux') {
		supportsClickable = false;
	}
})();

const Observer = {
	_func: null,
	observe: function(aSubject, aTopic, aData) {
		switch (aTopic) {
		case "alertfinished":
			alerting = false;
			break;
		case "alertclickcallback":
			if (this._func) {
				try {
					this._func();
				}
				catch (ex) {
					Cu.reportError(ex);
					// no op
				}
			}
			this._func = null;
			break;
		}
	}
};

try {
	service = Cc['@mozilla.org/alerts-service;1'].getService(Ci.nsIAlertsService);
	makeObserver(Observer);
	available = true;
}
catch (ex) {
	// no-op
}

exports.show = function alertservice_show(title, msg, callback) {
	if (!available) {
		throw new Exception("Alerting Service not available on this platform!");
	}
	if (alerting) {
		return;
	}
	alerting = true;

	let clickable = false;
	Observer._func = null;

	// don't make clickable on *nix, so that libnotify will be used more often
	if (typeof callback == 'function' && supportsClickable) {
		clickable = true;
		Observer._func = callback;
	}
	service.showAlertNotification(
		"chrome://dta/skin/common/alert.png",
		title,
		msg,
		clickable,
		null,
		Observer
		);
}
