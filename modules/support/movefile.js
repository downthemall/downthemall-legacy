/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const {Promise} = require("support/promise");

const _jobs = new Map();
let _jobid = 0;

function onmessage({data}) {
	if (data.log) {
		log(LOG_DEBUG, "movefile_worker said" + data.log);
		return;
	}
	let job = _jobs.get(data.jobid);
	if (!job) {
		log(LOG_ERROR, "received a message for a non-existing job");
		return;
	}
	_jobs.delete(data.jobid);
	if (data.error) {
		let e = new Error(data.error.message, data.error.fileName, data.error.lineNumber);
		e.unixErrno = data.error.unixErrno;
		e.winLastError = data.error.winLastError;
		job.reject(e);
		return;
	}
	job.resolve();
}

function onerror(e) {
	log(LOG_ERROR, "moveFile worker died " + e.message + " " + e.filename + " " + e.linenumber + " " + Object.keys(e), e);
}

const MAX_WORKERS = 5;
const _workers = [];
const _workerGenerator = (function*() {
	for (var i = 0; i < MAX_WORKERS; ++i) {
		var w = new ChromeWorker(BASE_PATH + "support/movefile_worker.js");
		w.onmessage = onmessage;
		w.onerror = onerror;
		_workers.push(w);
		yield w;
	}
	for (var i = 0; ; i = ++i % MAX_WORKERS) {
		yield _workers[i];
	}
})();

unload(() => {
	for (let w of _workers) {
		// Send kill.
		w.postMessage(null);
	}
});

exports.moveFile = function(from, to) {
	let jobid = ++_jobid;
	let job = Promise.defer();
	_jobs.set(jobid, job);
	_workerGenerator.next().value.postMessage({
		jobid: jobid,
		from: from,
		to: to
	});
	return job.promise;
};
Object.defineProperty(exports, "maxWorkers", {
	value: MAX_WORKERS,
	enumerable: true
});
