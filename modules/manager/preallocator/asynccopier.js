/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const ss = new Instances.StringInputStream("a", 1);
ss.QueryInterface(Ci.nsISeekableStream);

exports.prealloc = function prealloc(file, size, perms, sparseOk, callback) {
	return new WorkerJob(file, size, perms, callback);
}

function WorkerJob(file, size, perms, callback) {
	this.file = file;
	this.size = size;
	this.perms = perms;
	this.callback = callback;
	try {
		// Editor note: Safe use as an event target for nsIAsyncStreamCopier
		this._thread = Services.tm.newThread(0);
		if (this._thread instanceof Ci.nsISupportsPriority) {
			this._thread.priority = this._thread.PRIORITY_LOWEST;
		}
		this._stream = new Instances.FileOutputStream(this.file, 0x02 | 0x08, this.perms, 0);
		this._stream instanceof Ci.nsISeekableStream;
		this.run();
	}
	catch (ex) {
		this.finish();
	}
}

WorkerJob.prototype = {
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIRequestObserver]),
	result: false,
	finish: function() {
		if (this._stream) {
			this._stream.close();
			delete this._stream;
		}
		if (this._thread) {
			try {
				this._thread.shutdown();
			} catch (ex) {}
			delete this._thread;
		}
		this.callback(this.result);
	},
	run: function worker_run_windows() {
		try {
			this._stream.seek(0x02, 0);
			let pos = this._stream.tell();
			if (pos >= this.size) {
				this.result = true;
				this.finish();
				return;
			}

			let remainder = this.size - pos - 1;
			let seek = Math.min(remainder, (1<<26));
			this._stream.seek(0x01, seek);
			ss.seek(0, 0);
			let copier = new Instances.AsyncStreamCopier(
				ss,
				this._stream,
				this._thread, // event target
				true, // source buffered
				false, // sink buffered
				1,
				false, // source close
				false // sink close
				);
			copier.asyncCopy(this, null);
		}
		catch (ex) {
			log(LOG_ERROR, "pa: implementation failed!", ex);
			this.finish();
		}
	},
	onStartRequest: function(r,c) {},
	onStopRequest: function(r, c, aStatusCode) {
		if (this.terminated) {
			this.finish();
			return;
		}
		if (!Components.isSuccessCode(aStatusCode)) {
			log(LOG_INFO, "pa: not successful, " + aStatusCode);
			this.finish();
			return;
		}
		this.run();
	},
	cancel: function() {
		this.terminated = true;
	}
};
