module("support/fileextsheet.js");

test("exports", function() {
	checkExports("support/fileextsheet", ["FileExtensionSheet"]);
});

test("getAtom", function() {
	const {FileExtensionSheet} = require("support/fileextsheet");
	var f = new FileExtensionSheet(window);
	ok(f.getAtom("file.ext"));
	strictEqual(f.getAtom("file.ext"), f.getAtom("file2.ext"));
	strictEqual(f.getAtom("file.metalink", true), f.getAtom("file2.metalink", true));
	strictEqual(f.getAtom("file.meta4", true), f.getAtom("file2.meta4", true));
	strictEqual(f.getAtom("file.metalink", true), f.getAtom("file2.meta4", true));
});
