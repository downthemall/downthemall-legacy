"use strict";
/* globals module, test, asyncTest, expect, checkExports, QUnit, equal, strictEqual, deepEqual, arrayEqual, ok, throws*/
module("support/domainprefs.js");

test("exports", function() {
	checkExports(
		"support/domainPrefs",
		["load",
			"get", "getTLD", "getHost",
			"set", "setTLD", "setHost",
			"delete", "deleteTLD", "deleteHost",
			"enumHosts"
		]
	);
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
	strictEqual(dp.getHost("code.downthemall.net", "test"), "a");
	strictEqual(dp.getHost("code.downthemall.net", Symbol.for("test")), "a");

	dp.delete(uri, "test");
	ok(!dp.get(uri, "test"));
	strictEqual(dp.get(uri, "test", "val"), "val");
	strictEqual(dp.getHost("code.downthemall.net", "test", "val"), "val");
	strictEqual(dp.get(uri, "test", 1), 1);
	strictEqual(dp.get(uri, "test"), undefined);
	strictEqual(dp.getHost("code.downthemall.net", "test"), undefined);
});

test("tld", function() {
	let dp = require("support/domainprefs");
	let uri = Services.io.newURI("https://code.downthemall.net/test.jpg", null, null);
	let uri2 = Services.io.newURI("https://downthemall.net/test.jpg", null, null);
	let tld = { tld: true };

	dp.set(uri, "test", "a", tld);
	strictEqual(dp.get(uri, "test", "val", tld), "a");
	strictEqual(dp.getHost("downthemall.net", "test", "val"), "a");
	strictEqual(dp.get(uri, "test", 1, tld), "a");
	strictEqual(dp.get(uri, "test", undefined, tld), "a");
	strictEqual(dp.get(uri, Symbol.for("test"), undefined, tld), "a");
	strictEqual(dp.getHost("downthemall.net", Symbol.for("test"), "val"), "a");

	strictEqual(dp.get(uri2, "test", "val", tld), "a");
	strictEqual(dp.get(uri2, "test", 1, tld), "a");
	strictEqual(dp.get(uri2, "test", undefined, tld), "a");
	strictEqual(dp.get(uri2, Symbol.for("test"), undefined, tld), "a");

	dp.delete(uri, "test", tld);
	ok(!dp.get(uri, "test", undefined, tld));
	ok(!dp.get(uri2, "test", undefined, tld));
	strictEqual(dp.get(uri, "test", "val", tld), "val");
	strictEqual(dp.get(uri2, "test", 1, tld), 1);
	strictEqual(dp.get(uri, "test", undefined, tld), undefined);
	strictEqual(dp.getHost("downthemall.net", Symbol.for("test")), undefined);
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

test("priv", function() {
	let dp = require("support/domainprefs");
	let uri = Services.io.newURI("https://code.downthemall.net/test.jpg", null, null);
	let uri2 = Services.io.newURI("https://downthemall.net/test.jpg", null, null);
	let tld = { tld: true };
	let priv = { isPrivate: true, tld: true };

	dp.set(uri, "test", "a", priv);
	strictEqual(dp.get(uri, "test", "val", priv), "a");
	strictEqual(dp.get(uri, "test", 1, priv), "a");
	strictEqual(dp.get(uri, "test", undefined, priv), "a");
	strictEqual(dp.get(uri, Symbol.for("test"), undefined, priv), "a");

	strictEqual(dp.get(uri2, "test", "val", priv), "a");
	strictEqual(dp.get(uri2, "test", "val", tld), "val");
	strictEqual(dp.get(uri2, "test", 1, priv), "a");
	strictEqual(dp.get(uri2, "test", undefined, priv), "a");
	strictEqual(dp.get(uri2, "test", undefined, tld), undefined);
	strictEqual(dp.get(uri2, Symbol.for("test"), undefined, priv), "a");

	dp.delete(uri, "test", priv);
	ok(!dp.get(uri, "test", undefined, priv));
	ok(!dp.get(uri2, "test", undefined, priv));
	strictEqual(dp.get(uri, "test", "val", priv), "val");
	strictEqual(dp.get(uri2, "test", 1, priv), 1);
	strictEqual(dp.get(uri, "test", undefined, priv), undefined);
});
