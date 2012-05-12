/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const {CoThreadInterleaved} = require("cothreads");

// Should we use the optimized Windows implementation?
const WINDOWSIMPL = require("version").OS == 'winnt';
// Size cap: Use Windows implementation (on Windows) even if run on main thread
const WINDOWSIMPL_SIZEMAX = (1 << 25); // 32MB

//Step size of the allocation
//Do this step wise to avoid certain "sparse files" cases
const SIZE_STEP = (1 << 23); // 8MB

exports.prealloc = function prealloc(file, size, perms, sparseOk, callback) {
	return new WorkerJob(file, size, perms, callback);
}

function WorkerJob(file, size, perms, callback) {
	this.file = file;
	this.size = size;
	this.perms = perms;
	this.callback = callback;
	try {
		this._stream = new Instances.FileOutputStream(this.file, 0x02 | 0x08, this.perms, 0);
	}
	catch (ex) {
		this.callback(false);
		return;
	}

	let g = this.run.bind(this);
	this.coThread = new CoThreadInterleaved((i for (i in g())), 1);
	this.coThread.start(this.finish.bind(this));
}

WorkerJob.prototype = {
	result: false,
	run: function worker_run() {
		if (WINDOWSIMPL && this.size < WINDOWSIMPL_SIZEMAX) {
			for (let i in this._run_windows()) yield i;
		}
		else {
			for (let i in this._run_other()) yield i;
		}
	},
	finish: function() {
		this._close();
		delete this.coThread;
		this.callback(this.result);
	},
	_run_windows: function worker_run_windows() {
		let size = this.size;
		try {
			let seekable = this._stream.QueryInterface(Ci.nsISeekableStream);
			seekable.seek(0x02, 0);
			size -= seekable.tell();
			while (!this.terminated && size > 0) {
				let count = Math.min(size, 1 << 26 /* 64MB */);
				size -= count;
				seekable.seek(0x01, count);
				seekable.setEOF();
				yield true;
			}
			this.result = true;
		}
		catch (ex) {
			log(LOG_ERROR, "pa: Windows implementation failed!", ex);
			for (let i in this._run_other()) yield i;
		}
	},
	_run_other: function worker_run_other() {
		try {
			let seekable = this._stream.QueryInterface(Ci.nsISeekableStream);
			let i = seekable.tell();
			if (i < this.size - 1) {
				i += SIZE_STEP;
				for (; !this.terminated && i < this.size + SIZE_STEP; i += SIZE_STEP) {
					seekable.seek(0x00, Math.min(i, this.size - 1));
					seekable.write("a", 1);
					yield true;
				}
				this.result = true;
			}
		}
		catch (ex) {
			log(LOG_ERROR, "pa: Failed to run prealloc loop", ex);
		}
	},
	_close: function() {
		try { this._stream.close(); } catch (ex) { }
		delete this._stream;
	},
	cancel: function() {
		this.terminated = true;
		this._close();
	}
};
