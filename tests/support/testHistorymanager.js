module("historymanager.jsm");
(function() {
	function SetupHistoryManager(key) {
		this.key = key;
		this.setup();
	}
	SetupHistoryManager.prototype = {
		prefs: importModule("resource://dta/preferences.jsm"),
		setup: function () {
			this.old = this.prefs.getExt(this.key, "");
			this.prefs.resetExt(this.key);
		},
		restore: function () {
			this.prefs.setExt(this.key, this.old);
		}
	};

	test("exports", function() {
		deepEqual(Object.keys(importModule("resource://dta/support/historymanager.jsm")), ["getHistory"], "Correct exports");
	});

	test("regular", function() {
		var {getHistory} = importModule("resource://dta/support/historymanager.jsm");
		var h = getHistory("testHistory");
		deepEqual(h.values, [], "new history must be empty");
		h.push("foo");
		deepEqual(h.values, ["foo"], "push to empty");
		h.push("bar");
		deepEqual(h.values, ["bar", "foo"], "push will unshift");
		h.push("foo");
		deepEqual(h.values, ["foo", "bar"], "no duplicates");
		h.reset();
		deepEqual(h.values, [], "reset");
	});

	test("filter", function() {
		var s = new SetupHistoryManager("filter");
		try {
			var {getHistory} = importModule("resource://dta/support/historymanager.jsm");
			var h = getHistory("filter");
			ok(h.values && h.values.length, "values is set and not empty");
			h.reset();
			ok(h.values && h.values.length, "values is set and not empty after reset");
			h.push("dude");
			equals(h.values[0], "dude", "pushing works");
		}
		finally {
			s.restore();
		}
	});

	test("directory", function() {
		var s = new SetupHistoryManager("directory");
		try {
			var {getHistory} = importModule("resource://dta/support/historymanager.jsm");
			var h = getHistory("directory");
			h.reset();
			deepEqual(h.values, [], "directory hist gets empty");
			h.push("C:\\");
			h.push("/home/");
			equals(h.values.length, 1, "Validator at work");
		}
		finally {
			s.restore();
		}
	});
})();
