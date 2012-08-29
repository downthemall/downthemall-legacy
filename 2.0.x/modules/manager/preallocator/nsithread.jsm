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
 * The Original Code is DownThemAll preallocator nsIThread module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2009
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

const EXPORTED_SYMBOLS = [
	'prealloc'
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

const FileOutputStream = Components.Constructor('@mozilla.org/network/file-output-stream;1', 'nsIFileOutputStream', 'init');
const LocalFile = Components.Constructor('@mozilla.org/file/local;1', 'nsILocalFile', 'initWithPath');

module('resource://dta/utils.jsm');
module('resource://dta/version.jsm');

Debug.logString("pa: using nsIThread implementation");

// Should we use the optimized Windows implementation?
const WINDOWSIMPL = Version.OS == 'winnt';
// Size cap: Use Windows implementation (on Windows) even if run on main thread
const WINDOWSIMPL_SIZEMAX = (1 << 25); // 32MB

//Minimum size of a preallocation.
//If requested size is less then no actual pre-allocation will be performed.
const SIZE_MIN = (WINDOWSIMPL ? 30 : 2048) * 1024;

//Step size of the allocation
//Do this step wise to avoid certain "sparse files" cases
const SIZE_STEP = (1 << 27); // 128MB


// Store workers here.
// Not storing workers (in this context) will cause gc havoc.
const workers = {};

/**
 * Pre-allocates a given file on disk
 * and calls given callback when done
 *
 * @param file (nsIFile) file to allocate
 * @param size (int) Size to allocate
 * @param perms (int) *nix file permissions
 * @param callback (function) Callback called once done
 * @param tp (function) Scope (this) to call the callback function in
 * @return (nsICancelable) Pre-allocation object.
 */
function prealloc(file, size, perms, callback, tp) {
	tp = tp || null;
	if (size <= SIZE_MIN || !isFinite(size)) {
		Debug.logString("pa: not preallocating");
		if (callback) {
			callback.call(tp, false);
		}
		return null;
	}

	return new WorkerJob(file.path, size, perms, callback, tp);
}

function WorkerJob(path, size, perms, callback, tp) {
	this.path = path;
	this.size = size;
	this.perms = perms;
	this.callback = callback;
	this.tp = tp;
	this.uuid = newUUIDString();

	let tm = Cc['@mozilla.org/thread-manager;1'].getService(Ci.nsIThreadManager);
	this.main = tm.mainThread;

	// Create thread and dispatch
	this.thread = tm.newThread(0);
	try {
		let tp = this.thread.QueryInterface(Ci.nsISupportsPriority);
		tp.priority = Ci.nsISupportsPriority.PRIORITY_LOWEST;
	}
	catch (ex) {
		// no op
	}
	workers[this.uuid] = this;
	this.thread.dispatch(this, this.thread.DISPATCH_NORMAL);
}

WorkerJob.prototype = {
	QueryInterface: function worker_QueryInterface(iid) {
		if (iid.equals(Ci.nsISupports) || iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsICancelable)) {
			return this;
		}
		throw Cr.NS_ERROR_NO_INTERFACE;
	},
	run: function worker_run() {
		if (WINDOWSIMPL) {
			// Always opt-branch
			this._run_windows();
		}
		else {
			this._run_other();
		}
	},
	_run_windows: function worker_run_windows() {
		let rv = false;
		try {
			let file = new LocalFile(this.path);
			let stream = new FileOutputStream(file, 0x02 | 0x08, this.perms, 0);
			let size = this.size;
			try {
				let seekable = stream.QueryInterface(Ci.nsISeekableStream);
				seekable.seek(0x02, 0);
				size -= seekable.tell();
				while (size > 0) {
					let count = Math.min(size, 1 << 26 /* 64MB */);
					size -= count;
					seekable.seek(0x01, count);
					seekable.setEOF();
				}
			}
			finally {
				stream.close();
			}
			rv = true;
		}
		catch (ex) {
			this._run_other();
			return;
		}

		// Dispatch event back to the main thread
		this.main.dispatch(new MainJob(this.uuid, this.thread, this.callback, this.tp, rv), this.main.DISPATCH_NORMAL);
	},
	_run_other: function worker_run_other() {
		let rv = false;
		try {
			let file = new LocalFile(this.path);
			let stream = new FileOutputStream(file, 0x02 | 0x08, this.perms, 0);
			try {
				let seekable = stream.QueryInterface(Ci.nsISeekableStream);
				seekable.seek(0x02, 0);
				let i = seekable.tell();
				if (i < this.size - 1) {
					i += SIZE_STEP;
					for (; !this.terminated && i < this.size + SIZE_STEP; i += SIZE_STEP) {
						seekable.seek(0x00, Math.min(i, this.size - 1));
						stream.write("a", 1);
					}
					rv = true;
				}
			}
			finally {
				stream.close();
			}
		}
		catch (ex) {
			// no op
		}

		// Dispatch event back to the main thread
		this.main.dispatch(new MainJob(this.uuid, this.thread, this.callback, this.tp, rv), this.main.DISPATCH_NORMAL);
	},
	cancel: function() {
		Debug.logString("pa: cancel called!");
		this.terminated = true;
		this.thread.shutdown();
	}
};
function MainJob(uuid, thread, callback, tp, result) {
	this.uuid = uuid;
	this.thread = thread;
	this.callback = callback;
	this.tp = tp;
	this.result = result;
}
MainJob.prototype = {
	QueryInterface: WorkerJob.prototype.QueryInterface,

	run: function main_run() {
		// thread is done

		try {
			// wait for thread to actually join, if not already joined
			this.thread.shutdown();
		}
		catch (ex) {
			// might throw; see Worker.cancel
		}

		if (this.callback) {
			try {
				// call the user callback
				this.callback.call(this.tp, this.result);
				Debug.logString("pa: prealloc done");
			}
			catch (ex) {
				Debug.log("pa: callback throw", ex);
			}
		}

		// cleanup
		workers[this.uuid] = 0;
		delete workers[this.uuid];
	}
};
