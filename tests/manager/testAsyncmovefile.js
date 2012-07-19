"use strict";
module("manager/asyncmovefile.js");

test("exports", function() {
	checkExports("manager/asyncmovefile", ["asyncMoveFile"]);
});

asyncTest("asyncMoveFile", function() {
	const {asyncMoveFile} = require("manager/asyncmovefile");
	const tmpFile = FileUtils.getFile("TmpD", ["testasync"]);
	const tmpFile2 = FileUtils.getFile("TmpD", ["testasync2"]);
	console.log(tmpFile.path, tmpFile2.path);
	const stream = FileUtils.openFileOutputStream(tmpFile, FileUtils.MODE_WRONLY | FileUtils.MODE_CREATE);
	stream.write(tmpFile.path, tmpFile.path.length);
	stream.close();
	try {
		if (tmpFile2.exists()) {
			tmpFile2.remove(false);
		}
	} catch (ex) {}
	asyncMoveFile(tmpFile, tmpFile2, parseInt("666", 8), function(ex) {
		start();
		ok(!ex, ex);
		try {
			if (tmpFile.exists()) {
				tmpFile.remove(false);
			}
			if (tmpFile2.exists()) {
				tmpFile2.remove(false);
			}
		} catch (ex) {}
	});
});
