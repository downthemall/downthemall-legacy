/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

function log(ex) {
	postMessage({log: ex.message || ex });
}

try {
	importScripts("win.js");
}
catch (ex) {
	try {
		importScripts("unix.js");
	}
	catch (ex) {
		throw new Error("No supported native movefile implementation");
	}
}

onmessage = function(event) {
	let data = event.data;
	if (data == "close") {
		close();
		return;
	}

	try {
		data.result = moveFile(data.src, data.dst, data.permissions) ? null : "Failed to move file";
	}
	catch (ex) {
		data.result = ex.message + " @ " + (ex.fileName || ex.sourceName || "unknown") + ":" + (ex.lineNumber || 0);
	}
	postMessage(data);
}

postMessage(false);
