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
 * The Original Code is DownThemAll! Verificator module
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *	 Nils Maier <MaierMan@web.de>
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

var EXPORTED_SYMBOLS = ['verify'];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;
var Ctor = Components.Constructor;
var Exception = Components.Exception;

var Prefs = {}, DTA = {};
Cu.import("resource://dta/preferences.jsm", Prefs);
Cu.import("resource://dta/utils.jsm");
Cu.import("resource://dta/version.jsm");
Cu.import("resource://dta/api.jsm", DTA);

var RUN_ON_MAINTHREAD = Version.moz2;
var REGULAR_CHUNK = (1 << (RUN_ON_MAINTHREAD ? 21 : 24)); // 2/16MB 

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

ServiceGetter(this, "ThreadManager", "@mozilla.org/thread-manager;1", "nsIThreadManager");

var nsICryptoHash = Ci.nsICryptoHash;

var LocalFile = new Ctor('@mozilla.org/file/local;1', 'nsILocalFile', 'initWithPath');
var FileInputStream = new Ctor('@mozilla.org/network/file-input-stream;1', 'nsIFileInputStream', 'init');

var Hash = new Ctor('@mozilla.org/security/hash;1', 'nsICryptoHash', 'init');

var _jobs = {};
function registerJob(obj) {
	let rv = newUUIDString();
	_jobs[rv] = obj;
	return rv;
}
function unregisterJob(job) {
	_jobs[job] = null;
	delete _jobs[job];
}

function verify(file, hashCollection, completeCallback, progressCallback){
	return new (hashCollection.hasPartials ? MultiVerificator : Verificator)(
		file,
		hashCollection,
		completeCallback,
		progressCallback
		);
}

function Spinnable() {}
Spinnable.prototype = {
	terminated: false,
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIRunnable, Ci.nsICancelable]),
	spin: function() {
		if (!RUN_ON_MAINTHREAD) {
			return;
		}
		while (this._thread.hasPendingEvents()) {
			this._thread.processNextEvent(false);
		}
	},
	cancel: function() {
		this.terminated = true;
		if (!RUN_ON_MAINTHREAD) {
			try { this._thread.shutdown(); } catch (ex) { /* no op */ }			
		}
	}
};

function Callback(func, sync) {
	this._func = func;
	this._args = Array.map(arguments, function(e) e).slice(2);
	this._thread = ThreadManager.mainThread;
	this._job = registerJob(this);
	this._thread.dispatch(this, sync ? 0x1 : 0x0);
	if (sync) {
		this.spin();
	}
}
Callback.prototype = {
	__proto__: Spinnable.prototype,
	run: function() {
		try {
			this._func.apply(this._func, this._args);
		}
		catch (ex) {
			Debug.log("Callback threw", ex);
		}
		unregisterJob(this._job);
	}
};

function Verificator(file, hashCollection, completeCallback, progressCallback) {
	this._file = new LocalFile(file);
	this._hashCollection = hashCollection;
	this._completeCallback = completeCallback;
	this._progressCallback = progressCallback;
	
	this._job = registerJob(this._job);
	if (RUN_ON_MAINTHREAD) {
		this._thread = ThreadManager.mainThread;		
	}
	else {
		this._thread = ThreadManager.newThread(0);
		try {
			let tp = this._thread.QueryInterface(Ci.nsISupportsPriority);
			tp.priority = Ci.nsISupportsPriority.PRIORITY_LOWEST;
		}
		catch (ex) {
			// no op
		}		
	}
	this._thread.dispatch(this, 0x0);
}
Verificator.prototype = {
	__proto__: Spinnable.prototype,
	_done: function(obj) {
		try {
			if (!RUN_ON_MAINTHREAD) {
				obj._thread.shutdown();
			}
		}
		catch (ex) {
			// aborted before?!
		}
		unregisterJob(obj._job);
	},
	run: function() {
		try {
			let hashCollection = this._hashCollection;
			let file = this._file;
			let total = file.fileSize;
			let pending = total;
			let completed = 0;

			let mainHash;
			new Callback(function() {
				mainHash = new Hash(nsICryptoHash[hashCollection.full.type]);
			}, true);
			let stream = new FileInputStream(file, 0x01, 0766, 0);
			try {
				while (pending) {
					if (this.terminated) {
						throw new Exception("terminated");
					}
					let count = Math.min(pending, REGULAR_CHUNK);
					mainHash.updateFromStream(stream, count);
					pending -= count;
					completed += count;
					new Callback(this._progressCallback, false, Math.min(completed, total));
					this.spin();
				}
			}
			finally {
				stream.close();
			}
			let actual = hexdigest(mainHash.finish(false));
			if (actual != hashCollection.full.sum) {
				new Callback(this._completeCallback, true, [{start: 0, end: 0, actual: actual, expected: hashCollection.full.sum}]);
			}
			else {
				new Callback(this._completeCallback, true, []);
			}
		}
		catch (ex) {
			new Callback(this._completeCallback, true);
		}
		new Callback(this._done, false, this);
	}
};

function MultiVerificator() {
	Debug.logString("MultiVerificator");
	Verificator.apply(this, Array.map(arguments, function(e) e));
}
MultiVerificator.prototype = {
	__proto__: Verificator.prototype,
	run: function() {
		try {
			let hashCollection = this._hashCollection;
			let mismatches = [];

			let file = this._file;
			let total = file.fileSize;
			let pending = total;
			let completed = 0;

			let mainHash;
			new Callback(function() {
				mainHash = new Hash(nsICryptoHash[hashCollection.full.type]);
			}, true);
			let stream = new FileInputStream(file, 0x01, 0766, 0).QueryInterface(Ci.nsISeekableStream);
			let flushBytes = REGULAR_CHUNK;
			try {
				for each (let partial in hashCollection.partials) {
					let pendingPartial = Math.min(pending, hashCollection.parLength);
					let partialHash; 
					new Callback(function() {
						partialHash = new Hash(nsICryptoHash[partial.type]);
					}, true);					
					let start = completed;
					while (pendingPartial) {
						if (this.terminated) {
							throw new Exception("terminated");
						}
						let count = Math.min(pendingPartial, REGULAR_CHUNK);
						if (!count) {
							throw new Exception("read nothing");
						}

						partialHash.updateFromStream(stream, count);
						stream.seek(0x1, -count);
						mainHash.updateFromStream(stream, count);

						pending -= count;
						pendingPartial -= count;
						completed += count;
						flushBytes = Math.max(flushBytes - count, 0);
						if (!flushBytes){
							flushBytes = REGULAR_CHUNK;
							new Callback(this._progressCallback, false, Math.min(completed, total));
							this.spin();							
						}						
					}
					let partialActual = hexdigest(partialHash.finish(false));
					if (partial.sum != partialActual) {
						mismatches.push({
							start: start,
							end: completed - 1,
							actual: partialActual,
							expected: partial.sum
						});
					}
				}
				
				// any remainder
				while (pending) {
					if (this.terminated) {
						throw new Exception("terminated");
					}
					let count = Math.min(pending, REGULAR_CHUNK);
					mainHash.updateFromStream(stream, count);
					pending -= count;
					completed += count;
					new Callback(this._progressCallback, false, Math.min(completed, total));
					this.spin();					
				}
			}
			finally {
				stream.close();
			}
			let actual = hexdigest(mainHash.finish(false));
			if (actual != hashCollection.full.sum) {
				mismatches.push({
					start: 0,
					end: 0,
					actual: actual,
					expected: hashCollection.full.sum
				});
			}
			new Callback(this._completeCallback, true, mismatches);
		}
		catch (ex) {
			Components.utils.reportError(ex);
			new Callback(this._completeCallback, true);
		}
		new Callback(this._done, false, this);
	}
};