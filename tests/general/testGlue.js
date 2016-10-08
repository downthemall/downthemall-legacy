"use strict";
module("glue.jsm");

test("Service contents", function() {
	var {Services: S1} = requireJSM("chrome://dta-modules/content/glue.jsm");
	var {Services: S2} = requireJSM("resource://gre/modules/Services.jsm");

	var k2 = Object.keys(S2);
	arrayEqual(Object.keys(S1.__proto__), k2, "Glue Services contains Services.jsm");
	// TODO: comprehensions arrayEqual([k for (k in S1)], Object.keys(S1).concat(k2), "All glue Services accessible (sans dupes)");
});

test("Instances contents", function() {
	var expected = [
		"AsyncStreamCopier",
		"AsyncStreamCopier2",
		"BinaryInputStream",
		"BinaryOutputStream",
		"BufferedOutputStream",
		"ConverterOutputStream",
		"DOMSerializer",
		"FileInputStream",
		"FileOutputStream",
		"FilePicker",
		"Hash",
		"InputStreamPump",
		"LocalFile",
		"MimeInputStream",
		"Pipe",
		"PlainAsyncStreamCopier",
		"PlainAsyncStreamCopier2",
		"PlainBinaryInputStream",
		"PlainBinaryOutputStream",
		"PlainBufferedOutputStream",
		"PlainConverterOutputStream",
		"PlainFileInputStream",
		"PlainFileOutputStream",
		"PlainFilePicker",
		"PlainHash",
		"PlainInputStreamPump",
		"PlainLocalFile",
		"PlainPipe",
		"PlainProcess",
		"PlainScriptError",
		"PlainScriptableInputStream",
		"PlainSound",
		"PlainStreamListenerTee",
		"PlainStringInputStream",
		"PlainTimer",
		"PlainZipReader",
		"Process",
		"ScriptError",
		"ScriptableInputStream",
		"Sound",
		"StreamListenerTee",
		"StringInputStream",
		"SupportsArray",
		"SupportsBool",
		"SupportsInt32",
		"SupportsInterfacePointer",
		"SupportsString",
		"SupportsUint32",
		"Timer",
		"Transferable",
		"UniConverter",
		"XHR",
		"ZipReader",
		"domserializer",
		"mimeinputstream",
		"supportsarray",
		"supportsbool",
		"supportsint32",
		"supportsinterfacepointer",
		"supportsstring",
		"supportsuint32",
		"transferable",
		"uniconverter",
		"xhr"
	];
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
	lazy(o, "testnum", () => 1);
	lazy(o, "teststr", () => "str");
	lazy(o, "testobj", () => io);
	lazy(o, "once", () => ++i);


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
	throws(() => o.except, Error, "propagates exceptions");
});

test("lazyProto", function() {
	var {lazyProto} = requireJSM("chrome://dta-modules/content/glue.jsm");
	var O = function() {}
	O.prototype = {};
	var io = {1:1};
	var i = 0;
	lazyProto(O.prototype, "testnum", () => 1);
	lazyProto(O.prototype, "teststr", () => "str");
	lazyProto(O.prototype, "testobj", () => io);
	lazyProto(O.prototype, "once", () => ++i);
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
	throws(() => o.except, Error, "propagates exceptions");
	throws(() => o.except, Error, "propagates exceptions (cont.)");

	strictEqual(o2.testnum, 1, "numbers");
	strictEqual(o2.teststr, "str", "strings");
	strictEqual(o2.testobj, io, "objects");
	strictEqual(o2.once, 2, "runs at least once");
	strictEqual(o2.once, 2, "runs only only (really!)");
	strictEqual(i, 2, "runs only only (counter)");
	throws(() => o2.except, Error, "propagates exceptions (cont.)");
});

test("lazyProto frozen proto", function() {
	var {lazyProto} = requireJSM("chrome://dta-modules/content/glue.jsm");
	var O = function() {}
	O.prototype = {};
	var io = {1:1};
	var i = 0;
	lazyProto(O.prototype, "testnum", () => 1);
	lazyProto(O.prototype, "teststr", () => "str");
	lazyProto(O.prototype, "testobj", () => io);
	lazyProto(O.prototype, "once", () => ++i);
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
	throws(() => o.except, Error, "propagates exceptions");
	throws(() => o.except, Error, "propagates exceptions (cont.)");

	strictEqual(o2.testnum, 1, "numbers");
	strictEqual(o2.teststr, "str", "strings");
	strictEqual(o2.testobj, io, "objects");
	strictEqual(o2.once, 2, "runs at least once");
	strictEqual(o2.once, 2, "runs only only (really!)");
	strictEqual(i, 2, "runs only only (counter)");
	throws(() => o2.except, Error, "propagates exceptions (cont.)");
});

test("lazyProto very frozen", function() {
	var {lazyProto} = requireJSM("chrome://dta-modules/content/glue.jsm");
	var O = function() {}
	O.prototype = {};
	var io = {1:1};
	var i = 0;
	lazyProto(O.prototype, "testnum", () => 1);
	lazyProto(O.prototype, "teststr", () => "str");
	lazyProto(O.prototype, "testobj", () => io);
	lazyProto(O.prototype, "once", () => ++i);
	lazyProto(O.prototype, "except", function() {
		throw new Error("error");
	});
	Object.freeze(O.prototype);

	var o = Object.freeze(new O());
	throws(() => o.testnum, "Cannot mess with frozen objects");
});

test("require recursive", function() {
	var {require} = requireJSM("chrome://dta-modules/content/glue.jsm");

	var rec = require("testsupport/require/recursive");
	strictEqual(rec.a, 1);
	strictEqual(rec.a, rec.b);
	strictEqual(rec.a + 1, rec.c);
	strictEqual(rec.a + 2, rec.d);
});

test("require cyclic", function() {
	var {require} = requireJSM("chrome://dta-modules/content/glue.jsm");

	var a = require('testsupport/require/cyclicA');
	var b = require('testsupport/require/cyclicB');

	ok(a.a, 'a exists');
	ok(b.b, 'b exists')
	strictEqual(a.a().b, b.b, 'a gets b');
	strictEqual(b.b().a, a.a, 'b gets a');
});

test("LRUMap", function() {
	var {LRUMap} = requireJSM("chrome://dta-modules/content/glue.jsm");
	let map = new LRUMap(2);
	strictEqual(map.limit, 2, "correct limit");
	strictEqual(map.capacity, map.limit, "correct capacity");
	strictEqual(map.free, map.limit, "correct initial free");
	ok(!map.has("a"), "pre-check");
	map.set("a", "b");
	ok(map.has("a"), "correctly set");
	strictEqual(map.get("a"), "b", "correct value");
	strictEqual(map.free, 1, "correct free");

	map.set(1, 2);
	ok(map.has(1), "correctly set (num)");
	ok(!map.has("1"), "not string-coerced");
	strictEqual(map.get(1), 2, "correct value (num)");
	strictEqual(map.free, 0, "correct free");

	map.set("a", "b");

	map.set(Math.NaN, 3);
	ok(map.has(Math.NaN), "correctly set (NaN)");
	strictEqual(map.get(Math.NaN), 3, "correct value (NaN)");
	strictEqual(map.free, 0, "correct initial free");
	map.delete(Math.NaN);
	strictEqual(map.get(Math.NaN), undefined, "correct removal (NaN)");
	strictEqual(map.free, 1, "correct free");

	ok(map.has("a"), "correctly lrued");
	strictEqual(map.get("a"), "b", "correct value");

	map.set("b", null);
	ok(map.has("a"), "correctly purged earlier");
	ok(!map.has(1), "correctly deleted earlier");
	ok(map.has("b"), "correctly inserted after limit");
	strictEqual(map.get("b"), null, "correct value after limit");
	strictEqual(map.free, 0, "correct free");

	strictEqual(JSON.stringify(map), "[[\"a\",\"b\"],[\"b\",null]]", "correct serialization");
	map.set(2, undefined);
	strictEqual(JSON.stringify(map), "[[\"b\",null],[2,null]]", "correct serialization of undefined");

	let map2 = new LRUMap(2, JSON.parse(JSON.stringify(map)));
	strictEqual(JSON.stringify(map2), JSON.stringify(map), "stringify the same");

	throws(() => new LRUMap(), "Must provide limit");
	throws(() => new LRUMap(0), "Limit cannot be null");
	throws(() => new LRUMap(-1), "... or negative");
	throws(() => new LRUMap(NaN), "... or NaN");
	throws(() => new LRUMap(1.1), "... or a float");
	let keys1 = [];
	for (let i in map) {
		keys1.push(i);
	}
	let keys2 = Array.from(Object.keys(map));
	arrayEqual(keys1, keys2, "keys/enumerable the same");
	strictEqual(JSON.stringify(keys2), "[]", "correct enumerable keys");
});
