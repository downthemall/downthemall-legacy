/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";
/* global ChromeWorker */

const {AsyncShutdown} = requireJSM("resource://gre/modules/AsyncShutdown.jsm");
const obs = require("support/observers");

const _jobs = new Map();
let _jobid = 0;

let _kill;
let _killWorker = new Promise((resolve, reject) => {
	_kill = resolve;
});

let _worker = new ChromeWorker(BASE_PATH + "support/movefile_worker.js");

function onmessage({data}) {
	if (data.log) {
		log(LOG_DEBUG, "movefile_worker said" + data.log);
		return;
	}
	if (data.exit) {
		_worker = null;
		_kill();
		return;
	}
	let job = _jobs.get(data.jobid);
	if (!job) {
		log(LOG_ERROR, "received a message for a non-existing job");
		return;
	}
	_jobs.delete(data.jobid);
	if (data.error) {
		let e = new Error(data.error.message || "<unknown error>", data.error.fileName, data.error.lineNumber);
		e.unixErrno = data.error.unixErrno || 0;
		e.winLastError = data.error.winLastError || 0;
		log(LOG_ERROR, "Failed to move file", e);
		job.reject(e);
		return;
	}
	job.resolve();
}

function onerror(e) {
	log(LOG_ERROR, `moveFile worker died ${e.message} ${e.filename}:${e.linenumber} ${Object.keys(e)}`, e);
	_worker = null;
	_kill();
}

_worker.onmessage = onmessage;
_worker.onerror = onerror;

const asyncShutdown = function() {
	obs.removeExit(asyncShutdown);
	const dead = () => {
		try {
			AsyncShutdown.webWorkersShutdown.removeBlocker(asyncShutdown);
		}
		catch (ex) {
			Cu.reportError(ex);
		}
	};
	_killWorker.then(dead).catch(dead);

	if (!_worker) {
		_kill();
		return;
	}
	_worker.postMessage(null);
};

obs.addExit(asyncShutdown);
unload(asyncShutdown);
AsyncShutdown.webWorkersShutdown.addBlocker("DownThemAll! moveFile workers", asyncShutdown);

exports.moveFile = function(from, to, overwriteOk) {
	let jobid = ++_jobid;
	return new Promise((rs, rj) => {
		_jobs.set(jobid, {resolve: rs, reject: rj});
		_worker.postMessage({
			jobid: jobid,
			from: from,
			to: to,
			overwriteOk: overwriteOk
		});
	});
};
Object.defineProperty(exports, "maxWorkers", {
	value: 1,
	enumerable: true
});
