module("support/memoize.js");

test("exports", function() {
	checkExports("support/memoize", ["memoize"]);
});

test("yield 1", function() {
	const {memoize} = require("support/memoize");
	const fn = memoize(function(a) a + 1);
	strictEqual(fn(1), 2);
});
test("yield 2", function() {
	const {memoize} = require("support/memoize");
	const fn = memoize(function(a, b) a + b);
	strictEqual(fn(1, 2), 3);
});

test("yield 3", function() {
	const {memoize} = require("support/memoize");
	const fn = memoize(function(a, b, c) a + b + c);
	strictEqual(fn(1, 2, 3), 6);
});

test("yield 4", function() {
	const {memoize} = require("support/memoize");
	const fn = memoize(function(a, b, c, d) a + b + c + d);
	strictEqual(fn(1, 2, 3, 4), 10);
});

test("yield 4", function() {
	const {memoize} = require("support/memoize");
	const fn = memoize(function(a, b, c, d, e) a + b + c + d + e);
	strictEqual(fn(1, 2, 3, 4, 5), 15);
});

test("yield same", function() {
	const {memoize} = require("support/memoize");
	var hits = 0;
	const fn = memoize(function(a) {
		++hits;
		return a;
	});
	strictEqual(fn(1), 1);
	strictEqual(hits, 1);
	strictEqual(fn(1), 1);
	strictEqual(hits, 1);
	strictEqual(fn(2), 2);
	strictEqual(hits, 2);
	strictEqual(fn(2), 2);
	strictEqual(hits, 2);
});

test("yield same + pressure", function() {
	const {memoize} = require("support/memoize");
	var hits = 0;
	const fn = memoize(function(a) {
		++hits;
		return a;
	});
	strictEqual(fn(1), 1);
	strictEqual(hits, 1);
	strictEqual(fn(1), 1);
	strictEqual(hits, 1);
	strictEqual(fn(2), 2);
	strictEqual(hits, 2);
	strictEqual(fn(2), 2);
	strictEqual(hits, 2);

	Services.obs.notifyObservers(null, "memory-pressure", "heap-minimize");

	strictEqual(fn(1), 1);
	strictEqual(hits, 3);
	strictEqual(fn(1), 1);
	strictEqual(hits, 3);
	strictEqual(fn(2), 2);
	strictEqual(hits, 4);
	strictEqual(fn(2), 2);
	strictEqual(hits, 4);
});

test("yield cache overflow", function() {
	const {memoize} = require("support/memoize");
	var hits = 0;
	const fn = memoize(function(a) {
		++hits;
		return a;
	}, 10);
	for (var i = 0; i < 20; ++i) {
		fn(i);
	}
	strictEqual(fn(1), 1);
	strictEqual(hits, 21);
	strictEqual(fn(1), 1);
	strictEqual(hits, 21);
});
