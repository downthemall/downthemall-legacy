/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";


const DTA = require("api");
const Prefs = require("preferences");
const {Logger, newUUIDString, hexdigest} = require("utils");

const REGULAR_CHUNK = (1 << 21); // 2/16MB

const nsICryptoHash = Ci.nsICryptoHash;

const _jobs = {};
function registerJob(obj) {
	let rv = newUUIDString();
	_jobs[rv] = obj;
	return rv;
}
function unregisterJob(job) {
	_jobs[job] = null;
	delete _jobs[job];
}

exports.verify = function verify(file, hashCollection, completeCallback, progressCallback){
	return new (hashCollection.hasPartials ? MultiVerificator : Verificator)(
		file,
		hashCollection,
		completeCallback,
		progressCallback
		);
}

function Runnable() {}
Runnable.prototype = {
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIRunnable, Ci.nsICancelable]),
	cancel: function() {
		this.terminated = true;
	}
};

function Callback(func, sync) {
	this._func = func;
	this._args = Array.slice(arguments, 2);
	this._thread = Services.tm.mainThread;
	this._job = registerJob(this);
	this._thread.dispatch(this, sync ? 0x1 : 0x0);
}
Callback.prototype = {
	__proto__: Runnable.prototype,
	run: function() {
		try {
			this._func.apply(this._func, this._args);
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("Callback threw", ex);
			}
		}
		unregisterJob(this._job);
	}
};

function Verificator(file, hashCollection, completeCallback, progressCallback) {
	this._file = new Instances.LocalFile(file);
	this._hashCollection = hashCollection;
	this._completeCallback = completeCallback;
	this._progressCallback = progressCallback;

	this._job = registerJob(this._job);
	this._thread = Services.tm.mainThread;
	this._thread.dispatch(this, 0x0);
}
Verificator.prototype = {
	__proto__: Runnable.prototype,
	_done: function(obj) {
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
				mainHash = new Instances.Hash(nsICryptoHash[hashCollection.full.type]);
			}, true);
			let flags = 0x04 | 0x08;
			if ('OS_READAHEAD' in Ci.nsILocalFile) {
				flags |= Ci.nsILocalFile.OS_READAHEAD;
			}
			let stream = new Instances.FileInputStream(file, flags, 502 /* 0766*/, 0);
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
	if (Logger.enabled) {
		Logger.log("MultiVerificator");
	}
	Verificator.apply(this, arguments);
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
				mainHash = new Instances.Hash(nsICryptoHash[hashCollection.full.type]);
			}, true);
			let flags = 0x04 | 0x08;
			if ('OS_READAHEAD' in Ci.nsILocalFile) {
				flags |= Ci.nsILocalFile.OS_READAHEAD;
			}
			let stream = new Instances.FileInputStream(file, flags, 502 /* 0766 */, 0).QueryInterface(Ci.nsISeekableStream);
			let flushBytes = REGULAR_CHUNK;
			try {
				for each (let partial in hashCollection.partials) {
					let pendingPartial = Math.min(pending, hashCollection.parLength);
					let partialHash;
					new Callback(function() {
						partialHash = new Instances.Hash(nsICryptoHash[partial.type]);
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
