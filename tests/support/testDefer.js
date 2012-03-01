module("defer.jsm");

test("exports", function() {
	checkExports("resource://dta/support/defer.jsm", ["defer"]);
});

asyncTest("defer", function() {
	expect(1);
	var {defer} = require("resource://dta/support/defer.jsm");
	defer(function() {
		QUnit.start();
		ok("called");
	});
});

asyncTest("defer this", function() {
	expect(1);
	var {defer} = require("resource://dta/support/defer.jsm");
	var obj = {
			ok: false,
			fn: function() {
				QUnit.start();
				this.ok = true;
				equals(this.ok, obj.ok, "binding works");
			}
	};
	defer(obj.fn, obj);
});
