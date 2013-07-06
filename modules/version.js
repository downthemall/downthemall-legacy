/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const ID = 'dta@downthemall.net';
let _callbacks = [];

Object.defineProperties(exports, {
	TOPIC_SHOWABOUT: {value: "DTA:showAbout", enumerable: true},
	ID: {value: ID, enumerable: true},
	LOCALE: {
		value: Cc["@mozilla.org/chrome/chrome-registry;1"]
			.getService(Ci.nsIXULChromeRegistry)
			.getSelectedLocale('global'),
		enumerable: true
		},
	APP_NAME: {value: Services.appinfo.name.toLowerCase().replace(/ /, ''), enumerable: true},
	OS: {value: Services.appinfo.OS.toLowerCase(), enumerable: true},
	APP_VERSION: {value: Services.appinfo.version, enumerable: true},
	APP_ID: {value: Services.appinfo.ID, enumerable: true},
	VERSION: {value: "0.0", enumerable: true, writable: true},
	BASE_VERSION: {value: "0.0", enumerable: true, writable: true},
	NAME: {value: "DownThemAll!", enumerable: true, writable: true},
	ready: {value: false, enumerable: true, writable: true},
	showAbout: {value: null, enumerable: true, writable: true},
	compareVersion: {value: function(version, cmp) {
		if (!cmp) {
			[version, cmp] = [exports.VERSION, version];
		}
		return Services.vc.compare(version, cmp);
	}},
	getInfo: {value: function(callback) {
		if (this.ready) {
			callback.call(callback, this);
		}
		else {
			_callbacks.push(callback);
		}
	}}
});

function completeVersion(addon) {
	if (addon) {
		exports.VERSION = addon.version;
		exports.BASE_VERSION = exports.VERSION.replace(/^([\d\w]+\.[\d\w]+).*?$/, '$1');
		exports.NAME = addon.name;
		exports.ready = true;
	}

	_callbacks.forEach(function callback(c) c.call(c, exports));
	_callbacks = [];
}

const {AddonManager} = requireJSM("resource://gre/modules/AddonManager.jsm");
AddonManager.getAddonByID(exports.ID, function getAddonByID(addon) {
	completeVersion(addon);
});
