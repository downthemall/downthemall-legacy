module("defer.jsm");

/* XXX require
test("exports", function() {
	checkExports("resource://dta/support/defer.jsm", ["defer"]);
});
*/

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
