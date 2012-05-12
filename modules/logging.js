/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const global = this;
const reportError = reportError;

var UNKNOWN_STACK = {
	stackMsg: "",
	sourceName: "unknown",
	sourceLine: "",
	lineNumber: 0,
	columnNumber: 0
};
Object.freeze(UNKNOWN_STACK);

function prepareStack(stack) {
	if (!stack || !(stack instanceof Ci.nsIStackFrame)) {
		stack = Components.stack;
		for (let i = 0; stack && i < 2; ++i) {
			stack = stack.caller;
		}
		if (!stack) {
			return UNKNOWN_STACK;
		}
	}
	let rv = {};
	rv.sourceName = (stack.filename || "unknown").replace("resource://dta/glue.jsm -> ", "");
	rv.sourceLine = stack.sourceLine;
	rv.lineNumber = stack.lineNumber;
	let message = [];
	for (let i = 0; stack && i < 6; ++i, stack = stack.caller) {
		if (stack.lineNumber) {
			message.push("\t"
					+ (stack.name || "[anonymous]")
					+ "() @ "
					+ (stack.filename || "unknown").replace("resource://dta/glue.jsm -> ", "")
					+ ":"
					+ stack.lineNumber);
		}
		else {
			message.push("\t[native @ " + (stack.languageName || "???" ) + "]");
		}
	}
	rv.stackMsg = message.join("\n");
	rv.prototype = UNKNOWN_STACK;
	return rv;
}

function clear() {
	// XXX implement file
}

const {
	errorFlag,
	warningFlag,
	exceptionFlag
} = Ci.nsIScriptError;

Object.defineProperties(exports, {
	LOG_DEBUG: {value: 0, enumerable: true},
	LOG_INFO: {value: 1, enumerable: true},
	LOG_ERROR: {value: 2, enumerable: true},
	LOG_NONE: {value: 0x7FFFFFFF},
	PREFIX: {get: function() prefix},
	clear: {value: clear},
	setLogLevel: {value: function(l) global.level = l}
});

var prefix = "DownThemAll!";
var level = exports.LOG_NONE;

exports.log = function(level, message, exception) {
	//XXX implement file
	try {
		if (global.level > level)  {
			return;
		}

		if (message instanceof Ci.nsIScriptError || message instanceof Ci.nsIException || message.fileName) {
			exception = message;
			message = exception.message;
		}
		else if (exception) {
			message = message + " [Exception: " + exception.message + "]";
		}

		let {
			stackMsg,
			sourceName,
			sourceLine,
			lineNumber,
			columnNumber
		} = prepareStack((exception && exception.location) || null);

		if (stackMsg) {
			message += "\n" + stackMsg;
		}

		let category = "component javascript";

		if (exception) {
			if (exception instanceof Ci.nsIScriptError) {
				sourceName = exception.sourceName;
				sourceLine = exception.sourceLine;
				lineNumber = exception.lineNumber;
				columnNumber = exception.columnNumber;
				category = exception.category;
			}
			else if (exception instanceof Ci.nsIException) {
				sourceName = exception.filename;
				lineNumber = exception.lineNumber;
			}
			else {
				sourceName = exception.fileName || sourceName;
				lineNumber = exception.lineNumber || lineNumber;
			}
		}

		let levelMsg;
		switch (level) {
			case exports.LOG_ERROR:
				levelMsg = "error";
				break;
			case exports.LOG_INFO:
				levelMsg = "info";
				break;
			default:
				levelMsg = "debug";
		}

		message = global.prefix + " (" + levelMsg + ") - " + message;

		const scriptError = new Instances.ScriptError(
			message,
			sourceName,
			sourceLine,
			lineNumber,
			columnNumber,
			level >= exports.LOG_ERROR ? errorFlag : warningFlag,
			category);
		Services.console.logMessage(scriptError);
	}
	catch (ex) {
		Cu.reportError("failed to log");
		Cu.reportError(ex);
		Cu.reportError(exception || message);
	}
}
Object.defineProperty(exports.log, "enabled", {get: function() global.level != LOG_NONE});

/* vim: set et ts=2 sw=2 : */
