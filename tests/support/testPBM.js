module("pbm.js");

test("exports", function() {
	checkExports("resource://dta/support/pbm.jsm", [
		"browsingPrivately",
		"registerCallbacks",
		"unregisterCallbacks"
		]);
});

test("correct", function() {
	var pbm = require("resource://dta/support/pbm.jsm");
	if (("@mozilla.org/privatebrowsing-wrapper;1" in Cc) && ("nsIPrivateBrowsingService" in Ci)) {
		ok(pbm.registerCallbacks.toString() != "function registerCallbacks() {\n}", "setup correct");
	}
	else {
		ok(pbm.registerCallbacks.toString() == "function registerCallbacks() {\n}", "setup correct");
	}
});
