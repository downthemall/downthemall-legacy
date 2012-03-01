/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */

"use strict";

try {
	importScripts("win.js");
}
catch (ex) {
	try {
		importScripts("mac.js");
	}
	catch (ex) {
		try {
			importScripts("linux.js");
		}
		catch (ex) {
			throw new Error("no compatible implementation found");
		}
	}
}

function log(ex) {
	postMessage({log: ex.message || ex });
}

onmessage = function(event) {
	let data = event.data;
	if (data == "close") {
		close();
		return;
	}

	try {
		data.result = prealloc(data.file, data.size, data.sparseOK);
	}
	catch (ex) {
		data.result = false;
	}
	postMessage(data);
}

postMessage(false);
