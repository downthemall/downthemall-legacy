"use strict";
module("glue.jsm");

test("Service contents", function() {
	var {Services: S1} = requireJSM("chrome://dta-modules/content/glue.jsm");
	var {Services: S2} = requireJSM("resource://gre/modules/Services.jsm");

	var k2 = Object.keys(S2);
	arrayEqual(Object.keys(S1.__proto__), k2, "Glue Services contains Services.jsm");
	arrayEqual([k for (k in S1)], Object.keys(S1).concat(k2), "All glue Services accessible (sans dupes)");
});

test("Instances contents", function() {
	var expected = ["XHR", "xhr", "DOMSerializer", "domserializer", "MimeInputStream", "mimeinputstream", "SupportsUint32", "supportsuint32", "Transferable", "transferable", "UniConverter", "uniconverter", "AsyncStreamCopier", "PlainAsyncStreamCopier", "BinaryInputStream", "PlainBinaryInputStream", "BinaryOutputStream", "PlainBinaryOutputStream", "BufferedOutputStream", "PlainBufferedOutputStream", "ConverterOutputStream", "PlainConverterOutputStream", "FileInputStream", "PlainFileInputStream", "PlainFileOutputStream", "FilePicker", "PlainFilePicker", "Hash", "PlainHash", "PlainLocalFile", "Pipe", "PlainPipe", "Process", "PlainProcess", "Sound", "PlainSound", "ScriptableInputStream", "PlainScriptableInputStream", "ScriptError", "PlainScriptError", "StringInputStream", "PlainStringInputStream", "PlainTimer", "ZipReader", "PlainZipReader", "FileOutputStream", "LocalFile", "Timer", "SupportsBool", "supportsbool", "SupportsString", "supportsstring", "InputStreamPump", "PlainInputStreamPump", "StreamListenerTee", "PlainStreamListenerTee"];
	var {Instances: I} = requireJSM("chrome://dta-modules/content/glue.jsm");
	arrayEqual(Object.keys(I), expected, "Glue Instances are complete");
});

test("weak", function() {
	var ref = 0;
	var o = {
		test: function() { ref++; }
	};
	var {weak} = requireJSM("chrome://dta-modules/content/glue.jsm");
	var w = weak(o);
	equal(o, w.get());
	o.test();
	equal(ref, 1);
	w.get().test();
	equal(ref, 2);
	var bound = o.test.bind(o);
	bound();
	equal(ref, 3);
	var wbound = weak(bound);
	(wbound.get())();
	equal(ref, 4);
});

test("lazy", function() {
	var {lazyProto} = requireJSM("chrome://dta-modules/content/glue.jsm");
	var o = {};
	var io = {1:1};
	var i = 0;
	lazy(o, "testnum", function() 1);
	lazy(o, "teststr", function() "str");
	lazy(o, "testobj", function() io);
	lazy(o, "once", function() ++i);


	ok(true, JSON.stringify(o));

	lazy(o, "except", function() {
		throw new Error("error");
	});

	strictEqual(o.testnum, 1, "numbers");
	strictEqual(o.teststr, "str", "strings");
	strictEqual(o.testobj, io, "objects");
	strictEqual(o.once, 1, "runs at least once");
	strictEqual(o.once, 1, "runs only only (really!)");
	strictEqual(i, 1, "runs only only (counter)");
	throws(function() o.except, Error, "propagates exceptions");
});

test("lazyProto", function() {
	var {lazyProto} = requireJSM("chrome://dta-modules/content/glue.jsm");
	var O = function() {}
	O.prototype = {};
	var io = {1:1};
	var i = 0;
	lazyProto(O.prototype, "testnum", function() 1);
	lazyProto(O.prototype, "teststr", function() "str");
	lazyProto(O.prototype, "testobj", function() io);
	lazyProto(O.prototype, "once", function() ++i);
	lazyProto(O.prototype, "except", function() {
		throw new Error("error");
	});

	var o = new O();
	var o2 = new O();

	strictEqual(o.testnum, 1, "numbers");
	strictEqual(o.teststr, "str", "strings");
	strictEqual(o.testobj, io, "objects");
	strictEqual(o.once, 1, "runs at least once");
	strictEqual(o.once, 1, "runs only only (really!)");
	strictEqual(i, 1, "runs only only (counter)");
	throws(function() o.except, Error, "propagates exceptions");
	throws(function() o.except, Error, "propagates exceptions (cont.)");

	strictEqual(o2.testnum, 1, "numbers");
	strictEqual(o2.teststr, "str", "strings");
	strictEqual(o2.testobj, io, "objects");
	strictEqual(o2.once, 2, "runs at least once");
	strictEqual(o2.once, 2, "runs only only (really!)");
	strictEqual(i, 2, "runs only only (counter)");
	throws(function() o2.except, Error, "propagates exceptions (cont.)");
});

test("lazyProto frozen proto", function() {
	var {lazyProto} = requireJSM("chrome://dta-modules/content/glue.jsm");
	var O = function() {}
	O.prototype = {};
	var io = {1:1};
	var i = 0;
	lazyProto(O.prototype, "testnum", function() 1);
	lazyProto(O.prototype, "teststr", function() "str");
	lazyProto(O.prototype, "testobj", function() io);
	lazyProto(O.prototype, "once", function() ++i);
	lazyProto(O.prototype, "except", function() {
		throw new Error("error");
	});
	Object.freeze(O.prototype);

	var o = new O();
	var o2 = new O();

	strictEqual(o.testnum, 1, "numbers");
	strictEqual(o.teststr, "str", "strings");
	strictEqual(o.testobj, io, "objects");
	strictEqual(o.once, 1, "runs at least once");
	strictEqual(o.once, 1, "runs only only (really!)");
	strictEqual(i, 1, "runs only only (counter)");
	throws(function() o.except, Error, "propagates exceptions");
	throws(function() o.except, Error, "propagates exceptions (cont.)");

	strictEqual(o2.testnum, 1, "numbers");
	strictEqual(o2.teststr, "str", "strings");
	strictEqual(o2.testobj, io, "objects");
	strictEqual(o2.once, 2, "runs at least once");
	strictEqual(o2.once, 2, "runs only only (really!)");
	strictEqual(i, 2, "runs only only (counter)");
	throws(function() o2.except, Error, "propagates exceptions (cont.)");
});

test("lazyProto very frozen", function() {
	var {lazyProto} = requireJSM("chrome://dta-modules/content/glue.jsm");
	var O = function() {}
	O.prototype = {};
	var io = {1:1};
	var i = 0;
	lazyProto(O.prototype, "testnum", function() 1);
	lazyProto(O.prototype, "teststr", function() "str");
	lazyProto(O.prototype, "testobj", function() io);
	lazyProto(O.prototype, "once", function() ++i);
	lazyProto(O.prototype, "except", function() {
		throw new Error("error");
	});
	Object.freeze(O.prototype);

	var o = Object.freeze(new O());
	throws(function() o.testnum, "Cannot mess with frozen objects");
});
