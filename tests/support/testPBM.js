module("support/pbm.js");

test("exports", function() {
	checkExports("support/pbm", [
		"browsingPrivately",
		"registerCallbacks",
		"unregisterCallbacks"
		]);
});

