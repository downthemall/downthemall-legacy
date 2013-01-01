module("support/pbm.js");

test("exports", function() {
	checkExports("support/pbm", [
		"browsingPrivately",
		"isWindowPrivate",
		"registerCallbacks",
		"unregisterCallbacks"
		]);
});

