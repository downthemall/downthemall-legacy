"use strict";
/* globals module, test, asyncTest, checkExports, QUnit, equal, strictEqual, deepEqual, arrayEqual, ok, throws, start */
module("support/batchgen.js");

test("exports", function() {
	checkExports("support/batchgen", ["BatchGenerator"]);
});

test("literal", function() {
	const {BatchGenerator} = require("support/batchgen");
	var b = new BatchGenerator({url:"literal", usable:"literal"});
	strictEqual(b.last, b.first);
	strictEqual(b.last, "literal");
	strictEqual(b.parts, "");
	strictEqual(b.length, 1);
});

test("num regular", function() {
	const {BatchGenerator} = require("support/batchgen");
	var b = new BatchGenerator({url:"literal[1:5]", usable:"literal[1:5]"});
	strictEqual(b.first, "literal1");
	strictEqual(b.last, "literal5");
	strictEqual(b.parts, "[1:5]");
	strictEqual(b.length, 5);
});

test("num reverse", function() {
	const {BatchGenerator} = require("support/batchgen");
	var b = new BatchGenerator({url:"literal[5:1:-1]", usable:"literal[5:1:-1]"});
	strictEqual(b.first, "literal5");
	strictEqual(b.last, "literal1");
	strictEqual(b.parts, "[5:1:-1]");
	strictEqual(b.length, 5);
});

test("num step", function() {
	const {BatchGenerator} = require("support/batchgen");
	var b = new BatchGenerator({url:"literal[1:10:3]", usable:"literal[1:10:3]"});
	strictEqual(b.first, "literal1");
	strictEqual(b.last, "literal10");
	strictEqual(b.parts, "[1:10:3]");
	strictEqual(b.length, 4);
	var r = [];
	for (let l of b.getURLs()) {
		r.push(l);
	}
	deepEqual(r, ["literal1", "literal4", "literal7", "literal10"]);
});
test("num step front/end", function() {
	const {BatchGenerator} = require("support/batchgen");
	var b = new BatchGenerator({url:"literal[1:10:3]literal", usable:"literal[1:10:3]literal"});
	strictEqual(b.first, "literal1literal");
	strictEqual(b.last, "literal10literal");
	strictEqual(b.parts, "[1:10:3]");
	strictEqual(b.length, 4);
	var r = [];
	for (let l of b.getURLs()) {
		r.push(l);
	}
	deepEqual(r, ["literal1literal", "literal4literal", "literal7literal", "literal10literal"]);
});

test("num reverse invalid", function() {
	const {BatchGenerator} = require("support/batchgen");
	var b = new BatchGenerator({url:"literal[1:5:-1]", usable:"literal[1:5:-1]"});
	strictEqual(b.first, b.last);
	strictEqual(b.last, "literal[1:5:-1]");
	deepEqual(b.parts, "");
	deepEqual(b.length, 1);
});

test("char regular", function() {
	const {BatchGenerator} = require("support/batchgen");
	var b = new BatchGenerator({url:"literal[a:e]", usable:"literal[a:e]"});
	strictEqual(b.first, "literala");
	strictEqual(b.last, "literale");
	strictEqual(b.parts, "[a:e]");
	strictEqual(b.length, 5);
});

test("char reverse", function() {
	const {BatchGenerator} = require("support/batchgen");
	var b = new BatchGenerator({url:"literal[e:a:-1]", usable:"literal[e:a:-1]"});
	strictEqual(b.first, "literale");
	strictEqual(b.last, "literala");
	strictEqual(b.parts, "[e:a:-1]");
	strictEqual(b.length, 5);
});

test("char step", function() {
	const {BatchGenerator} = require("support/batchgen");
	var b = new BatchGenerator({url:"literal[a:e:3]", usable:"literal[a:e:3]"});
	strictEqual(b.first, "literala");
	strictEqual(b.last, "literald");
	strictEqual(b.parts, "[a:e:3]");
	strictEqual(b.length, 2);
	var r = [];
	for (let l of b.getURLs()) {
		r.push(l);
	}
	deepEqual(r, ["literala", "literald"]);
});

test("char reverse invalid", function() {
	const {BatchGenerator} = require("support/batchgen");
	var b = new BatchGenerator({url:"literal[a:e:-1]", usable:"literal[a:e:-1]"});
	strictEqual(b.first, b.last);
	strictEqual(b.last, "literal[a:e:-1]");
	deepEqual(b.parts, "");
	deepEqual(b.length, 1);
});
