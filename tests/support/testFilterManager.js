module("support/filtermanager.js");

test("exports", function() {
	checkExports("support/filtermanager", ["FilterManager"]);
});

(function() {
	const {FilterManager} = require("support/filterManager");

	test("plain text filter 1", function() {
		var f = FilterManager.getTmpFromString("iso");
		var r = f._regs;
		strictEqual(r.length, 1);
		strictEqual(r[0].source, "iso");
		ok(f.match("iso"));
		ok(f.match("imanisofile"));
		ok(f.match("some.iso"));
		ok(!f.match("some"));
		ok(!f.match("some.is."));
		ok(!f.match("some.is"));
	});

	test("plain text filter 2", function() {
		var f = FilterManager.getTmpFromString("IsO");
		var r = f._regs;
		strictEqual(r.length, 1);
		strictEqual(r[0].source, "IsO");
		ok(f.match("iso"));
		ok(f.match("imanisofile"));
		ok(f.match("some.iso"));
		ok(!f.match("some"));
		ok(!f.match("some.is."));
		ok(!f.match("some.is"));
	});

	test("regex filter 1", function() {
		var f = FilterManager.getTmpFromString("/iso/");
		var r = f._regs;
		strictEqual(r.length, 1);
		strictEqual(r[0].source, "iso");
		ok(f.match("iso"));
		ok(f.match("imanisofile"));
		ok(f.match("some.iso"));
		ok(!f.match("some.ISO"));
		ok(!f.match("some"));
		ok(!f.match("some.is."));
		ok(!f.match("some.is"));
	});

	test("regex filter 2", function() {
		var f = FilterManager.getTmpFromString("/.iso/");
		var r = f._regs;
		strictEqual(r.length, 1);
		strictEqual(r[0].source, ".iso");
		ok(!f.match("iso"));
		ok(f.match("imanisofile"));
		ok(f.match("some.iso"));
		ok(!f.match("some.ISO"));
		ok(!f.match("some"));
		ok(!f.match("some.is."));
		ok(!f.match("some.is"));
	});

	test("regex filter 3", function() {
		var f = FilterManager.getTmpFromString("/^.*iso$/");
		var r = f._regs;
		strictEqual(r.length, 1);
		strictEqual(r[0].source, "^.*iso$");
		ok(f.match("iso"));
		ok(!f.match("imanisofile"));
		ok(f.match("some.iso"));
		ok(!f.match("some.ISO"));
		ok(!f.match("some"));
		ok(!f.match("some.is."));
		ok(!f.match("some.is"));
	});

	test("regex filter 4 (case insensitive)", function() {
		var f = FilterManager.getTmpFromString("/^.*iso$/i");
		var r = f._regs;
		strictEqual(r.length, 1);
		strictEqual(r[0].source, "^.*iso$");
		ok(f.match("iso"));
		ok(!f.match("imanisofile"));
		ok(f.match("some.iso"));
		ok(f.match("some.ISO"));
		ok(!f.match("some"));
		ok(!f.match("some.is."));
		ok(!f.match("some.is"));
	});

	test("fnmatch filter 1", function() {
		var f = FilterManager.getTmpFromString("*.iso");
		var r = f._regs;
		strictEqual(r.length, 1);
		strictEqual(r[0].source, "^.*\\.iso$");
		ok(!f.match("iso"));
		ok(!f.match("imanisofile"));
		ok(f.match("some.iso"));
		ok(f.match("some.ISO"));
		ok(!f.match("some"));
		ok(!f.match("some.is."));
		ok(!f.match("some.is"));
	});

	test("fnmatch filter 2", function() {
		var f = FilterManager.getTmpFromString("s*.iso");
		var r = f._regs;
		strictEqual(r.length, 1);
		strictEqual(r[0].source, "^s.*\\.iso$");
		ok(!f.match("iso"));
		ok(!f.match("imanisofile"));
		ok(f.match("some.iso"));
		ok(f.match("some.ISO"));
		ok(!f.match("some.iso?query"));
		ok(!f.match("some.ISO?query"));
		ok(!f.match("notsome.iso"));
		ok(!f.match("notsome.ISO"));
		ok(!f.match("some"));
		ok(!f.match("some.is."));
		ok(!f.match("some.is"));
	});

	test("fnmatch filter 3", function() {
		var f = FilterManager.getTmpFromString("s?m*.iso");
		var r = f._regs;
		strictEqual(r.length, 1);
		strictEqual(r[0].source, "^s.m.*\\.iso$");
		ok(!f.match("iso"));
		ok(!f.match("imanisofile"));
		ok(f.match("some.iso"));
		ok(f.match("some.ISO"));
		ok(!f.match("some.iso?query"));
		ok(!f.match("some.ISO?query"));
		ok(!f.match("notsome.iso"));
		ok(!f.match("notsome.ISO"));
		ok(!f.match("some"));
		ok(!f.match("some.is."));
		ok(!f.match("some.is"));
	});

	test("combined filter 1", function() {
		var f = FilterManager.getTmpFromString("iso,/iso/i,*.iso");
		var r = f._regs;
		strictEqual(r.length, 1);
		strictEqual(r[0].source, "(?:iso)|(?:^.*\\.iso$)");
		ok(f.match("iso"));
		ok(f.match("imanisofile"));
		ok(f.match("some.iso"));
		ok(f.match("some.ISO"));
		ok(f.match("notsome.iso"));
		ok(f.match("notsome.ISO"));
		ok(!f.match("some"));
		ok(!f.match("some.is."));
		ok(!f.match("some.is"));
	});

	test("combined filter 2", function() {
		var f = FilterManager.getTmpFromString("/s.*iso/,*.iso");
		var r = f._regs;
		strictEqual(r.length, 2);
		strictEqual(r[0].source, "^.*\\.iso$");
		strictEqual(r[1].source, "s.*iso");
		ok(!f.match("iso"));
		ok(!f.match("imanisofile"));
		ok(f.match("imsomeisofile"));
		ok(!f.match("IMSomeisofile"));
		ok(f.match("some.iso"));
		ok(f.match("some.ISO"));
		ok(f.match("notsome.iso"));
		ok(f.match("notsome.ISO"));
		ok(!f.match("some"));
		ok(!f.match("some.is."));
		ok(!f.match("some.is"));
	});

	test("bad regexp filter 1", function() {
		var f = FilterManager.getTmpFromString("/s.*iso/ig");
		var r = f._regs;
		strictEqual(r.length, 1);
		strictEqual(r[0].source, "^\\/s\\..*iso\\/ig$");
	});

	test("bad regexp filter 2", function() {
		var f = FilterManager.getTmpFromString("/s.*iso/g");
		var r = f._regs;
		strictEqual(r.length, 1);
		strictEqual(r[0].source, "^\\/s\\..*iso\\/g$");
	});

})();
