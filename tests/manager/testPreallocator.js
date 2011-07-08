"use strict";
module("preallocator.jsm");

(function() {
	function _do_test(title, impl, size, sparse) {
		var file = Cc["@mozilla.org/file/directory_service;1"]
			.getService(Ci.nsIProperties)
			.get("TmpD", Ci.nsIFile);
		file.append("dta_prealloc_test" + title + ".tmp");

		impl(file, size, 416, function callback(result) {
			ok(result, title);
			if (result) {
				equal(file.fileSize, size, "file size correct");
	    }
	    try {
	    	file.remove(false);
	    }
	    catch (ex) {}
	    start();
		}, sparse);
	}

	test("exports", function() {
		checkExports("resource://dta/manager/preallocator.jsm", ["prealloc"]);
		checkExports("resource://dta/preallocation/cothread.jsm", ["prealloc_impl"]);
	});

	asyncTest("prealloc", function() {
		var impl = importModule("resource://dta/manager/preallocator.jsm").prealloc;
		_do_test("prealloc", impl, (1<<28), false);
	});

	try {
		var impl = importModule("resource://dta/preallocation/worker.jsm").prealloc_impl;
		asyncTest("worker non-sparse", function() _do_test("non-sparse", impl, (1<<28), false));
		asyncTest("worker sparse", function() _do_test("non-sparse", impl, (1<<28), true));
	}
	catch(ex) {
		console.error(ex);
		test("worker", function() ok(true, "omitting worker: " + ex.message));
	}

	asyncTest("asynccopier", function() {
		var impl = importModule("resource://dta/preallocation/asynccopier.jsm").prealloc_impl;
		_do_test("asynccopier", impl, (1<<24));
	});

	asyncTest("cothread", function() {
		var impl = importModule("resource://dta/preallocation/cothread.jsm").prealloc_impl;
		_do_test("cothread", impl, (1<<24));
	});

})();
