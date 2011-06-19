QUnit.config.autostart = false;

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const Exception = Components.Exception;

Cu.import("resource://gre/modules/Services.jsm");

function importModule(aSrc) {
	var rv = {};
	Cu.import(aSrc, rv);
	return rv;
}

addEventListener("load", function load() {
	"use strict";
	removeEventListener("load", load, false);
	QUnit.start();
}, false);
