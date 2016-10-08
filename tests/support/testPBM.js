"use strict";
/* jshint browser:true */
/* globals module, test, asyncTest, expect, checkExports, QUnit, equal, strictEqual, deepEqual, arrayEqual, ok */
module("support/pbm.js");

test("exports", function() {
	checkExports("support/pbm", [
		"isWindowPrivate",
		"isChannelPrivate",
		"registerPrivatePurger",
		"unregisterPrivatePurger"
		]);
});

