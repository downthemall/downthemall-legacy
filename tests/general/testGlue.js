"use strict";
module("glue.jsm");

test("exports", function() {
	checkExports("resource://dta/glue.jsm", ["XPCOMUtils", "Services", "Instances"]);
});

test("Service contents", function() {
	var {Services: S1} = importModule("resource://dta/glue.jsm");
	var {Services: S2} = importModule("resource://gre/modules/Services.jsm");

	var k2 = Object.keys(S2);
	deepEqual(Object.keys(S1.__proto__), k2, "Glue Services contains Services.jsm");
	deepEqual([k for (k in S1)], Object.keys(S1).concat(k2), "All glue Services accessible (sans dupes)");
});

test("Instances contents", function() {
	const expected = ["DOMParser", "domparser", "DOMSerializer", "domserializer", "MimeInputStream", "mimeinputstream", "SupportsUint32", "supportsuint32", "Transferable", "transferable", "UniConverter", "uniconverter", "AsyncStreamCopier", "PlainAsyncStreamCopier", "BinaryInputStream", "PlainBinaryInputStream", "BinaryOutputStream", "PlainBinaryOutputStream", "BufferedOutputStream", "PlainBufferedOutputStream", "ConverterOutputStream", "PlainConverterOutputStream", "FileInputStream", "PlainFileInputStream", "FileOutputStream", "PlainFileOutputStream", "FilePicker", "PlainFilePicker", "Hash", "PlainHash", "LocalFile", "PlainLocalFile", "Pipe", "PlainPipe", "Process", "PlainProcess", "Sound", "PlainSound", "ScriptableInputStream", "PlainScriptableInputStream", "ScriptError", "PlainScriptError", "StringInputStream", "PlainStringInputStream", "Timer", "PlainTimer", "ZipReader", "PlainZipReader"];
	var {Instances: I} = importModule("resource://dta/glue.jsm");
	deepEqual(Object.keys(I), expected, "Glue Services contains Services.jsm");
});
