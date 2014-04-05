module("support/fileextsheet.js");

test("exports", function() {
	checkExports("support/fileextsheet", ["FileExtensionSheet"]);
});

test("getAtom", function() {
	const {FileExtensionSheet} = require("support/fileextsheet");
	var f = new FileExtensionSheet(window);
	ok(f.getAtom("file.ext"));
	strictEqual(f.getAtom("file.ext").toString(), f.getAtom("file2.ext").toString());
	strictEqual(f.getAtom("file.metalink", true).toString(), f.getAtom("file2.metalink", true).toString());
	strictEqual(f.getAtom("file.meta4", true).toString(), f.getAtom("file2.meta4", true).toString());
	strictEqual(f.getAtom("file.metalink", true).toString(), f.getAtom("file2.meta4", true).toString());
	strictEqual(f.getAtom("file.downthemall is dope").toString(), "FileIconunknown");
	strictEqual(f.getAtom("file.downthemall is dope").toString(), f.getAtom("file.downthemall is doper").toString());
});
