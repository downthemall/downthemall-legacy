"use strict";
/* jshint browser:true */
/* globals module, test, asyncTest, expect, checkExports, QUnit, equal, strictEqual, deepEqual, arrayEqual, ok, throws*/
module("support/movefile.js");

test("exports", function() {
	checkExports("support/movefile", ["moveFile", "maxWorkers"]);
});

// jshint -W083
for (var i = 0; i < require("support/moveFile").maxWorkers * 2; ++i) {
	asyncTest("movefile OK (" + i + ")", async function() {
		const {OS} = requireJSM("resource://gre/modules/osfile.jsm");
		const {moveFile} = require("support/movefile");
		var tmpDir = OS.Constants.Path.tmpDir;
		var path = OS.Path.join(tmpDir, "dta.tmp");
		var path2 = OS.Path.join(tmpDir, "dta2.tmp");
		await OS.File.writeAtomic(path, new Uint8Array(1));
		try {
			await moveFile(path, path2);
			await OS.File.remove(path2);
			ok(true, "move worked");
		}
		catch (ex) {
			ok(false, ex.message || ex.toString());
			try {
				await OS.File.remove(path);
			}
			catch (ex) {
				// ignore
			}
		}
		finally {
			QUnit.start();
		}
	});

	asyncTest("movefile FAIL (" + i + ")", async function() {
		const {OS} = requireJSM("resource://gre/modules/osfile.jsm");
		const {moveFile} = require("support/movefile");
		var tmpDir = OS.Constants.Path.tmpDir;
		var path = OS.Path.join(tmpDir, "dta.tmp");
		var path2 = OS.Path.join(tmpDir, "doesnotexist", "dta.tmp");
		await OS.File.writeAtomic(path, new Uint8Array(1));
		try {
			await moveFile(path, path2);
			await OS.File.remove(path2);
			ok(false, "move worked, but shouldn't have");
		}
		catch (ex) {
			ok(true, ex.message || ex.toString());
			ok(ex.unixErrno || ex.winLastError, ex.unixErrno + " " + ex.winLastError);
			try {
				await OS.File.remove(path);
			}
			catch (ex) {
				// ignore
			}
		}
		finally {
			QUnit.start();
		}
	});
}
