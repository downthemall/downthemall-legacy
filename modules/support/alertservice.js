/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {getExt: getPref} = require("preferences");

const ALERT_CHROME_URL = "chrome://global/content/alerts/alert.xul";
const ALERT_CHROME_FEAT = "chrome,dialog=yes,titlebar=no,popup=yes";

const str = (s) => {
	let rv = new Instances.SupportsString();
	rv.data = s;
	return rv;
};
const bool = (b) => {
	let rv = new Instances.SupportsBool();
	rv.data = b;
	return rv;
};
const int = (i) => {
	let rv = new Instances.SupportsInt32();
	rv.data = i;
	return rv;
};

function XULAlertsService() {
	// This is basically a re-implementation of nsXULAlertsService,
	// which unfortunately cannot be accessed directly from Javascript.
	// The implementation should be kept in sync.
}
XULAlertsService.prototype = Object.freeze({
	classDescription: "DownThemAll! xul alerts service",
	classID: Components.ID('{066c7f30-ba84-11e3-a5e2-0800200c9a66}'),
	contractID: '@downthemall.net/xul-alerts-service;1',

	QueryInterface: QI([Ci.nsIAlertsService]),

	showAlertNotification: function showAlertNotification(imageUrl, title, text, textClickable, cookie, listener, name, dir, lang, principal) {
		try {
			let args = new Instances.SupportsArray();

			args.AppendElement(str(imageUrl));
			args.AppendElement(str(title));
			args.AppendElement(str(text));
			args.AppendElement(bool(textClickable || false));
			args.AppendElement(str(cookie || ""));
			args.AppendElement(int(4)); // NS_ALERT_TOP;
			args.AppendElement(str(dir || ""));
			args.AppendElement(str(lang || ""));
			args.AppendElement(int(0)); // XXX implement replacement window if necessary
			if (listener) {
				try {
					let ptr = new Instances.SupportsInterfacePointer();
					ptr.data = listener.QueryInterface(Ci.nsIObserver);
					ptr.dataIID = Ci.nsIObserver;
					args.AppendElement(ptr);
				}
				catch (ex) {
					log(LOG_ERROR, "listener", ex);
				}
			}
			Services.ww.openWindow(null, ALERT_CHROME_URL, "_blank", ALERT_CHROME_FEAT, args);
		}
		catch (ex) {
			log(LOG_ERROR, "Failed to show XUL alert", ex);
		}
	},
	closeAlert: function(name, principal) {
		throw Cr.NS_ERROR_NOT_IMPLEMENTED;
	}
});

require("components").registerComponents([XULAlertsService]);

let service = null;
let supportsClickable = true;

(function getService() {
	try {
		if ("@mozilla.org/system-alerts-service;1" in Cc) {
			if (!getPref("usesysalerts", false)) {
				throw new Error("Not using the system alerts service");
			}
			supportsClickable = require("version").OS !== 'linux';
		}
		service = Cc['@mozilla.org/alerts-service;1'].getService(Ci.nsIAlertsService);
	}
	catch (ex) {
		log(LOG_DEBUG, "Using xul alerts service because: ", ex);
		supportsClickable = true;
		service = Cc['@downthemall.net/xul-alerts-service;1'].getService(Ci.nsIAlertsService);
	}
})();

exports.show = function alertservice_show(title, msg, callback, icon) {
	try {
		let clickable = false;
		let obs = null;

		// don't make clickable on *nix, so that libnotify will be used more often
		if (typeof callback === 'function' && supportsClickable) {
			clickable = true;
			obs = (s, t, d) => {
				if (t === "alertclickcallback") {
					callback();
				}
			};
		}

		service.showAlertNotification(
			icon || "chrome://dtaicon/content/icon64.png",
			title,
			msg,
			clickable,
			"downthemall",
			obs,
			"@downthemall.net/" + Date.now().toString()
			);
	}
	catch (ex if ex.result === Cr.NS_ERROR_NOT_IMPLEMENTED) {
		log(LOG_DEBUG, "alertsservice not available after all", ex);
	}
	catch (ex if ex.result === Cr.NS_ERROR_NOT_AVAILABLE) {
		log(LOG_DEBUG, "alertsservice (temporarily) not available", ex);
	}
	catch (ex) {
		log(LOG_ERROR, "alertsservice unexpectedly failed", ex);
	}
};
