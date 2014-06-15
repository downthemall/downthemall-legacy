/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

importScripts("resource://gre/modules/osfile.jsm");

const log = function log() {
	postMessage({
		log: Array.slice(arguments).toString()
	});
};

onmessage = function({data}) {
	if (!data) {
		log("going down");
		self.close();
		return;
	}
	try {
		OS.File.move(data.from, data.to);
		postMessage({jobid: data.jobid});
	}
	catch (ex) {
		log(ex);
		postMessage({
			jobid: data.jobid,
			error: {
				message: (ex.message || ex.toString()),
				fileName: ex.fileName,
				lineNumber: ex.lineNumber,
				unixErrno: (ex.unixErrno || 0),
				winLastError: (ex.winLastError || 0)
			}
		});
	}
};

log("ready");
