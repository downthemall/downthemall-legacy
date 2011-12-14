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
 * The Original Code is DownThemAll! Chunk module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2011
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

"use strict";

// XXX Consider using a real (single) pipe into the async stream copier
// We don't do this for now, as the current scheme gives a little more control
// about how data chunks are written to disk

const EXPORTED_SYMBOLS = ["Chunk"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const ctor = Components.Constructor;
const module = Cu.import;

module("resource://gre/modules/Services.jsm");
module("resource://gre/modules/XPCOMUtils.jsm");

module("resource://dta/constants.jsm");
const Prefs = {};
module("resource://dta/preferences.jsm", Prefs);
module("resource://dta/utils.jsm");
module("resource://dta/support/defer.jsm");
module("resource://dta/support/timers.jsm");
const Limits = {};
module("resource://dta/support/serverlimits.jsm", Limits);

module("resource://dta/manager/globalbucket.jsm");

const AsyncStreamCopier = ctor("@mozilla.org/network/async-stream-copier;1","nsIAsyncStreamCopier", "init");
const FileOutputStream = ctor("@mozilla.org/network/file-output-stream;1", "nsIFileOutputStream", "init");
const Pipe = ctor("@mozilla.org/pipe;1", "nsIPipe", "init");
const SupportsUint32 = ctor("@mozilla.org/supports-PRUint32;1", "nsISupportsPRUint32");

const Timers = new TimerManager();

const _thread = (function() {
	// Use a dedicated thread, so that we have serialized writes.
	// As we use a single sink for various reasons, we need to ensure the
	// shipped bytes arrive and are written to in the correct order.
	// The assumption that writes will be properly serialized is based on the
	// following assumptions
	//  1. The thread event queue processes events fifo, always
	//  2. The async stream copier writes a whole piped stream before processing
	//     another stream write request.
	//
	// Why do we want to use all this cruft?
	// - To keep the browser snappier by having the slow disk I/O stuff off the
	//   main thread.
	// - Having a single thread doing all the writes might reduce/avoid some
	//   nasty performance issues, such as excessive disk thrashing due to
	//   concurrency.
	// - We cannot use ChromeWorkers, because we cannot do file I/O there
	//   unless we reimplement file I/O using ctypes (and while it's feasible, it
	//   is not really reasonable)
	//
	// For the amo-validator context:
	// Editor note: Safe use, as an event target for nsIAsyncStreamCopier (no js use)
	let AsyncCopierThread = Cc["@mozilla.org/thread-manager;1"].getService(Ci.nsIThreadManager).newThread(0);
	/*if (AsyncCopierThread instanceof Ci.nsISupportsPriority) {
		AsyncCopierThread.priority = AsyncCopierThread.PRIORITY_LOW;
		Logger.log("Our async copier thread is low priority now!");
	}*/
	return AsyncCopierThread;
})();

function MemoryReporter() {
	this.chunks = [];
	this.session = {
		chunks: 0,
		written: 0
	};
	this._calc();
	return Object.seal(this);
}
MemoryReporter.prototype = {
	kind: 1,
	units: 0,
	process: "",
	path: "explicit/downthemall/downloads/buffered",
	description: "Downloaded but not yet written bytes",
	get memoryUsed() {
		let rv = 0;
		try {
			for (let [,c] in Iterator(this.chunks)) {
				rv += c.buffered;
			}
		}
		catch (ex) {
			return -1;
		}
		return rv;
	},
	_calc: function(force) {
		if (!this._generation) {
			this._generation = 10;
		}
		else {
			--this._generation;
			if (!force) {
				return;
			}
		}
		this._pendingBytes = 0;
		this._cachedBytes = 0;
		this._clownShoes = 0;
		this._chunksScheduled = 0;
		this._chunksActive = 0;
		let bs = (BUFFER_SIZE>>1);

		for (let i = 0, e = this.chunks.length; i < e; ++i) {
			let c = this.chunks[i];
			let pending = 0;
			this._pendingBytes += pending;
			this._clownShoes += (bs - (pending % bs)) % bs;
			let cached = c.bufferedCached;
			this._cachedBytes += cached;
			this._clownShoes += (bs - (cached % bs)) % bs;
			if (c._req) {
				++this._chunksScheduled;
			}
			else {
				++this._chunksActive;
			}
		}
	},
	get pendingBytes() {
		this._calc();
		return this._pendingBytes;
	},
	get cachedBytes() {
		this._calc();
		return this._cachedBytes;
	},
	collectReports: function(callback, closure) {
		this._calc(true);

		callback.callback(
			this.process,
			"explicit/downthemall/downloads/pending",
			Ci.nsIMemoryReporter.KIND_HEAP,
			Ci.nsIMemoryReporter.UNITS_BYTES,
			this._pendingBytes,
			"Downloaded bytes waiting or in the process of being written to disk",
			closure
			);
		callback.callback(
			this.process,
			"explicit/downthemall/downloads/cached",
			Ci.nsIMemoryReporter.KIND_HEAP,
			Ci.nsIMemoryReporter.UNITS_BYTES,
			this._cachedBytes,
			"Downloaded bytes in cache",
			closure
			);
		callback.callback(
			this.process,
			"explicit/downthemall/downloads/clown-shoes",
			Ci.nsIMemoryReporter.KIND_HEAP,
			Ci.nsIMemoryReporter.UNITS_BYTES,
			this._clownShoes,
			"Unused buffer space",
			closure
			);
		callback.callback(
			this.process,
			"downthemall/connections/active",
			Ci.nsIMemoryReporter.KIND_OTHER,
			Ci.nsIMemoryReporter.UNITS_COUNT,
			this._chunksActive,
			"Currently active connections (chunks)",
			closure
			);
		callback.callback(
			this.process,
			"downthemall/connections/scheduled",
			Ci.nsIMemoryReporter.KIND_OTHER,
			Ci.nsIMemoryReporter.UNITS_COUNT,
			this._chunksScheduled,
			"Currently scheduled/suspended connections (chunks)",
			closure
			);
		callback.callback(
			this.process,
			"downthemall/connections/total",
			Ci.nsIMemoryReporter.KIND_OTHER,
			Ci.nsIMemoryReporter.UNITS_COUNT,
			this.chunks.length,
			"Current total connections (chunks)",
			closure
			);
		callback.callback(
			this.process,
			"downthemall/session/connections",
			Ci.nsIMemoryReporter.KIND_OTHER,
			Ci.nsIMemoryReporter.UNITS_COUNT_CUMULATIVE,
			this.session.chunks,
			"Total connections (chunks) in this session",
			closure
			);
		callback.callback(
			this.process,
			"downthemall/session/bytes-received",
			Ci.nsIMemoryReporter.KIND_OTHER,
			Ci.nsIMemoryReporter.UNITS_BYTES,
			this.session.written,
			"Total bytes received in this session",
			closure
			);
	},
	noteBytesWritten: function(bytes) {
		this.session.written += bytes;
	},
	registerChunk: function(chunk) {
		this.chunks.push(chunk);
		++this.session.chunks;
	},
	unregisterChunk: function(chunk) {
		let idx = this.chunks.indexOf(chunk);
		if (idx >= 0) {
			this.chunks.splice(idx, 1);
		}
	}
};
Object.freeze(MemoryReporter.prototype);
MemoryReporter = new MemoryReporter();

try {
	let memrm = Cc["@mozilla.org/memory-reporter-manager;1"].getService(Ci.nsIMemoryReporterManager);
	if ('registerMultiReporter' in memrm) {
		memrm.registerMultiReporter(MemoryReporter);
	}
	else {
		memrm.registerReporter(MemoryReporter);
	}
} catch (ex) {}


const Observer = {
	memoryPressure: 0,
	observe: function(s, topic, d) {
		if (topic == "quit-application") {
			Services.obs.removeObserver(this, "quit-application");
			Services.obs.removeObserver(this, "memory-pressure");
			Prefs.removeObserver("extensions.dta.permissions", this);
			try {
				_thread.shutdown();
			}
			catch (ex) {}
			try {
				let memrm = Cc["@mozilla.org/memory-reporter-manager;1"].getService(Ci.nsIMemoryReporterManager);
				if ('registerMultiReporter' in memrm) {
					memrm.unregisterMultiReporter(MemoryReporter);
				}
				else {
					memrm.unregisterReporter(MemoryReporter);
				}
			} catch (ex) {}
			Timers.killAllTimers();
			return;
		}

		if (topic == "memory-pressure") {
			if (data == "low-memory") {
				this.memoryPressure += 25;
			}
			else {
				this.memoryPressure += 100;
			}
			this.schedulePressureDecrement();
			return;
		}

		let perms = Prefs.permissions = Prefs.getExt("permissions", 384);
		if (perms & 384) {
			perms |= 64;
		}
		if (perms & 48) {
			perms |= 8;
		}
		if (perms & 6) {
			perms |= 1;
		}
		Prefs.dirPermissions = perms;
	},
	decrementPressure: function() {
		if (!(--this.memoryPressure)) {
			return;
		}
		this.schedulePressureDecrement();
	},
	schedulePressureDecrement: function() {
		Timers.createOneshot(100, this.decrementPressure, this);
	}
}
Prefs.addObserver("extensions.dta.permissions", Observer);
Services.obs.addObserver(Observer, "quit-application", true);
Services.obs.addObserver(Observer, "memory-pressure", true);

function Chunk(download, start, end, written) {
	// saveguard against null or strings and such
	this._written = written > 0 ? written : 0;
	this.safeBytes = this._written;
	this._start = start;
	this.end = end;
	this._parent = download;
	this._sessionBytes = 0;
	this._copiers = [];
	Logger.log("chunk created: " + this);
}

Chunk.prototype = {
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIRunnable, Ci.nsIRequestObserver]),
	running: false,
	get starter() this.end <= 0,
	get start() this._start,
	get end() this._end,
	set end(nv) {
		this._end = nv;
		this._total = this._end - this._start + 1;
	},
	get total() this._total,
	get written() this._written,
	_buffered: 0,
	get bufferedPending() this._buffered,
	get bufferedCached() this._hasCurrentStream ? this._currentInputStream.available() : 0,
	get buffered() (this.bufferedPending + this.bufferedCached),
	safeBytes: 0,
	get currentPosition() (this.start + this.written),
	get remainder() (this._total - this._written),
	get complete() {
		if (this._end == -1) {
			return this.written != 0;
		}
		return this._total == this.written;
	},
	get parent() this._parent,
	get sessionBytes() this._sessionBytes,
	merge: function CH_merge(ch) {
		if (!this.complete && !ch.complete) {
			throw new Error("Cannot merge incomplete chunks this way!");
		}
		this.end = ch.end;
		this._written += ch._written;
		this.safeBytes += ch.safeBytes;
	},
	openOutStream: function CH_openOutStream(file, at) {
		let outStream = new FileOutputStream(file, 0x02 | 0x08, Prefs.permissions, 0);
		let seekable = outStream.QueryInterface(Ci.nsISeekableStream);
		seekable.seek(0x00, at);
		return outStream;
	},
	open: function CH_open() {
		this._sessionBytes = 0;
		this._canceled = false;
		let file = this.parent.tmpFile;
		if (!file.parent.exists()) {
			file.parent.create(Ci.nsIFile.DIRECTORY_TYPE, Prefs.dirPermissions);
		}
		this._outStream = this.openOutStream(file, this.currentPosition);
		this.buckets = new ByteBucketTee(
				this.parent.bucket,
				Limits.getServerBucket(this.parent),
				GlobalBucket
				);
		this.buckets.register(this);
		MemoryReporter.registerChunk(this);
		this.parent.chunkOpened(this);
	},
	close: function CH_close() {
		this.running = false;
		if (this._hasCurrentStream) {
			this._shipCurrentStream();
		}
		if (!this._copiers.length) {
			this._finish();
		}
	},
	_finish: function CH__finish() {
		let notifyOwner = false;
		if (this._outStream) {
			// Close will flush the buffered data
			this._outStream.close();
			delete this._outStream;
			notifyOwner = true;
		}
		if (this.buckets) {
			this.buckets.unregister(this);
		}
		delete this._req;
		MemoryReporter.unregisterChunk(this);

		this._sessionBytes = 0;
		this._buffered = 0;
		this._written = this.safeBytes;

		if (notifyOwner) {
			this.parent.chunkClosed(this);
		}
	},
	onStartRequest: function CH_onStartRequest(aRequest, aContext) {},
	onStopRequest: function CH_onStopRequest(aRequest, aContext, aStatusCode) {
		if (!(aRequest instanceof Ci.nsIAsyncStreamCopier)) {
			if (Logger.enabled) {
				Logger.log("Not a copier", aRequest);
			}
			throw new Exception("Not a copier");
		}

		// Untrack the copier
		let idx = this._copiers.indexOf(aRequest);
		if (idx >= 0) {
			this._copiers.splice(idx, 1);
		}

		if (!this._canceled) {
			if (!Components.isSuccessCode(aStatusCode)) {
				if (Logger.enabled) {
					Logger.log("Failed to asyncwrite", aStatusCode);
				}
				this.download.writeFailed();
				return;
			}
			if (aContext instanceof Ci.nsISupportsPRUint32) {
				this._buffered -= aContext.data;
				this.safeBytes += aContext.data;
			}
		}
		if (this.running || this._copiers.length) {
			return;
		}
		this._finish();
	},
	rollback: function CH_rollback() {
		if (!this._sessionBytes || this._sessionBytes > this._written) {
			return;
		}
		this._written -= this._sessionBytes;
		this._sessionBytes = 0;
	},
	cancelChunk: function CH_cancel() {
		this.running = false;
		this._canceled = true;
		for (let [,c] in Iterator(this._copiers)) {
			try {
				c.cancel(Cr.NS_ERROR_ABORT);
			}
			catch (ex) {
				Cu.reportError(ex);
				// don't care just now ;)
			}
		}

		// prevent shipping the current stream
		if (this._hasCurrentStream) {
			this._currentOutputStream.close();
			delete this._currentOutputStream;
			this._currentInputStream.close();
			delete this._currentInputStream;
		}

		this.close();
		if (this.download) {
			this.download.cancel();
		}
	},
	pauseChunk: function CH_pause() {
		this.running = false;
		this.close();
		if (this.download) {
			this.download.cancel();
		}
	},
	_written: 0,
	_outStream: null,
	_noteBytesWritten: function CH_noteBytesWritten(bytes) {
		this._written += bytes;
		this._sessionBytes += bytes;
		MemoryReporter.noteBytesWritten(bytes);

		this.parent.timeLastProgress = getTimestamp();
	},
	write: function CH_write(aRequest, aInputStream, aCount) {
		try {
			// not running: do not write anything
			if (!this.running) {
				return -1;
			}
			if (!this._outStream) {
				this.open();
			}
			let bytes = this.remainder;
			if (!this.total || aCount < bytes) {
				bytes = aCount;
			}
			if (!bytes) {
				// we got what we wanted
				return -1;
			}
			let got = this.requestBytes(bytes);
			// didn't get enough
			if (got < bytes) {
				if (this._req) {
					this._reqPending += bytes - got;
				}
				else {
					this._req = aRequest;
					this._req.suspend();
					this._reqPending = bytes - got;
				}
			}
			if (bytes < 0) {
				throw new Error("bytes negative");
			}

			// we're using nsIFileOutputStream
			// per e10n contract we must consume all bytes
			// or in our case all remainder bytes
			// reqPending from above makes sure that we won't re-schedule
			// the download too early
			if (this._hasCurrentStream && this._currentInputStream.available() + bytes > BUFFER_SIZE) {
				this._shipCurrentStream();
			}
			if (!this._hasCurrentStream) {
				let pipe = new Pipe(false, false, BUFFER_SIZE>>1, 1<<2, null);
				this._currentInputStream = pipe.inputStream;
				this._currentOutputStream = pipe.outputStream;
			}
			if (this._currentOutputStream.writeFrom(aInputStream, bytes) != bytes) {
				throw new Error("Failed to write all requested bytes to current stream: " + this);
			}

			this._noteBytesWritten(got);
			return bytes;
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log('write: ' + this.parent.tmpFile.path, ex);
			}
			throw ex;
		}
		return 0;
	},
	get _hasCurrentStream() !!this._currentInputStream,
	_shipCurrentStream: function CH__shipCurrentPipe() {
		let is = this._currentInputStream;
		let os = this._currentOutputStream;
		delete this._currentInputStream;
		delete this._currentOutputStream;
		if (!is || !os) {
			return;
		}

		let bytes = is.available();
		os.close();

		let copier = new AsyncStreamCopier(
			is,
			this._outStream,
			_thread,
			true, // source buffered
			false, // sink buffered
			bytes,
			true, // close source
			false // close sink
			);

		let context = new SupportsUint32();
		context.data = bytes;
		try {
			this._buffered += bytes;
			this._copiers.push(copier);
			copier.asyncCopy(this, context);
		}
		catch (ex) {
			this._copiers.pop();
			this._buffered -= bytes;
			throw ex;
		}
	},
	_wnd: 2048,
	observe: function() {
		this.run();
	},
	requestBytes: function CH_requestBytes(requested) {
		if (Observer.memoryPressure || MemoryReporter.pendingBytes > MAX_PENDING_SIZE) {
			if (Logger.enabled) {
				Logger.log("Under pressure: " + MemoryReporter.pendingBytes + " : " + Observer.memoryPressure);
			}
			// basically stop processing while under memory pressure
			Timers.createOneshot(500, this.run, this);
			return 0;
		}
		return this.buckets.requestBytes(requested);
	},
	run: function CH_run() {
		if (!this._req) {
			return;
		}
		if (this._reqPending > 0) {
			// Still have pending bytes?
			let requested = Math.min(this._wnd, this._reqPending);
			let got = this.requestBytes(requested);
			if (!got) {
				return;
			}
			this._noteBytesWritten(got);
			if (got < requested) {
				this._wnd = Math.round(Math.min(this._wnd / 2, 1024));
			}
			else if (requested == this._wnd) {
				this._wnd += 256;
			}
			this._reqPending -= got;
			this.parent.timeLastProgress = getTimestamp();

			defer(this);
			return;
		}

		// Ready to resume the download
		let req = this._req;
		delete this._req;
		delete this._reqPending;
		req.resume();
		this.parent.timeLastProgress = getTimestamp();
	},
	toString: function CH_toString() {
		let len = this.parent.totalSize ? String(this.parent.totalSize).length  : 10;
		return formatNumber(this.start, len)
			+ "/"
			+ formatNumber(this.end, len)
			+ "/"
			+ formatNumber(this.total, len)
			+ " running:"
			+ this.running
			+ " written/remain/sb:"
			+ formatNumber(this.written, len)
			+ "/"
			+ formatNumber(this.remainder, len)
			+ "/"
			+ formatNumber(this._sessionBytes, len);
	},
	toJSON: function() {
		return {
			start: this.start,
			end: this.end,
			written: this.safeBytes
			};
	}
};
