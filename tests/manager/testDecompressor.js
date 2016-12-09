"use strict";
/* jshint browser:true */
/* globals module, test, asyncTest, checkExports, QUnit, equal */
/* globals getRelURI, console, FileUtils */
module("manager/decompressor.js");

test("exports", function() {
	checkExports("manager/decompressor", ["Decompressor"]);
});

asyncTest("decompress something", async function() {
	function get(base) {
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

	const {OS} = requireJSM("resource://gre/modules/osfile.jsm");
	try {
		let base = getRelURI("data/compressed.gz");
		console.log(base.spec);
		let file = FileUtils.getFile("TmpD", ["dta-test-compressed.gz"]);
		let out = FileUtils.getFile("TmpD", ["dta-test-uncompressed"]);


		let content = await get(base);
		content = new Uint8Array(content.response);
		await OS.File.writeAtomic(file.path, content);

		let download = {
			destinationLocalFile: out,
			tmpFile: file,
			compression: "gzip",
			invalidate: function() {
				this.invcalled = true;
			}
		};
		const {Decompressor} = require("manager/decompressor");
		let res = await new Promise((res, rej) => {
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
});
