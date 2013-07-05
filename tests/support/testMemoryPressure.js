module("support/memorypressure.js");

test("exports", function() {
	checkExports("support/memorypressure", ["add", "remove", "notify"]);
});

test("plain", 1, function() {
	var mp = require("support/memorypressure");
	var o = function(s, t, d) {
		strictEqual(t, "memory-pressure");
	}
	mp.add(o);
	Services.obs.notifyObservers(null, "memory-pressure", "heap-minimize");
	mp.remove(o);
	Services.obs.notifyObservers(null, "memory-pressure", "heap-minimize");
});

test("observer", 1, function() {
	var mp = require("support/memorypressure");
	var o = {
		observe: function(s, t, d) {
			strictEqual(t, "memory-pressure");
		}
	};
	mp.add(o);
	Services.obs.notifyObservers(null, "memory-pressure", "heap-minimize");
	mp.remove(o);
	Services.obs.notifyObservers(null, "memory-pressure", "heap-minimize");
});
