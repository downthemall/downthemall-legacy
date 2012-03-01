/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is DownThemAll preallocation CoThread module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

const EXPORTED_SYMBOLS = ["prealloc"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

module('resource://dta/glue.jsm');
module('resource://dta/utils.jsm');
module('resource://dta/version.jsm');
module('resource://dta/cothread.jsm');

// Should we use the optimized Windows implementation?
const WINDOWSIMPL = Version.OS == 'winnt';
// Size cap: Use Windows implementation (on Windows) even if run on main thread
const WINDOWSIMPL_SIZEMAX = (1 << 25); // 32MB

//Step size of the allocation
//Do this step wise to avoid certain "sparse files" cases
const SIZE_STEP = (1 << 23); // 8MB

function prealloc(file, size, perms, sparseOk, callback) {
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
			if (Logger.enabled) {
				Logger.log("pa: Windows implementation failed!", ex);
			}
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
			if (Logger.enabled) {
				Logger.log("pa: Failed to run prealloc loop", ex);
			}
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
