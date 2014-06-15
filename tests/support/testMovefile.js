module("support/movefile.js");

test("exports", function() {
	checkExports("support/movefile", ["moveFile", "maxWorkers"]);
});

for (var i = 0; i < require("support/moveFile").maxWorkers * 2; ++i) {
	asyncTest("movefile OK (" + i + ")", function() {
		const {OS} = requireJSM("resource://gre/modules/osfile.jsm");
		const {Task} = requireJSM("resource://gre/modules/Task.jsm");
		const {moveFile} = require("support/movefile");
		Task.spawn(function*() {
			var tmpDir = OS.Constants.Path.tmpDir;
			var path = OS.Path.join(tmpDir, "dta.tmp");
			var path2 = OS.Path.join(tmpDir, "dta2.tmp");
			yield OS.File.writeAtomic(path, new Uint8Array(1));
			try {
				yield moveFile(path, path2);
				yield OS.File.remove(path2);
				ok(true, "move worked");
			}
			catch (ex) {
				ok(false, ex.message || ex.toString());
				try {
					yield OS.File.remove(path);
				}
				catch (ex) {
					// ignore
				}
			}
			finally {
				QUnit.start();
			}
		});
	});

	asyncTest("movefile FAIL (" + i + ")", function() {
		const {OS} = requireJSM("resource://gre/modules/osfile.jsm");
		const {Task} = requireJSM("resource://gre/modules/Task.jsm");
		const {moveFile} = require("support/movefile");
		Task.spawn(function*() {
			var tmpDir = OS.Constants.Path.tmpDir;
			var path = OS.Path.join(tmpDir, "dta.tmp");
			var path2 = OS.Path.join(tmpDir, "doesnotexist", "dta.tmp");
			yield OS.File.writeAtomic(path, new Uint8Array(1));
			try {
				yield moveFile(path, path2);
				yield OS.File.remove(path2);
				ok(falee, "move worked, but shouldn't have");
			}
			catch (ex) {
				ok(true, ex.message || ex.toString());
				ok(ex.unixErrno || ex.winLastError, ex.unixErrno + " " + ex.winLastError);
				try {
					yield OS.File.remove(path);
				}
				catch (ex) {
					// ignore
				}
			}
			finally {
				QUnit.start();
			}
		});
	});
}
