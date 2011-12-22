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
 * The Original Code is DownThemAll asyncmovefile module.
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

const EXPORTED_SYMBOLS = ["asyncMoveFile"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;

module("resource://dta/glue.jsm");

function _moveFile_plain(aLocalFileSrc, aLocalFileDst, aCallback) {
	try {
		aLocalFileSrc.clone().moveTo(aLocalFileDst.parent, aLocalFileDst.leafName);
		aCallback();
	}
	catch (ex) {
		aCallback(ex);
	}
}
var _moveFile = _moveFile_plain;

try {
	var _jobs = Object.create(null);

	var _worker = new ChromeWorker("asyncmovefile_worker_win.js");
	_worker.onerror = function(event) {
		Cu.reportError("worker bailed early: " + event.message + ":" + event.lineno);
		_worker = null;
	}
	_worker.onmessage = function(event) {
		if (event.data) {
			Cu.reportError("worker bailed: " + event.data);
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
			let job = _jobs[event.data.uuid];
			delete _jobs[event.data.uuid];
			if (!job) {
				Cu.reportError("Invalid asnycMoveFile job; something is rotten in the state of Denmark!");
				return;
			}
			job(event.data.result ? null : "Worker failed to move file");
		}
		_moveFile = _moveFile_worker;
	}
	var _moveFile_worker = function _moveFile_worker(aLocalFileSrc, aLocalFileDst, aCallback) {
		let data = Object.create(null);
		data.src = aLocalFileSrc.path;
		data.dst = aLocalFileDst.path;
		data.uuid = Services.uuid.generateUUID().toString();
		_jobs[data.uuid] = aCallback;
		_worker.postMessage(data);
	}
}
catch (ex) {
	Cu.reportError("asyncMoveFile Worker threw; using plain");
}

function asyncMoveFile(aLocalFileSrc, aLocalFileDst, aCallback) {
	_moveFile(aLocalFileSrc, aLocalFileDst, aCallback);
}
