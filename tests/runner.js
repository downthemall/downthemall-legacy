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

function checkExports(m, exports) {
	arrayEqual(
		Object.keys(require(m)),
		exports,
		"Correct exports"
		);
}

function getFile(relPath) {
	var path = location.href.replace("index.html", "") + relPath;
	var testURI = Services.io.newURI(path, null, null);
	const ChromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry);
	testURI = ChromeRegistry.convertChromeURL(testURI);

	return testURI.QueryInterface(Ci.nsIFileURL).file;
}

addEventListener("load", function load() {
	"use strict";
	removeEventListener("load", load, false);
	QUnit.start();
}, false);
