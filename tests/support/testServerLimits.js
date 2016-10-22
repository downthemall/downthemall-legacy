"use strict";
/* jshint browser:true */
/* globals module, test, asyncTest, expect, checkExports, QUnit, equal, strictEqual, deepEqual, arrayEqual, ok */
module("support/serverlimits.js");

test("exports", function() {
	checkExports("support/serverlimits", [
		"DirScheduler",
		"FairScheduler",
		"FastScheduler",
		"LegacyScheduler",
		"Limit",
		"RndScheduler",
		"addLimit",
		"getConnectionScheduler",
		"getEffectiveHost",
		"getLimitFor",
		"getServerBucket",
		"killServerBuckets",
		"listLimits"
		]);
});

function* serverlimits_generateHosts() {
	for (let num = 2; num < 9; ++num) {
		yield {domain: `test${num}.host`, num};
	}
}
function* serverlimits_generateQueue() {
	const {QUEUED, COMPLETE, FINISHING} = require("constants");
	for (let state of [QUEUED, COMPLETE, FINISHING]) {
		for (let host of serverlimits_generateHosts()) {
			for (let i = 1; i < 5; ++i) {
				yield {
					state: state,
					totalSize: i << 20,
					urlManager: host,
					file: `file${i}`,
					destinationPath: `file${i}`
				};
			}
		}
	}
}

test("legacy", function() {
	const {QUEUED, COMPLETE, FINISHING} = require("constants");
	const {LegacyScheduler} = require("support/serverlimits");
	let queue = Array.from(serverlimits_generateQueue());
	let generated = [];
	var generator = new LegacyScheduler(queue);
	let gen;
	while (gen = generator.next()) {
		generated.push(gen);
	}
	let expected = queue.filter(e => e.state === QUEUED);
	deepEqual(generated, expected);
});

test("legacy tho limit", function() {
	const {QUEUED, COMPLETE, FINISHING} = require("constants");
	const {LegacyScheduler, addLimit} = require("support/serverlimits");
	let limits = [];
	for (let host of serverlimits_generateHosts()) {
		let limit = addLimit(host.domain);
		limit.connections = host.num - 1;
		limit.save();
		limits.push(limit);
	}
	try {
		let queue = Array.from(serverlimits_generateQueue());
		let generated = [];
		var generator = new LegacyScheduler(queue);
		let gen;
		while (gen = generator.next()) {
			generated.push(gen);
		}
    let expected = queue.filter(e => e.state === QUEUED);
		deepEqual(generated, expected);
	}
	catch (ex) {
		limits.forEach(l => l.remove());
	}
});

test("fast", function() {
	const {QUEUED, COMPLETE, FINISHING, RUNNING} = require("constants");
	const {FastScheduler, addLimit} = require("support/serverlimits");
	let limits = [];
	for (let host of serverlimits_generateHosts()) {
		let limit = addLimit(host.domain);
		limit.connections = host.num - 1;
		limit.save();
		limits.push(limit);
	}
	try {
		let queue = Array.from(serverlimits_generateQueue());
		let generated = [];
		var generator = new FastScheduler(queue);
		let gen;
		while (gen = generator.next(new Set(generated))) {
			gen.state = RUNNING;
			generated.push(gen);
		}
		let actual = generated.map(e => `${e.urlManager.domain}/${e.file}`);
		deepEqual(actual, [
			  "test2.host/file1",
			  "test3.host/file1",
			  "test3.host/file2",
			  "test4.host/file1",
			  "test4.host/file2",
			  "test4.host/file3",
			  "test5.host/file1",
			  "test5.host/file2",
			  "test5.host/file3",
			  "test5.host/file4",
			  "test6.host/file1",
			  "test6.host/file2",
			  "test6.host/file3",
			  "test6.host/file4",
			  "test7.host/file1",
			  "test7.host/file2",
			  "test7.host/file3",
			  "test7.host/file4",
			  "test8.host/file1",
			  "test8.host/file2",
			  "test8.host/file3",
			  "test8.host/file4"
		]);
	}
	catch (ex) {
		limits.forEach(l => l.remove());
	}
});

test("fair", function() {
	const {QUEUED, COMPLETE, FINISHING, RUNNING} = require("constants");
	const {FairScheduler, addLimit} = require("support/serverlimits");
	let limits = [];
	for (let host of serverlimits_generateHosts()) {
		let limit = addLimit(host.domain);
		limit.connections = host.num - 1;
		limit.save();
		limits.push(limit);
	}
	try {
		let queue = Array.from(serverlimits_generateQueue());
		let generated = [];
		var generator = new FairScheduler(queue);
		let gen;
		while (gen = generator.next(new Set(generated))) {
			gen.state = RUNNING;
			generated.push(gen);
		}
		let actual = generated.map(e => `${e.urlManager.domain}/${e.file}`);
		deepEqual(actual, [
		  "test2.host/file1",
		  "test3.host/file1",
		  "test4.host/file1",
		  "test5.host/file1",
		  "test6.host/file1",
		  "test7.host/file1",
		  "test8.host/file1",
		  "test3.host/file2",
		  "test4.host/file2",
		  "test5.host/file2",
		  "test6.host/file2",
		  "test7.host/file2",
		  "test8.host/file2",
		  "test4.host/file3",
		  "test5.host/file3",
		  "test6.host/file3",
		  "test7.host/file3",
		  "test8.host/file3",
		  "test5.host/file4",
		  "test6.host/file4",
		  "test7.host/file4",
		  "test8.host/file4"
		]);
	}
	catch (ex) {
		limits.forEach(l => l.remove());
	}
});

test("dir", function() {
	const {QUEUED, COMPLETE, FINISHING, RUNNING} = require("constants");
	const {DirScheduler, addLimit} = require("support/serverlimits");
	let limits = [];
	for (let host of serverlimits_generateHosts()) {
		let limit = addLimit(host.domain);
		limit.connections = host.num - 1;
		limit.save();
		limits.push(limit);
	}
	try {
		let queue = Array.from(serverlimits_generateQueue());
		let generated = [];
		var generator = new DirScheduler(queue);
		let gen;
		while (gen = generator.next(new Set(generated))) {
			gen.state = RUNNING;
			generated.push(gen);
		}
		let actual = generated.map(e => `${e.urlManager.domain}/${e.destinationPath}`);
		deepEqual(actual, [
		  "test8.host/file1",
		  "test8.host/file2",
		  "test8.host/file3",
		  "test8.host/file4",
		  "test7.host/file1",
		  "test7.host/file2",
		  "test7.host/file3",
		  "test7.host/file4",
		  "test6.host/file1",
		  "test6.host/file2",
		  "test6.host/file3",
		  "test6.host/file4",
		  "test5.host/file1",
		  "test5.host/file2",
		  "test5.host/file3",
		  "test5.host/file4"
		]);
	}
	catch (ex) {
		limits.forEach(l => l.remove());
	}
});
