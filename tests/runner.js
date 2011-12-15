QUnit.config.autostart = false;

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const Exception = Components.Exception;

Cu.import("resource://dta/glue.jsm");

function importModule(aSrc) {
	var rv = {};
	Cu.import(aSrc, rv);
	return rv;
}

function checkExports(m, exports) {
	deepEqual(
		Object.keys(importModule(m)),
		exports,
		"Correct exports"
		);
}

addEventListener("load", function load() {
	"use strict";
	removeEventListener("load", load, false);
	QUnit.start();
}, false);
