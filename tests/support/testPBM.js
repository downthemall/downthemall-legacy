module("support/pbm.js");

test("exports", function() {
	checkExports("support/pbm", [
		"isWindowPrivate",
		"isChannelPrivate",
		"registerPrivatePurger",
		"unregisterPrivatePurger"
		]);
});

