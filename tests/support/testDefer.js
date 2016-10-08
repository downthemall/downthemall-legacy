"use strict";
/* globals module, test, asyncTest, expect, checkExports, QUnit, equal, strictEqual, deepEqual, arrayEqual, ok, throws*/
module("support/defer.js");

test("exports", function() {
	checkExports("support/defer", ["defer"]);
});

asyncTest("defer", function() {
	expect(1);
	var {defer} = require("support/defer");
	defer(function() {
		QUnit.start();
		ok("called");
	});
});

asyncTest("defer this", function() {
	expect(1);
	var {defer} = require("support/defer");
	var obj = {
			ok: false,
			fn: function() {
				QUnit.start();
				this.ok = true;
				equal(this.ok, obj.ok, "binding works");
			}
	};
	defer(obj.fn, obj);
});
