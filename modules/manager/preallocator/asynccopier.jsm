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
 * The Original Code is DownThemAll preallocation AsyncCopier module.
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

module('resource://dta/glue2.jsm');
module('resource://dta/utils.jsm');

const ss = new Instances.StringInputStream("a", 1);
ss.QueryInterface(Ci.nsISeekableStream);

function prealloc(file, size, perms, sparseOk, callback) {
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
			if (Logger.enabled) {
				Logger.log("pa: implementation failed!", ex);
			}
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
			if (Logger.enabled) {
				Logger.log("pa: not successful, " + aStatusCode);
			}
			this.finish();
			return;
		}
		this.run();
	},
	cancel: function() {
		this.terminated = true;
	}
};
