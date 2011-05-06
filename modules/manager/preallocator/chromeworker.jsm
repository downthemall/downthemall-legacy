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
 * The Original Code is DownThemAll preallocator ChromeWorker module.
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

/* ********
 * This module currently does not work due to thread-safety issues of ALL file APIs
 */
const EXPORTED_SYMBOLS = [
	'prealloc'
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

const SIZE_MIN = 30 * 1024;

module("resource://dta/utils.jsm");

const WorkerFactory = Cc["@mozilla.org/threads/workerfactory;1"].createInstance(Ci.nsIWorkerFactory);
const Worker = WorkerFactory.newChromeWorker("resource://dta/manager/preallocator/worker.js");

const JobQueue = {
	_jobs: {},
	queue: function JobQueue_queue(file, size, perms, callback) {
		let id = newUUIDString();
		let job = {
			file: file,
			perms: perms,
			callback: callback
		};
		this._jobs[id] = job;
		Worker.postMessage({
			action: 'start',
			id: id,
			file: file,
			perms: perms,
		});
		return {
			cancel: JobQueue.cancel.bind(JobQueue, id)
		};
	},
	finish: function JobQueue_finish(id, result) {
		let job = this._jobs[id];
		try {
			job.callback(result);
		}
		finally {
			delete this._jobs[id];
		}
	},
	cancel: function JobQueue_cancel(id) {
		Worker.postMessage({
			action: 'cancel',
			id: id,
		});
	}
};

Worker.onmessage = function prealloc_worker_message(event) {
	let msg = event.data;
	if (!msg.result && Logger.enabled) {
		Logger.log("pa: failed to run", msg.resultString);
	}
	JobQueue.finish(msg.id, msg.result);
};
Worker.onerror = function prealloc_worker_error(event) {
	if (Logger.enabled) {
		Logger.log("Something horrible happend", event.message);
	}
	Worker = null;
}

function prealloc(file, size, perms, callback, tp) {
	callback = (callback || function(){}).bind(tp || null);
	if (size <= SIZE_MIN || !isFinite(size) || !Worker) {
		if (Logger.enabled) {
			Logger.log("pa: not preallocating");
		}
		callback(false);
		return null;
	}
	return JobQueue.queue(file.path, size, perms, callback);
}
