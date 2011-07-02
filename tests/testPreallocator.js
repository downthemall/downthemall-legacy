"use strict";
module("preallocator.jsm");

(function() {
	function _do_test(sparse, title) {
		var prealloc = importModule("resource://dta/manager/preallocator.jsm").prealloc;
		var file = Cc["@mozilla.org/file/directory_service;1"]
			.getService(Ci.nsIProperties)
			.get("TmpD", Ci.nsIFile);
		file.append("dta_prealloc_test.tmp");

		prealloc(file, (1<<28), 416, function callback(result) {
			ok(result, title);
			if (result) {
				equal(file.fileSize, (1<<28), "file size correct");
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

	asyncTest("non-sparse", function() _do_test(false, "non-sparse"));
	asyncTest("sparse", function() _do_test(true, "sparse"));

	asyncTest("cothread", function() {
		var prealloc = importModule("resource://dta/preallocation/cothread.jsm").prealloc_impl;
		var file = Cc["@mozilla.org/file/directory_service;1"]
			.getService(Ci.nsIProperties)
			.get("TmpD", Ci.nsIFile);
		file.append("dta_prealloc_test.tmp");

		prealloc(file, (1<<24), 416, function callback(result) {
			ok(result, "cothread");
			if (result) {
				equal(file.fileSize, (1<<24), "file size correct");
	    }
	    try {
	    	file.remove(false);
	    }
	    catch (ex) {}
	    start();
		});
	});

})();
