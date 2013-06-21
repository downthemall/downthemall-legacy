module("support/stringfuncs.js");

test("exports", function() {
	checkExports("support/stringfuncs", ["SYSTEMSLASH",
																			"addFinalSlash",
																			"cropCenter",
																			"getCURL",
																			"getExtension",
																			"getFileNameAndExt",
																			"getUsableFileName",
																			"getUsableFileNameWithFlatten",
																			"getUsablePath",
																			"normalizeSlashes",
																			"removeBadChars",
																			"removeFinalChar",
																			"removeFinalSlash",
																			"removeLeadingChar",
																			"removeLeadingSlash",
																			"replaceSlashes",
																			"toURI",
																			"toURL"]);
});

test("SYSTEMSLASH", function() {
	const {SYSTEMSLASH} = require("support/stringfuncs");
	ok(SYSTEMSLASH === "/" || SYSTEMSLASH === "\\");
});

test("removeBadChars", function() {
	const {removeBadChars} = require("support/stringfuncs");
	strictEqual(removeBadChars(""), "");
	strictEqual(removeBadChars("literal"), "literal");
	strictEqual(removeBadChars("%20"), " ");
	strictEqual(removeBadChars("%2520"), " ");
	strictEqual(removeBadChars("%2520\nl*iter\ra?l<%20>"), " _l_iter_a_l_ _");
	strictEqual(removeBadChars("\"\"literal''"), "__literal''");
});

test("addFinalSlash", function() {
	const {addFinalSlash, SYSTEMSLASH} = require("support/stringfuncs");
	strictEqual(addFinalSlash(""), SYSTEMSLASH);
	strictEqual(addFinalSlash("literal"), "literal" + SYSTEMSLASH);
	strictEqual(addFinalSlash("literal" + SYSTEMSLASH), "literal" + SYSTEMSLASH);
});

test("removeFinalChar", function() {
	const {removeFinalChar} = require("support/stringfuncs");
	strictEqual(removeFinalChar("a", "b"), "a");
	strictEqual(removeFinalChar("ab", "b"), "a");
	strictEqual(removeFinalChar("a", "a"), "");
	strictEqual(removeFinalChar("aaaa", "a"), "aaa");
});

test("removeLeadingChar", function() {
	const {removeLeadingChar} = require("support/stringfuncs");
	strictEqual(removeLeadingChar("a", "b"), "a");
	strictEqual(removeLeadingChar("b", "b"), "");
	strictEqual(removeLeadingChar("ab", "b"), "ab");
	strictEqual(removeLeadingChar("ab", "a"), "b");
	strictEqual(removeLeadingChar("aaaa", "a"), "aaa");
});

test("replaceSlashes", function() {
	const {replaceSlashes} = require("support/stringfuncs");
	strictEqual(replaceSlashes("a/b\\c\\d/e", "_"), "a_b_c_d_e");
});

test("normalizeSlashes", function() {
	const {normalizeSlashes, SYSTEMSLASH} = require("support/stringfuncs");
	strictEqual(normalizeSlashes("a/b\\c\\d/e"), SYSTEMSLASH === "/" ? "a/b/c/d/e" : "a\\b\\c\\d\\e");
});

test("removeLeadingSlash", function() {
	const {removeLeadingSlash, SYSTEMSLASH} = require("support/stringfuncs");
	strictEqual(removeLeadingSlash("/"), SYSTEMSLASH == "/" ? "" : "/");
	strictEqual(removeLeadingSlash("\\"), SYSTEMSLASH == "/" ? "\\" : "");
	strictEqual(removeLeadingSlash("a" + SYSTEMSLASH), "a" + SYSTEMSLASH);
	strictEqual(removeLeadingSlash(SYSTEMSLASH + "a"), "a");
});

test("getUsableFileName", function() {
	const {getUsableFileName} = require("support/stringfuncs");
	strictEqual(getUsableFileName("a"), "a");
	strictEqual(getUsableFileName(" a "), "a");
	strictEqual(getUsableFileName("/a"), "a");
	strictEqual(getUsableFileName("a/"), "a");
	strictEqual(getUsableFileName("\\a"), "a");
	strictEqual(getUsableFileName("a\\"), "a");
	strictEqual(getUsableFileName("a?b"), "a");
	strictEqual(getUsableFileName("a ?b"), "a");
});
test("getUsableFileName", function() {
	const {getFileNameAndExt} = require("support/stringfuncs");
	deepEqual(getFileNameAndExt("a"), ["a", ""]);
	deepEqual(getFileNameAndExt(" a "), ["a", ""]);
	deepEqual(getFileNameAndExt("/a"), ["a", ""]);
	deepEqual(getFileNameAndExt("a/"), ["a", ""]);
	deepEqual(getFileNameAndExt("\\a"), ["a", ""]);
	deepEqual(getFileNameAndExt("a\\"), ["a", ""]);
	deepEqual(getFileNameAndExt("a?b"), ["a", ""]);
	deepEqual(getFileNameAndExt("a ?b"), ["a", ""]);
	deepEqual(getFileNameAndExt("a.ext"), ["a", "ext"]);
	deepEqual(getFileNameAndExt(" a.ext "), ["a", "ext"]);
	deepEqual(getFileNameAndExt("/a.ext"), ["a", "ext"]);
	deepEqual(getFileNameAndExt("a.ext/"), ["a", "ext"]);
	deepEqual(getFileNameAndExt("\\a.ext"), ["a", "ext"]);
	deepEqual(getFileNameAndExt("a.ext\\"), ["a", "ext"]);
	deepEqual(getFileNameAndExt("a.ext?b"), ["a", "ext"]);
	deepEqual(getFileNameAndExt("a.ext ?b"), ["a", "ext"]);
});

test("getUsableFileNameWithFlatten", function() {
	const {getUsableFileNameWithFlatten} = require("support/stringfuncs");
	strictEqual(getUsableFileNameWithFlatten("a"), "a");
	strictEqual(getUsableFileNameWithFlatten("/a"), "-a");
	strictEqual(getUsableFileNameWithFlatten("a/"), "a-");
	strictEqual(getUsableFileNameWithFlatten("\\a"), "-a");
	strictEqual(getUsableFileNameWithFlatten("a\\"), "a-");
});

test("getUsablePath", function() {
	const {getUsablePath, normalizeSlashes} = require("support/stringfuncs");

	strictEqual(getUsablePath("abc?de"), "abc");
	strictEqual(getUsablePath("a/b\\c?de"), normalizeSlashes("a/b/c"));
});

test("getCURL", function() {
	const {getCURL, normalizeSlashes} = require("support/stringfuncs");

	strictEqual(
		getCURL(Services.io.newURI("https://test.example.org/?test#ref", null, null)),
		"test.example.org"
		);
	strictEqual(
		getCURL(Services.io.newURI("https://test.example.org/file?test#ref", null, null)),
		"test.example.org/file"
		);
	strictEqual(
		getCURL(Services.io.newURI("https://test.example.org/path/to/file?test#ref", null, null)),
		"test.example.org/path/to/file"
		);
});

test("getExtension", function() {
	const {getExtension} = require("support/stringfuncs");
	strictEqual(getExtension(""), null);
	strictEqual(getExtension("a"), null);
	strictEqual(getExtension("a.ext"), "ext");
	strictEqual(getExtension("a.ext2"), "ext2");
	strictEqual(getExtension("a.b.c.ext2"), "ext2");
});

test("cropCenter", function() {
	const {cropCenter} = require("support/stringfuncs");
	strictEqual(cropCenter("", 3), "");
	strictEqual(cropCenter("a", 3), "a");
	strictEqual(cropCenter("abc", 3), "abc");
	strictEqual(cropCenter("abcd", 3), "a...cd");
	strictEqual(cropCenter("abcde", 3), "a...de");
	strictEqual(cropCenter("abcdef", 3), "a...ef");
	strictEqual(cropCenter("abcdefg", 3), "a...fg");
	strictEqual(cropCenter("abcd", 4), "abcd");
	strictEqual(cropCenter("abcde", 4), "ab...de");
	strictEqual(cropCenter("abcdef", 4), "ab...ef");
	strictEqual(cropCenter("abcdefg", 4), "ab...fg");
});

test("toURI", function() {
	const {toURI} = require("support/stringfuncs");
	raises(function() toURI(""));
	raises(function() toURI("a"));
	strictEqual(toURI("abc:").spec, "abc:");
	strictEqual(toURI("https://example.org").spec, "https://example.org/");
	strictEqual(toURI("https://example.org/p").spec, "https://example.org/p");
	strictEqual(toURI("c", null, toURI("https://example.org/p")).spec, "https://example.org/c");
	strictEqual(toURI("http://example.org", null, toURI("https://example.org/p")).spec, "http://example.org/");
});

test("toURL", function() {
	const {toURL} = require("support/stringfuncs");
	raises(function() toURL(""));
	raises(function() toURL("a"));
	raises(function() toURL("abc:"));
	strictEqual(toURL("https://example.org").spec, "https://example.org/");
	strictEqual(toURL("https://example.org/p").spec, "https://example.org/p");
	strictEqual(toURL("c", null, toURL("https://example.org/p")).spec, "https://example.org/c");
	strictEqual(toURL("http://example.org", null, toURL("https://example.org/p")).spec, "http://example.org/");
});
