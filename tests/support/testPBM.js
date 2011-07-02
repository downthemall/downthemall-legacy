module("pbm.js");

test("exports", function() {
	deepEqual(Object.keys(importModule("resource://dta/support/pbm.jsm")), ["browsingPrivately", "registerCallbacks", "unregisterCallbacks"], "Correct exports");
});

test("correct", function() {
	var pbm = importModule("resource://dta/support/pbm.jsm");
	if (("@mozilla.org/privatebrowsing-wrapper;1" in Cc) && ("nsIPrivateBrowsingService" in Ci)) {
		ok(pbm.registerCallbacks.toString() != "function registerCallbacks() {\n}", "setup correct");
	}
	else {
		ok(pbm.registerCallbacks.toString() == "function registerCallbacks() {\n}", "setup correct");
	}
});
