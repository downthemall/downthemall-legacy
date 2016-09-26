"use strict";
module("manager/decompressor.js");

test("exports", function() {
	checkExports("manager/decompressor", ["Decompressor"]);
});

asyncTest("decompress something", Task.async(function*() {
	const {OS} = requireJSM("resource://gre/modules/osfile.jsm");
	try {
		let base = getRelURI("data/compressed.gz");
		console.log(base.spec);
		let file = FileUtils.getFile("TmpD", ["dta-test-compressed.gz"]);
		let out = FileUtils.getFile("TmpD", ["dta-test-uncompressed"]);

		function get() {
			return new Promise((res, rej) => {
				let content = new XMLHttpRequest();
				content.open("GET", base.spec);
				content.responseType = "arraybuffer";
				content.onloadend = function(e) {
					res(content);
				};
				content.send();
			});
		}

		let content = yield get();
		content = new Uint8Array(content.response);
		yield OS.File.writeAtomic(file.path, content);

		let download = {
			destinationLocalFile: out,
			tmpFile: file,
			compression: "gzip",
			invalidate: function() {
				this.invcalled = true;
			}
		};
		const {Decompressor} = require("manager/decompressor");
		let res = yield new Promise((res, rej) => {
			new Decompressor(download, res);
		});
		equal(!!res, false);
		if (res) {
			throw res;
		}
		equal(out.fileSize, 276);
	}
	catch (ex) {
		console.error(ex);
	}
	finally {
		QUnit.start();
	}
}));
