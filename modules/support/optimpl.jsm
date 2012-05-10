/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */

"use strict";

const EXPORTED_SYMBOLS = [
	"createOptimizedImplementation",
	"NullCancel"
];

const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu, Exception: Exception} = Components;
Cu.import("resource://dta/glue.jsm");
const {Logger} = require("resource://dta/utils.jsm");

var makeId = (function() {
	var cid = 0;
	return function makeId() {
		return cid++;
	};
})();

var NullCancel = {
	cancel: function() {}
};

function createOptimizedImplementation(workerURI, workerSerializeFun, altImpl) {
	var impl = {
		callImpl: altImpl
	};

	var _jobs = new Map();
	var _worker = new ChromeWorker(workerURI);
	_worker.onerror = function(event) {
		Logger.log("worker bailed early", event);
		_worker = null;
	}
	_worker.onmessage = function(event) {
		if (event.data) {
			Logger.log("worker bailed: ", event);
			return;
		}

		var observer = {
			observe: function() {
				Services.obs.removeObserver(this, "quit-application");
				_moveFile = _moveFile_plain;
				_worker.postMessage("close");
				_worker = null;
			}
		};
		Services.obs.addObserver(observer, "quit-application", false);
		_worker.onmessage = function(event) {
			if ("log" in event.data) {
				Logger.log(event.data.log);
				return;
			}
			let job = _jobs.get(event.data.uuid);
			_jobs.delete(event.data.uuid);
			if (!job) {
				Logger.log("Invalid job; something is rotten in the state of Denmark!", new Error("invalid_job"));
				return;
			}
			job(event.data.result);
		}
		impl.callImpl = workerSerializeFun(function(data, callback) {
			data.uuid = makeId();
			_jobs.set(data.uuid, callback);
			_worker.postMessage(data);
			return NullCancel;
		});
	}
	return impl;
}