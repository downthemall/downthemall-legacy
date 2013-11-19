"use strict";
module("manager/preallocator.js");

(function() {
	function _do_test(title, impl, size, sparse) {
		setTimeout(function() {
			var allocStart = Date.now();
			var file = FileUtils.getFile("TmpD", ["dta_prealloc_test" + title + ".tmp"]);

			var cb = function callback(result) {
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
			};
			var pa = impl(file, size, 416, sparse, cb);
			if ("then" in pa) {
				pa.then(cb);
			}
		}, 100);
	}
	test("exports", function() {
		checkExports("manager/preallocator", ["prealloc"]);
		checkExports("manager/preallocator/asynccopier", ["prealloc"]);
		checkExports("manager/preallocator/cothread", ["prealloc"]);
	});

	asyncTest("worker non-sparse", function() {
		var {prealloc} = require("manager/preallocator");
		_do_test("non-sparse", prealloc, (1<<26), false);
	});
	asyncTest("worker sparse", function() {
		var {prealloc} = require("manager/preallocator");
		_do_test("sparse", prealloc, (1<<26), true);
	});
	asyncTest("asynccopier", function() {
		var {prealloc} = require("manager/preallocator/asynccopier");
		_do_test("asynccopier", prealloc, (1<<25), false);
	});

	asyncTest("cothread", function() {
		var {prealloc} = require("manager/preallocator/cothread");
		_do_test("cothread", prealloc, (1<<25), false);
	});

})();
