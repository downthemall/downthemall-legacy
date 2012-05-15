/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

var makeId = (function() {
	var cid = 0;
	return function makeId() {
		return cid++;
	};
})();

exports.NullCancel = {
	cancel: function() {}
};

exports.createOptimizedImplementation = function createOptimizedImplementation(workerURI, workerSerializeFun, altImpl) {
	var impl = {
		callImpl: altImpl
	};

	workerURI = BASE_PATH + workerURI + ".js";

	var _jobs = new Map();
	var _worker = new ChromeWorker(workerURI);
	_worker.onerror = function(event) {
		log(LOG_INFO, "worker bailed early - not supported");
		_worker = null;
	}
	_worker.onmessage = function(event) {
		if (event.data) {
			log(LOG_INFO, "worker bailed late - not supported", event);
			return;
		}

		unload(function() {
			log(LOG_INFO, "Closing worker " + workerURI);
			_worker.postMessage("close");
			_worker = null;
		});

		_worker.onmessage = function(event) {
			if ("log" in event.data) {
				log(LOG_DEBUG, "worker said: " + event.data.log)
				return;
			}
			let job = _jobs.get(event.data.uuid);
			_jobs.delete(event.data.uuid);
			if (!job) {
				log(LOG_ERROR, "Invalid job; something is rotten in the state of Denmark!", new Error("invalid_job"));
				return;
			}
			job(event.data.result);
		}
		impl.callImpl = workerSerializeFun(function(data, callback) {
			data.uuid = makeId();
			_jobs.set(data.uuid, callback);
			_worker.postMessage(data);
			return exports.NullCancel;
		});
	}
	return impl;
}
