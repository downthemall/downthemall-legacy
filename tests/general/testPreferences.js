"use strict";
/* global module, test, arrayEqual, strictEqual, equal, ok, throws, checkExports */
module("preferences.js");

test("exports", function() {
	checkExports("preferences", [
		'get',
		'getExt',
		'getBranch',
		'set',
		'setExt',
		'hasUserValue',
		'hasUserValueExt',
		'getChildren',
		'getChildrenExt',
		'reset',
		'resetExt',
		'resetBranch',
		'resetBranchExt',
		'resetAllExt',
		'addObserver',
		'makeObserver'
		]);
});

test("read", function() {
	var p = require("preferences");
	strictEqual(p.get("extensions.dta.nokeepalive"), !p.hasUserValue("extensions.dta.nokeepalive"), "get() works");
	strictEqual(p.getExt("nokeepalive"), !p.hasUserValueExt("nokeepalive"), "getExt() works");
	strictEqual(p.get("extensions.dta.nokeepalive"), p.getExt("nokeepalive"), "get() eq getExt()");
	strictEqual(p.get("extensions.dta.renaming.default"), p.getExt("renaming.default"),
							"get() eq getExt() (string + point)");
});

test("setters", function() {
	var p = require("preferences");
	p.set("extensions.dta.testSet", "test");
	equal(p.getExt("testSet"), "test");
	p.reset("extensions.dta.testSet");
	equal(p.getExt("testSet"), undefined);
	p.setExt("testSet", "test");
	equal(p.get("extensions.dta.testSet"), "test");
	p.resetExt("testSet");
	equal(p.getExt("extensions.dta.testSet"), undefined);
});

test("observers", function() {
	var p = require("preferences");

	var obs1 = {
			observe: function(s,t,d) {
				this.observed = true;
			}
	};
	var obs2 = {
			QueryInterface: XPCOMUtils.generateQI([Ci.nsIRunnable]),
			observe: function(s,t,d) {
				this.observed = true;
			}
	};
	p.makeObserver(obs1);
	p.makeObserver(obs2);
	strictEqual(obs1.QueryInterface(Ci.nsIObserver), obs1, "QI works");
	throws(() => obs1.QueryInterface(Ci.nsIRunnable), "QI works (throws)");

	strictEqual(obs2.QueryInterface(Ci.nsIObserver), obs2, "QI2 works");
	strictEqual(obs2.QueryInterface(Ci.nsIRunnable), obs2, "Old QI2 works");

	var obs3 = {
			observe: function(s,t,d) {
				this.observed = true;
			}
	};

	var u1 = p.addObserver("extensions.dta", obs1);
	var u2 = p.addObserver("extensions.dta", obs2);
	var u3 = p.addObserver("extensions.dta", obs3);
	p.setExt("testObs", "yep");
	ok(obs1.observed && obs1.observed && obs3.observed, "all observers fired");

	u1(); u2(); u3();
	obs1.observed = false;

	p.setExt("testObs", "yeppy");
	p.resetExt("testObs");
	ok(!obs1.observed, "observers removed");
});
