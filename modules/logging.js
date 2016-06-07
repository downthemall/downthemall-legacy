/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const global = this;

const CATEGORY = "component javascript";


var UNKNOWN_STACK = {
	stackMsg: "",
	sourceName: "unknown",
	sourceLine: "",
	lineNumber: 0,
	columnNumber: 0
};
Object.freeze(UNKNOWN_STACK);
const GLUE = "chrome://dta-modules/content/glue.jsm -> ";

function prepareStack(stack) {
	let message;
	let sourceName = "unknown";
	let sourceLine = "";
	let lineNumber = 0;
	if (typeof(stack) === "string") {
		message = stack.split("\n");
	}
	else {
		if (!stack || !(stack instanceof Ci.nsIStackFrame) ) {
			stack = Components.stack;
			for (let i = 0; stack && i < 2; ++i) {
				stack = stack.caller;
			}
			if (!stack) {
				return UNKNOWN_STACK;
			}
		}
		sourceName = (stack.filename || sourceName).replace(GLUE, "");
		sourceLine = stack.sourceLine || sourceLine;
		lineNumber = stack.lineNumber || lineNumber;
		message = [];
		for (let i = 0; stack && i < 60; ++i, stack = stack.caller) {
			if (stack.lineNumber) {
				message.push(`\t${stack.name || "[anonymous]"}() @ ${(stack.filename || "unknown").replace(GLUE, "")}:${stack.lineNumber}`);
			}
			else {
				message.push(`\t[native @ ${stack.languageName || "???"}]`);
			}
		}
	}
	return {
		stackMsg: message.join("\n") || "",
		sourceName: sourceName,
		sourceLine: sourceLine,
		lineNumber: lineNumber,
		columnNumber: 0
	};
}

lazy(global, "file", function() {
	let file = Services.dirsvc.get("ProfD", Ci.nsIFile);
	file.append("downthemall.net");
	file.append('log.txt');
	if (file.exists() && file.fileSize > (256 * 1024)) {
		try {
			file.remove(false);
		}
		catch (ex) {
			// no op
		}
	}
	if (!file.parent.exists()) {
		file.parent.create(file.DIRECTORY_TYPE, 0o755);
	}
	return file;
});

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
	setLogLevel: {value: function(l) {
		global.level = l;
	}}
});

var level = exports.LOG_NONE;

const fmt = (function() {
	const re = /^(\d)$/;
	return function(i) {
		return i.toString().replace(re, "0$1");
	};
})();

function getTimeString() {
	let time = new Date();
	return fmt(time.getHours()) +
		":" +
		fmt(time.getMinutes()) +
		":" +
		fmt(time.getSeconds()) +
		"::" +
		fmt(time.getMilliseconds());
}
exports.log = function(level, message, exception) {
	if (global.level > level && level < exports.LOG_ERROR)  {
		return;
	}
	try {
		message = message || "undefined";
		if (message instanceof Ci.nsIScriptError || message instanceof Ci.nsIException || message.fileName) {
			exception = message;
			message = exception.message;
		}
		else if (exception) {
			message = `${message} [Exception: ${exception.message || exception.toString()}]`;
		}

		let {
			stackMsg,
			sourceName,
			sourceLine,
			lineNumber,
			columnNumber
		} = prepareStack((exception && (exception.location || exception.stack)) || null);

		if (stackMsg) {
			message += "\n" + stackMsg;
		}

		let category = CATEGORY;

		if (exception) {
			let sn;
			if (exception instanceof Ci.nsIScriptError) {
				sn = exception.sourceName;
				sourceLine = exception.sourceLine;
				lineNumber = exception.lineNumber;
				columnNumber = exception.columnNumber;
				category = exception.category;
			}
			else if (exception instanceof Ci.nsIException) {
				sn = exception.filename;
				lineNumber = exception.lineNumber;
			}
			else {
				sn = exception.fileName || sourceName;
				lineNumber = exception.lineNumber || lineNumber;
			}
			if (sn && !sn.includes("unknown ")) {
				sourceName = sn;
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

		message = `DownThemAll! (${levelMsg}) - ${message}`;

		const scriptError = new Instances.ScriptError(
			message,
			sourceName,
			sourceLine,
			lineNumber,
			columnNumber,
			level >= exports.LOG_ERROR ? errorFlag : warningFlag,
			category);
		Services.console.logMessage(scriptError);
		message = `${getTimeString()}\n${message}\n--> ${sourceName}:${lineNumber}:${columnNumber}\n`;

		if (global.level <= level) {
			let f = new Instances.FileOutputStream(global.file, 0x04 | 0x08 | 0x10, parseInt("664", 8), 0);
			f.write(message, message.length);
			f.close();
		}
	}
	catch (ex) {
		Cu.reportError("failed to log");
		Cu.reportError(ex);
		Cu.reportError(exception || message);
	}
};

Object.defineProperty(exports.log, "enabled", {get: () => global.level !== exports.LOG_NONE});
Object.defineProperty(exports.log, "file", {get: () => global.file});
Object.defineProperty(exports.log, "clear", {value: function clear() {
	try {
		if (global.file.exists()) {
			global.file.remove(false);
		}
	}
	catch (ex) {
		reportError("failed to remove log");
	}
}});
