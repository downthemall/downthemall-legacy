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
 * The Original Code is DownThemAll preallocator module.
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
const Exception = Components.Exception;

const FileOutputStream = Components.Constructor('@mozilla.org/network/file-output-stream;1', 'nsIFileOutputStream', 'init');
const File = Components.Constructor('@mozilla.org/file/local;1', 'nsILocalFile', 'initWithPath');

const log = (function() {
	let logger = Cc['@downthemall.net/debug-service;1'].getService(Ci.dtaIDebugService);
	return function pa_log(msg, ex) {
		if (ex) {
			return logger.log(msg, ex);
		}
		return logger.logString(msg);
	}
})();

const SIZE_MIN = 10 * 1024 * 1024; // will not prealloc below
const SIZE_STEP = 5 * 1024 * 1024; // prealloc will NOT use co-threads up to this size

Components.utils.import('resource://dta/cothread.jsm');
Components.utils.import('resource://dta/utils.jsm');

const workers = {};

function prealloc(file, size, perms, callback, tp) {
	tp = tp || null;
	if (size <= SIZE_MIN || !isFinite(size)) {
		log("pa: not preallocating");
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
	
	let tm = Cc['@mozilla.org/thread-manager;1'].getService(Ci.nsIThreadManager);
	this.thread = tm.newThread(0);
	this.main = tm.mainThread;
	this.uuid = newUUIDString();
	workers[this.uuid] = this;
	this.thread.dispatch(this, this.thread.DISPATCH_NORMAL);
}

WorkerJob.prototype = {
	QueryInterface: function worker_QueryInterface(iid) {
		if (iid.equals(Ci.nsISupports) || iid.equals(Ci.nsIRunnable)) {
			return this;
		}
		throw Cr.NS_ERROR_NO_INTERFACE;
	},
	run: function worker_run() {
		let rv = false;
		try {
			let file = new File(this.path);
			let stream = new FileOutputStream(file, 0x02 | 0x08, this.perms, 0);
			try {
				let seekable = stream.QueryInterface(Ci.nsISeekableStream);
				seekable.seek(0x02, 0);
				let i = seekable.tell() + SIZE_STEP;
				for (i = Math.min(this.size - 1, i); !this.terminated && i < this.size - 1; i = Math.min(this.size - 1, i + SIZE_STEP)) {
					seekable.seek(0x00, i);
					stream.write("a", 1);
				}
				rv = true;				
			}
			catch (iex) {
				log("pa: Failed to run prealloc loop", iex);
			}
			stream.close();
		}
		catch (ex) {
			log("pa: Failed to run prealloc worker", ex);
		}
		this.main.dispatch(new MainJob(this.uuid, this.thread, this.callback, this.tp, rv), this.main.DISPATCH_NORMAL);		
	},
	cancel: function() {
		log("pa: cancel called!");
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
		try {
			this.thread.shutdown();
		}
		catch (ex) {
			// might throw; see Worker.cancel
		}
		if (this.callback) {
			try {
				this.callback.call(this.tp, this.result);
				log("pa: prealloc done");
			}
			catch (ex) {
				log("pa: callback throw", ex);
			}
		}
		workers[this.uuid] = 0;
		delete workers[this.uuid];
	}
};