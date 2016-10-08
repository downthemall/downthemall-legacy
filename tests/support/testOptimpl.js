"use strict";
/* jshint browser:true */
/* globals module, test, asyncTest, expect, checkExports, QUnit, equal, strictEqual, deepEqual, arrayEqual, ok */
module("support/optimpl.js");

test("exports", function() {
	checkExports("support/optimpl", ["NullCancel", "createOptimizedImplementation"]);
});

asyncTest("non-existant", function() {
	function cb(result) {
		QUnit.start();
		strictEqual(result, "non-worker");
	};
	const {createOptimizedImplementation} = require("support/optimpl");
	var impl = createOptimizedImplementation(
		"non-existant",
		impl => cb => impl(null, cb),
		() => cb("non-worker")
		);
	setTimeout(() => impl.callImpl(cb), 500);
});

asyncTest("worker", function() {
	function cb(result) {
		QUnit.start();
		strictEqual(result, "worker");
	};
	const {createOptimizedImplementation} = require("support/optimpl");
	var impl = createOptimizedImplementation(
		"tests/worker",
		impl => cb => impl({}, cb),
		() => cb("non-worker")
		);
	setTimeout(() => impl.callImpl(cb), 500);
});

asyncTest("workerThrow", function() {
	function cb(result) {
		QUnit.start();
		strictEqual(result, "non-worker");
	};
	const {createOptimizedImplementation} = require("support/optimpl");
	var impl = createOptimizedImplementation(
			"tests/workerThrow",
			impl => cb => impl({}, cb),
			() => cb("non-worker")
	);
	setTimeout(() => impl.callImpl(cb), 50);
});

asyncTest("workerFail", function() {
	function cb(result) {
		QUnit.start();
		strictEqual(result, "non-worker");
	};
	const {createOptimizedImplementation} = require("support/optimpl");
	var impl = createOptimizedImplementation(
			"tests/workerFail",
			impl => cb => impl({}, cb),
			() => cb("non-worker")
	);
	setTimeout(() => impl.callImpl(cb), 50);
});
