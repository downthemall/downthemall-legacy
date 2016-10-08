"use strict";
/* globals module, test, asyncTest, expect, checkExports, equal, strictEqual, deepEqual, arrayEqual, ok, throws */
module("support/requestmanipulation.js");

test("exports", function() {
	checkExports("support/requestmanipulation", [
		"amendUA",
		"makeAnonymous",
		"makeCompletelyAnonymous",
		"modifyDownload",
		"modifyHttp",
		"modifyURL",
		"overrideUA",
		"registerDownload",
		"registerHttp",
		"registerURL",
		"unregisterDownload",
		"unregisterHttp",
		"unregisterURL"
	]);
});

test("url", function() {
	var {registerURL, unregisterURL, modifyURL} = require("support/requestmanipulation");
	var uri = Services.io.newURI("http://example.org/", null, null);
	strictEqual(uri.spec, modifyURL(uri.clone()).spec, uri.spec);

	registerURL("example", /example.org/, function() { this.spec = this.spec.replace(".org", ".com"); });
	strictEqual(uri.spec.replace(".org", ".com"), modifyURL(uri.clone()).spec, uri.spec.replace(".org", ".com"));

	unregisterURL("example");
	strictEqual(uri.spec, modifyURL(uri.clone()).spec, uri.spec);
});

test("http", function() {
	var {registerHttp, unregisterHttp, modifyHttp, overrideUA, makeAnonymous} = require("support/requestmanipulation");
	var chan = Services.oldio.newChannel("http://example.org/", null, null);
	let dummy = chan instanceof Ci.nsIHttpChannel && chan instanceof Ci.nsIPrivateBrowsingChannel;

	registerHttp("example", /example.org/, overrideUA, makeAnonymous);
	modifyHttp(chan);
	throws(() => chan.getRequestHeader("Referer"));
	throws(() => chan.getRequestHeader("Cookie"));
	ok(chan.getRequestHeader("User-Agent").indexOf("DownThemAll") !== -1);
	ok(chan.getRequestHeader("User-Agent").indexOf("wget") !== -1);
	ok(chan.getRequestHeader("User-Agent").indexOf("Firefox") === -1);
	ok(chan.isChannelPrivate);
	unregisterHttp("example");
});
