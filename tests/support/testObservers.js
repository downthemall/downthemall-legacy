module("support/observers.js");

test("exports", function() {
	checkExports("support/observers", ["add", "remove", "topics", "notify", "notifyLocal"]);
});

test("plain", function() {
	var obs = require("support/observers");
	var i = 0;
	var o = function(s, t, d) {
		++i;
	}
	var topics = obs.topics;
	obs.add(o, "dta-test-topic");
	topics.push("dta-test-topic");
	arrayEqual(obs.topics, topics, topics);
	topics.length -= 1;

	obs.notify(null, "dta-test-topic", null);

	obs.remove(o, "dta-test-topic");
	arrayEqual(obs.topics, topics, topics);

	// must not be observed
	obs.notify(null, "dta-test-topic", null);

	strictEqual(i, 1);
});

test("observer", function() {
	var obs = require("support/observers");
	var i = 0;
	var o = {
		observe: function(s, t, d) {
			++i;
		}
	};
	var o2 = {
			observe: function(s, t, d) {
				++i;
			}
	};
	var topics = obs.topics;
	obs.add(o, "dta-test-topic");
	obs.add(o2, "dta-test-topic");
	topics.push("dta-test-topic");
	arrayEqual(obs.topics, topics, topics);
	topics.length -= 1;

	Services.obs.notifyObservers(null, "dta-test-topic", null);
	obs.remove(o, "dta-test-topic");
	topics.push("dta-test-topic");
	arrayEqual(obs.topics, topics, topics);
	topics.length -= 1;
	obs.remove(o2, "dta-test-topic");
	arrayEqual(obs.topics, topics, topics);

	// must not be observed
	Services.obs.notifyObservers(null, "dta-test-topic", null);

	strictEqual(i, 2);
});

test("notify/Local", function() {
	var obs = require("support/observers");
	var i = 0;
	var og = {
			observe: function(s, t, d) {
				++i;
			}
	};
	var ol = {
			observe: function(s, t, d) {
				++i;
			}
	};

	obs.add(ol, "dta-test-topic");
	Services.obs.addObserver(og, "dta-test-topic", false);

	obs.notify(null, "dta-test-topic", null);
	obs.notifyLocal(null, "dta-test-topic", null);

	obs.remove(ol, "dta-test-topic");
	Services.obs.removeObserver(og, "dta-test-topic");

	obs.notify(null, "dta-test-topic", null);
	obs.notifyLocal(null, "dta-test-topic", null);

	strictEqual(i, 3);
});

test("errors", function() {
	var obs = require("support/observers");
	throws(function() obs.add());
	throws(function() obs.add(null));
	throws(function() obs.add(null, null));
	throws(function() obs.add(function() {}, null));
	throws(function() obs.remove());
	throws(function() obs.remove(null));
	throws(function() obs.remove(null, null));
	throws(function() obs.remove(function() {}, null));
	notThrows(function removenonexisting() obs.remove({}, "dta-test-not-registered"));
});

test("exceptions", function() {
	function e() {
		throw new Error("test");
	}
	function r() {
		++i;
	}
	var i = 0;
	var obs = require("support/observers");
	notThrows(function badobserver() {
		obs.add(e, "dta-test-topic");
		obs.add(r, "dta-test-topic");
		obs.notify(null, "dta-test-topic", null);
		obs.remove(e, "dta-test-topic");
		obs.remove(r, "dta-test-topic");
		obs.notify(null, "dta-test-topic", null);
	});
	strictEqual(i, 1, "observed");
});
