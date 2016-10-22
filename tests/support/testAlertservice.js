"use strict";
/* jshint browser:true */
/* globals module, test, asyncTest, checkExports, QUnit, equal, strictEqual, deepEqual, arrayEqual, ok, throws, start */
/* globals alert */
module("support/alertservice.js");

test("exports", function() {
	checkExports("support/alertservice", ["show"]);
});

test("show", function() {
	require("support/alertservice").show(new Date().toLocaleString(), "test", () => { alert("clicked"); });
	ok(true);
});

/*
asyncTest("XULAlertsService", function() {
	try {
		require("support/alertservice");
		var svc = Cc["@downthemall.net/xul-alerts-service;1"].getService(Ci.nsIAlertsService);
		svc.showAlertNotification("chrome://branding/content/icon64.png", "hello", "world",
															"true", null, null, "test", "en-US", "ltr", null);
		svc.showAlertNotification(null, "hello", "world", "true", null, null, "test",
															"en-US", "ltr", null);
		svc.showAlertNotification("chrome://branding/content/icon64.png", "hello", "world", "true", null, (s,t,d) => {
			if (t === "alertshow") {
				start();
				ok(true);
			}
			else {
				Components.utils.reportError(t);
			}
		}, "test", "en-US", "ltr", null);
	}
	catch (ex) {
		start();
	}
});
*/
