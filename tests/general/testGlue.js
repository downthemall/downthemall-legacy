"use strict";
test("exports", function() {
	checkExports("resource://dta/glue.jsm", ["XPCOMUtils", "Services", "Instances", "require", "lazyRequire", "Map", "LRUMap"]);
});

test("Service contents", function() {
	var {Services: S1} = require("resource://dta/glue.jsm");
	var {Services: S2} = require("resource://gre/modules/Services.jsm");

	var k2 = Object.keys(S2);
	arrayEqual(Object.keys(S1.__proto__), k2, "Glue Services contains Services.jsm");
	arrayEqual([k for (k in S1)], Object.keys(S1).concat(k2), "All glue Services accessible (sans dupes)");
});

test("Instances contents", function() {
	var expected = ["XHR", "xhr", "DOMSerializer", "domserializer", "MimeInputStream", "mimeinputstream", "SupportsUint32", "supportsuint32", "Transferable", "transferable", "UniConverter", "uniconverter", "AsyncStreamCopier", "PlainAsyncStreamCopier", "BinaryInputStream", "PlainBinaryInputStream", "BinaryOutputStream", "PlainBinaryOutputStream", "BufferedOutputStream", "PlainBufferedOutputStream", "ConverterOutputStream", "PlainConverterOutputStream", "FileInputStream", "PlainFileInputStream", "PlainFileOutputStream", "FilePicker", "PlainFilePicker", "Hash", "PlainHash", "PlainLocalFile", "Pipe", "PlainPipe", "Process", "PlainProcess", "Sound", "PlainSound", "ScriptableInputStream", "PlainScriptableInputStream", "ScriptError", "PlainScriptError", "StringInputStream", "PlainStringInputStream", "PlainTimer", "ZipReader", "PlainZipReader", "FileOutputStream", "LocalFile", "Timer"];
	var {Instances: I} = require("resource://dta/glue.jsm");
	arrayEqual(Object.keys(I), expected, "Glue Instances are complete");
});
