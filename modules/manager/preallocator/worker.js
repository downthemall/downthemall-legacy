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
 * The Original Code is DownThemAll preallocator ChromeWorker worker.
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

const SIZE_STEP = (1 << 27); // 128MB

const _jobs = {};
const running = false;
const cs = XPCOM.getService("@mozilla.org/consoleservice;1");

function WorkerJob(id, path, size, perms) {
	this.id = id;
	this.file = XPCOM.createInstance("@mozilla.org/file/local;1");
	this.file.initWithPath(path);
	this.size = size;
	this.perms = perms;
	_jobs[this.id] = this;
	if (!running) {
		this.run();
	}
}

WorkerJob.prototype = {
	run: function worker_run() {
		running = true;

		let id = this.id;
		try {
			if (!this.file.exists()) {
				this.file.create(0, this.perms);
			}
			let i = this.file.fileSize + SIZE_STEP;
			for (i = Math.min(this.size - 1, i); !this.terminated && i < this.size - 1; i = Math.min(this.size - 1, i + SIZE_STEP)) {
				this.file.fileSize = i;
			}
			postMessage({
				id: id,
				result: true
			});
		}
		catch (ex) {
			postMessage({
				id: id,
				result: false,
				resultString: ex.message + ": " + ex.fileName + ":" + ex.lineNumber
			});
		}
		running = false;
		delete _jobs[id];
		runNext();
	},
	cancel: function() {
		this.terminated = true;
	}
};

function runNext() {
	if (running) {
		return;
	}
	for each (let job in _jobs) {
		if (!job) {
			continue;
		}
		job.run();
	}
}


function start(msg) {
	try {
		new WorkerJob(msg.id, msg.path, msg.size, msg.perms);
	}
	catch (ex) {
		postMessage({
			id: msg.id,
			result: false,
			resultString: ex.message + ": " + ex.fileName + ":" + ex.lineNumber
		});
	}
}

function cancel(msg) {
	if (msg.id in _jobs) {
		_jobs[msg.id].cancel();
	}
}


function onmessage(event) {
	switch(event.data.action) {
	case 'start':
		start(event.data);
		break;
	case 'cancel':
		cancel(event.data);
		break;
	}
}
