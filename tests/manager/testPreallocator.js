"use strict";
module("preallocator.jsm");

(function() {
	function _do_test(title, impl, size, sparse) {
		setTimeout(function() {
			var allocStart = Date.now();
			var file = Services.dirsvc.get("TmpD", Ci.nsIFile);
			file.append("dta_prealloc_test" + title + ".tmp");

			impl(file, size, 416, sparse, function callback(result) {
				var allocEnd = Date.now();
				var allocDiff = allocEnd - allocStart;
				var bytesPerSecond = ((size / 1048576.0) / (allocDiff / 1000.0)).toFixed(0);
				ok(result, title);
				if (result) {
					equal(file.fileSize, size, "file size correct, run time " + (allocDiff) + "ms, " + bytesPerSecond + " Mbytes/s");
				}
				try {
					file.remove(false);
				}
				catch (ex) {}
				start();
			});
		}, 100);
	}

	test("exports", function() {
		checkExports("resource://dta/manager/preallocator.jsm", ["prealloc"]);
		checkExports("resource://dta/manager/preallocator/asynccopier.jsm", ["prealloc"]);
		checkExports("resource://dta/manager/preallocator/cothread.jsm", ["prealloc"]);
	});

	asyncTest("worker non-sparse", function() {
		var {prealloc} = require("resource://dta/manager/preallocator.jsm");
		_do_test("non-sparse", prealloc, (1<<30), false);
	});
	asyncTest("worker sparse", function() {
		var {prealloc} = require("resource://dta/manager/preallocator.jsm");
		_do_test("sparse", prealloc, (1<<30), true);
	});
	asyncTest("asynccopier", function() {
		var {prealloc} = require("resource://dta/manager/preallocator/asynccopier.jsm");
		_do_test("asynccopier", prealloc, (1<<26), false);
	});

	asyncTest("cothread", function() {
		var {prealloc} = require("resource://dta/manager/preallocator/cothread.jsm");
		_do_test("cothread", prealloc, (1<<26), false);
	});

})();
