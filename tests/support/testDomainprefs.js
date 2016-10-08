"use strict";
/* globals module, test, asyncTest, expect, checkExports, QUnit, equal, strictEqual, deepEqual, arrayEqual, ok, throws*/
module("support/domainprefs.js");

test("exports", function() {
	checkExports("support/domainPrefs", ["get", "getTLD", "set", "setTLD", "delete", "deleteTLD"]);
});

test("basic", function() {
	let dp = require("support/domainprefs");
	let uri = Services.io.newURI("https://code.downthemall.net/test.jpg", null, null);

	ok(!dp.get(uri, "test"));
	strictEqual(dp.get(uri, "test", "val"), "val");
	strictEqual(dp.get(uri, "test", 1), 1);
	strictEqual(dp.get(uri, "test"), undefined);

	dp.set(uri, "test", "a");
	strictEqual(dp.get(uri, "test", "val"), "a");
	strictEqual(dp.get(uri, "test", 1), "a");
	strictEqual(dp.get(uri, "test"), "a");
	strictEqual(dp.get(uri, Symbol.for("test")), "a");

	dp.delete(uri, "test");
	ok(!dp.get(uri, "test"));
	strictEqual(dp.get(uri, "test", "val"), "val");
	strictEqual(dp.get(uri, "test", 1), 1);
	strictEqual(dp.get(uri, "test"), undefined);
});

test("tld", function() {
	let dp = require("support/domainprefs");
	let uri = Services.io.newURI("https://code.downthemall.net/test.jpg", null, null);
	let uri2 = Services.io.newURI("https://downthemall.net/test.jpg", null, null);

	dp.set(uri, "test", "a", true);
	strictEqual(dp.get(uri, "test", "val", true), "a");
	strictEqual(dp.get(uri, "test", 1, true), "a");
	strictEqual(dp.get(uri, "test", undefined, true), "a");
	strictEqual(dp.get(uri, Symbol.for("test"), undefined, true), "a");

	strictEqual(dp.get(uri2, "test", "val", true), "a");
	strictEqual(dp.get(uri2, "test", 1, true), "a");
	strictEqual(dp.get(uri2, "test", undefined, true), "a");
	strictEqual(dp.get(uri2, Symbol.for("test"), undefined, true), "a");

	dp.delete(uri, "test", true);
	ok(!dp.get(uri, "test", undefined, true));
	ok(!dp.get(uri2, "test", undefined, true));
	strictEqual(dp.get(uri, "test", "val", true), "val");
	strictEqual(dp.get(uri2, "test", 1, true), 1);
	strictEqual(dp.get(uri, "test", undefined, true), undefined);
});

test("TLD", function() {
	let dp = require("support/domainprefs");
	let uri = Services.io.newURI("https://code.downthemall.net/test.jpg", null, null);
	let uri2 = Services.io.newURI("https://downthemall.net/test.jpg", null, null);

	dp.setTLD(uri, "test", "a");
	strictEqual(dp.getTLD(uri, "test", "val"), "a");
	strictEqual(dp.getTLD(uri, "test", 1), "a");
	strictEqual(dp.getTLD(uri, "test"), "a");
	strictEqual(dp.getTLD(uri, Symbol.for("test")), "a");

	strictEqual(dp.getTLD(uri2, "test", "val"), "a");
	strictEqual(dp.getTLD(uri2, "test", 1), "a");
	strictEqual(dp.getTLD(uri2, "test"), "a");
	strictEqual(dp.getTLD(uri2, Symbol.for("test")), "a");

	dp.deleteTLD(uri, "test");
	ok(!dp.getTLD(uri, "test"));
	ok(!dp.getTLD(uri2, "test"));
	strictEqual(dp.getTLD(uri, "test", "val"), "val");
	strictEqual(dp.getTLD(uri2, "test", 1), 1);
	strictEqual(dp.getTLD(uri, "test"), undefined);
});
