/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";
/* globals log:true, importScripts, postMessage, self, onmessage:true, OS */

importScripts("resource://gre/modules/osfile.jsm");

const log = function log(...args) {
	postMessage({
		log: args.toString()
	});
};

onmessage = function({data}) {
	if (!data) {
		log("going down");
		postMessage({exit: true});
		self.close();
		return;
	}
	try {
		OS.File.move(data.from, data.to, {
			noOverwrite: !data.overwriteOk
		});
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
