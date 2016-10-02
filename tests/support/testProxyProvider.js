"use strict";
/* globals module, test, checkExports, ok, equal, notEqual, strictEqual */
module("support/proxyprovider.js");

test("exports", function() {
	checkExports("support/proxyprovider",
		["ProxyProvider", "ProxyInfo", "SimpleProxyInfo", "ProxyManager", "PROXY_PREFERRED", "PROXY_OPTIONAL"]);
});

test("simpleProvider", function() {
	const {ProxyManager, ProxyProvider, SimpleProxyInfo} = require("support/proxyprovider");
	class SimpleProvider extends ProxyProvider {
		getFor(uri) {
			switch (uri.host) {
				case "example.org":
					return new SimpleProxyInfo(0, "http", "example.com", 80, true);
				case "example.net":
					return new SimpleProxyInfo(0, "socks", "example.com", 80, false, "user", "pass");
				default:
					return null;
			}
		}
	}
	let prov = new SimpleProvider();
	try {
		ProxyManager.register(prov);
		strictEqual(
			"http://example.com:80/true",
			ProxyManager.getInfoFor(Services.io.newURI("https://example.org/", null, null)).toString());
		strictEqual(
			"socks://user:<redacted>@example.com:80/false",
			ProxyManager.getInfoFor(Services.io.newURI("https://example.net/", null, null)).toString(), null);
		strictEqual(ProxyManager.getInfoFor(Services.io.newURI("https://example.com/", null, null)), null);
	}
	finally {
		ProxyManager.unregister(prov);
		strictEqual(ProxyManager.getInfoFor(Services.io.newURI("https://example.org/", null, null)), null);
		strictEqual(ProxyManager.getInfoFor(Services.io.newURI("https://example.net/", null, null)), null);
		strictEqual(ProxyManager.getInfoFor(Services.io.newURI("https://example.com/", null, null)), null);
	}
});

test("errorProvider", function() {
	const {ProxyManager, ProxyProvider, SimpleProxyInfo} = require("support/proxyprovider");
	class SimpleProvider extends ProxyProvider {
		getFor(uri) {
			switch(uri.host) {
				case "example.org":
					return new SimpleProxyInfo(0, "http", "example.com", 80, true);
				default:
					throw new Error("no");
			}
		}
	}
	let prov = new SimpleProvider();
	try {
		ProxyManager.register(prov);
		strictEqual(
			"http://example.com:80/true",
			ProxyManager.getInfoFor(Services.io.newURI("https://example.org/", null, null)).toString());
		strictEqual(ProxyManager.getInfoFor(Services.io.newURI("https://example.com/", null, null)), null);
	}
	finally {
		ProxyManager.unregister(prov);
		strictEqual(ProxyManager.getInfoFor(Services.io.newURI("https://example.org/", null, null)), null);
		strictEqual(ProxyManager.getInfoFor(Services.io.newURI("https://example.com/", null, null)), null);
	}
});

test("customInfoProvider", function() {
	const {ProxyManager, ProxyProvider, ProxyInfo} = require("support/proxyprovider");
	class SimpleProxyInfo extends ProxyInfo{
		get kind() { return 0; }
		get type() { return "http"; }
		get host() { return "example.com"; }
		get port() { return 80; }
	};
	class SimpleProvider extends ProxyProvider {
		getFor(uri) {
			switch(uri.host) {
				case "example.org":
					return new SimpleProxyInfo();
				default:
					throw new Error("no");
			}
		}
	}
	let prov = new SimpleProvider();
	try {
		ProxyManager.register(prov);
		strictEqual(
			"http://example.com:80/true",
			ProxyManager.getInfoFor(Services.io.newURI("https://example.org/", null, null)).toString());
		strictEqual(ProxyManager.getInfoFor(Services.io.newURI("https://example.com/", null, null)), null);
	}
	finally {
		ProxyManager.unregister(prov);
		strictEqual(ProxyManager.getInfoFor(Services.io.newURI("https://example.org/", null, null)), null);
		strictEqual(ProxyManager.getInfoFor(Services.io.newURI("https://example.com/", null, null)), null);
	}
});

test("customErrorInfoProvider", function() {
	const {ProxyManager, ProxyProvider, ProxyInfo} = require("support/proxyprovider");
	class SimpleProxyInfo extends ProxyInfo{
		get kind() { return 0; }
		get type() { return "http"; }
		get host() { return "example.com"; }
		get port() { return 80; }
	};
	class SimpleProvider extends ProxyProvider {
		getFor(uri) {
			switch(uri.host) {
				case "example.org":
					return new SimpleProxyInfo();
				default:
					return {
						kind: 0,
						type: "http",
						host: "example.com",
						port: 80
				};
			}
		}
	}
	let prov = new SimpleProvider();
	try {
		ProxyManager.register(prov);
		strictEqual(
			"http://example.com:80/true",
			ProxyManager.getInfoFor(Services.io.newURI("https://example.org/", null, null)).toString());
		strictEqual(ProxyManager.getInfoFor(Services.io.newURI("https://example.com/", null, null)), null);
	}
	finally {
		ProxyManager.unregister(prov);
		strictEqual(ProxyManager.getInfoFor(Services.io.newURI("https://example.org/", null, null)), null);
		strictEqual(ProxyManager.getInfoFor(Services.io.newURI("https://example.com/", null, null)), null);
	}
});

