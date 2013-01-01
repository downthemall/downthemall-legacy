module("version.js");

test("exports", function() {
	checkExports("version", ["APP_ID", "APP_NAME", "APP_VERSION", "BASE_VERSION", "ID", "LOCALE", "NAME", "OS", "TOPIC_SHOWABOUT", "VERSION", "ready", "showAbout"]);
});


asyncTest("getVersion", function() {
	var Version = require("version");
	Version.getInfo(function(v) {
		QUnit.start();
		ok(Version == v, "callback gets fed back the original Version");
		for (var k of ["TOPIC_SHOWABOUT", "ID", "LOCALE", "APP_NAME", "OS", "APP_VERSION", "APP_ID", "VERSION", "BASE_VERSION", "NAME"]) {
			ok(k in Version, k + "in Version");
			ok(!!Version[k], k + " is set");
		}
		ok("showAbout" in Version);
		ok("compareVersion" in Version);
		notEqual(Version.VERSION, "0.0", "VERSION was initialized");
		notEqual(Version.BASE_VERSION, "0.0", "BASE_VERSION was initialized");
		equal(Version.VERSION.slice(0, Version.BASE_VERSION.length), Version.BASE_VERSION, "VERSION starts with BASE_VERSION");
	});
});

asyncTest("compare", function() {
	var Version = require("version");
	Version.getInfo(function(v) {
		QUnit.start();
		var cv = Version.compareVersion.bind(v);
		equal(cv(v.VERSION, v.VERSION), 0, "VERSION equals VERSION");
		equal(cv(v.VERSION), 0, "VERSION equals VERSION (omit first param)");
		equal(cv(v.BASE_VERSION, Version.BASE_VERSION), 0, "BASE_VERSION equals BASE_VERSION");
		equal(cv(v.VERSION, "*"), -1, "Version is smaller than Inf");
		equal(cv("*"), -1, "Version is smaller than Inf (omit)");
		equal(cv(v.VERSION, "2"), 1, "Version is smaller than Inf");
		equal(cv("2"), 1, "Version is smaller than Inf (omit)");
		ok(cv(v.VERSION, v.BASE_VERSION) >= 0, "VERSION is gte BASE_VERSION");
	});
})
