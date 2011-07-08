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
 * The Original Code is DownThemAll preallocation ChromeWorker module.
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
const EXPORTED_SYMBOLS = ["prealloc_impl"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const reportError = Cu.reportError;


module("resource://gre/modules/ctypes.jsm");
module("resource://dta/utils.jsm");

var worker_impl = null;
try {
	// Window implementation
	ctypes.open("kernel32.dll").close();
	worker_impl = "worker_win32.js";
}
catch (ex) {
	try {
		ctypes.open("libc.so.6").close();
		worker_impl = "worker_linux.js";
	}
	catch (ex) {
		try {
			ctypes.open("libc.so").close();
			worker_impl = "worker_linux.js";
		}
		catch (ex) {
			try {
				ctypes.open("libSystem.dylib").close();
				worker_impl = "worker_mac.js";
			}
			catch (ex) {
				// other implementations?
			}
		}
	}
}

if (!worker_impl) {
	throw new Error("not supported");
}
const _jobs = {};

const WorkerFactory = Cc["@mozilla.org/threads/workerfactory;1"]
	.createInstance(Ci.nsIWorkerFactory);

function Job(file, size, perms, callback, sparseOk) {
	this.file = file;
	this.size = size;
	this.perms = perms;
	this.callback = callback;
	this.sparseOk = sparseOk;
	this.uuid = newUUIDString();
	_jobs[this.uuid] = this;

	this.worker = WorkerFactory.newChromeWorker(worker_impl);
	this.worker.onmessage = this.onmessage.bind(this);
	this.worker.onerror = this.onerror.bind(this);

	this.alloc();
}
Job.prototype = {
	alloc: function() {
		this.worker.postMessage({
			action: "alloc",
			file: this.file.path,
			size: this.size,
			perms: this.perms,
			sparseOk: this.sparseOk,
		});
	},
	cancel: function() {
		this.worker.postMessage({
			action: "cancel"
		});
	},
	onmessage: function(event) {
		let data = event.data;

		if (data.action == "log") {
			if (Logger.enabled) {
				Logger.log(
					"Worker for file "
					+ this.file.path + " reported: "
					+ data.message
					+ " line:"
					+ data.lineNumber
					);
			}
			return;
		}

		if (data.action == "finish") {
			this.finish(data.result);
			return;
		}
	},
	onerror: function(event) {
		if (Logger.enabled) {
			Logger.log(
				"Worker for file "
				+ this.file.path + " reported an Error: "
				+ event.message
				+ " line:"
				+ event.lineno
				);
		}
		this.finish(false);
	},
	finish: function(result) {
		if (!this.worker) {
			return;
		}

		delete _jobs[this.uuid];

		this.cancel();
		delete this.worker;
		delete this.file;

		this.callback(result);
		delete this.callback;
	}
};

function prealloc_impl(file, size, perms, callback, sparseOk) {
	return new Job(file, size, perms, callback, sparseOk);
}
