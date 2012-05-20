module("support/pbm.js");

test("exports", function() {
	checkExports("support/pbm", [
		"browsingPrivately",
		"registerCallbacks",
		"unregisterCallbacks"
		]);
});

test("correct", function() {
	var pbm = require("support/pbm");
	if (("@mozilla.org/privatebrowsing-wrapper;1" in Cc) && ("nsIPrivateBrowsingService" in Ci)) {
		ok(pbm.registerCallbacks.toString() != "function registerCallbacks() {\n}", "setup correct");
	}
	else {
		ok(pbm.registerCallbacks.toString() == "function registerCallbacks() {\n}", "setup correct");
	}
});
