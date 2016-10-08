"use strict";
/* globals module, test, asyncTest, expect, checkExports, QUnit, equal, strictEqual, deepEqual, arrayEqual, ok, throws*/
module("support/historymanager.js");

(function() {
	function SetupHistoryManager(key) {
		this.key = key;
		this.setup();
	}
	SetupHistoryManager.prototype = {
		prefs: require("preferences"),
		setup: function () {
			this.old = this.prefs.getExt(this.key, "");
			this.prefs.resetExt(this.key);
		},
		restore: function () {
			this.prefs.setExt(this.key, this.old);
		}
	};
	test("exports", function() {
		checkExports("support/historymanager", ["getHistory"]);
	});
	test("regular", function() {
		var {getHistory} = require("support/historymanager");
		var h = getHistory("testHistory");
		deepEqual(h.values, [], "new history must be empty");
		h.push("foo");
		deepEqual(h.values, ["foo"], "push to empty");
		h.push("bar");
		deepEqual(h.values, ["bar", "foo"], "push will unshift");
		h.push("foo");
		deepEqual(h.values, ["foo", "bar"], "no duplicates");
		h.push("foo2", true);
		deepEqual(h.values, ["foo", "foo2", "bar"], "once");
		h.push("foo", true);
		deepEqual(h.values, ["foo", "foo2", "bar"], "no duplicates, once");
		h.push("foo2", true);
		deepEqual(h.values, ["foo", "foo2", "bar"], "no duplicates 2, once");
		h.reset();
		deepEqual(h.values, [], "reset");
	});
	test("private", function() {
		var {getHistory} = require("support/historymanager");
		var h = getHistory("testHistory", true);
		deepEqual(h.values, [], "new history must be empty");
		h.push("foo");
		deepEqual(h.values, ["foo"], "push to empty");
		h.push("bar");
		deepEqual(h.values, ["bar", "foo"], "push will unshift");
		h.push("foo");
		deepEqual(h.values, ["foo", "bar"], "no duplicates");
		h.push("foo2", true);
		deepEqual(h.values, ["foo", "foo2", "bar"], "once");
		h.push("foo", true);
		deepEqual(h.values, ["foo", "foo2", "bar"], "no duplicates, once");
		h.push("foo2", true);
		deepEqual(h.values, ["foo", "foo2", "bar"], "no duplicates 2, once");
		deepEqual(getHistory("testHistory", true).values, ["foo", "foo2", "bar"], "no duplicates 2, once + reget");
		deepEqual(getHistory("testHistory", false).values, [], "mustn't modify non-private history");
		h.reset();
		deepEqual(h.values, [], "reset");
	});

	test("filter", function() {
		var s = new SetupHistoryManager("filter");
		try {
			var {getHistory} = require("support/historymanager");
			var h = getHistory("filter");
			ok(h.values && h.values.length, "values is set and not empty");
			h.reset();
			ok(h.values && h.values.length, "values is set and not empty after reset");
			h.push("dude");
			equal(h.values[0], "dude", "pushing works");
		}
		finally {
			s.restore();
		}
	});

	test("directory", function() {
		var s = new SetupHistoryManager("directory");
		try {
			var {getHistory} = require("support/historymanager");
			var h = getHistory("directory");
			h.reset();
			deepEqual(h.values, [], "directory hist gets empty");
			h.push("C:\\");
			h.push("/home/");
			equal(h.values.length, 1, "Validator at work");
		}
		finally {
			s.restore();
		}
	});
	test("directory private", function() {
		var s = new SetupHistoryManager("directory");
		try {
			var {getHistory} = require("support/historymanager");
			var h = getHistory("directory", true);
			h.reset();
			deepEqual(h.values, [], "directory hist gets empty");
			h.push("C:\\");
			h.push("/home/");
			equal(h.values.length, 1, "Validator at work");
		}
		finally {
			s.restore();
		}
	});
})();
