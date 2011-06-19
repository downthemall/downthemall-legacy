module("defer.jsm");

test("exports", function() {
	deepEqual(Object.keys(importModule("resource://dta/support/defer.jsm")), ["defer", "defer_runnable"], "Correct exports");
});

asyncTest("defer", function() {
	expect(1);
	var {defer} = importModule("resource://dta/support/defer.jsm");
	defer(function() {
		QUnit.start();
		ok("called");
	});
});

asyncTest("defer_runnable", function() {
	expect(1);
	var {defer_runnable} = importModule("resource://dta/support/defer.jsm");
	var {XPCOMUtils} = importModule("resource://gre/modules/XPCOMUtils.jsm");
	defer_runnable({
		QueryInterface: XPCOMUtils.generateQI([Ci.nsIRunnable]),
		run: function() {
			QUnit.start();
			ok("called");
		}
	});
});
