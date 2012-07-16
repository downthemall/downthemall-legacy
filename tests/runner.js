QUnit.config.autostart = false;
QUnit.extend(QUnit, {
	arrayEqual: function arrayEqual(actual, expected, message) {
		[actual, expected] = [actual.slice(0).sort(), expected.slice(0).sort()];
		QUnit.deepEqual(actual, expected, message);
	}
});
const arrayEqual = QUnit.arrayEqual;

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const Exception = Components.Exception;

Cu.import("chrome://dta-modules/content/glue.jsm");

const DTA = require("api");

function checkExports(m, exports) {
	arrayEqual(
		Object.keys(require(m)),
		exports,
		"Correct exports"
		);
}

function getRelURI(relPath) {
	var testURI = Services.io.newURI(location.href, null, null);
	testURI = Services.io.newURI(relPath, null, testURI);
	const ChromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry);
	return ChromeRegistry.convertChromeURL(testURI);
}

addEventListener("load", function load() {
	"use strict";
	removeEventListener("load", load, false);
	QUnit.start();
}, false);
