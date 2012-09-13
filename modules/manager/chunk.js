/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// XXX Consider using a real (single) pipe into the async stream copier
// We don't do this for now, as the current scheme gives a little more control
// about how data chunks are written to disk

requireJoined(this, "constants");
const Prefs = require("preferences");
const {ByteBucketTee} = require("support/bytebucket");
const {GlobalBucket} = require("manager/globalbucket");
const {defer} = require("support/defer");
const {TimerManager} = require("support/timers");
const Limits = require("support/serverlimits");
const {getTimestamp, formatNumber} = require("utils");

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
	let AsyncCopierThread = Services.tm.newThread(0);
	/*if (AsyncCopierThread instanceof Ci.nsISupportsPriority) {
		AsyncCopierThread.priority = AsyncCopierThread.PRIORITY_LOW;
		log(LOG_INFO, "Our async copier thread is low priority now!");
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
	process: "",
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
		this._overflow = 0;
		this._chunksScheduled = 0;
		this._chunksActive = 0;
		let bs = (BUFFER_SIZE>>1);

		for (let i = 0, e = this.chunks.length; i < e; ++i) {
			let c = this.chunks[i];
			let pending = 0;
			this._pendingBytes += pending;
			this._overflow += (bs - (pending % bs)) % bs;
			let cached = c.bufferedCached;
			this._cachedBytes += cached;
			this._overflow += (bs - (cached % bs)) % bs;
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

		// As per :njn, add-ons should not use anything other than
		// KIND_OTHER to stay forwards-compatible.
		callback.callback(
			this.process,
			"downthemall-downloads-memory-pending",
			Ci.nsIMemoryReporter.KIND_OTHER,
			Ci.nsIMemoryReporter.UNITS_BYTES,
			this._pendingBytes,
			"Downloaded bytes waiting or in the process of being written to disk.",
			closure
			);
		callback.callback(
			this.process,
			"downthemall-downloads-memory-cached",
			Ci.nsIMemoryReporter.KIND_OTHER,
			Ci.nsIMemoryReporter.UNITS_BYTES,
			this._cachedBytes,
			"Downloaded bytes currently residing in memory.",
			closure
			);
		callback.callback(
			this.process,
			"downthemall-downloads-memory-overflow",
			Ci.nsIMemoryReporter.KIND_OTHER,
			Ci.nsIMemoryReporter.UNITS_BYTES,
			this._overflow,
			"Unused memory that was (potentially) over-committed.",
			closure
			);
		callback.callback(
			this.process,
			"downthemall-connections-active",
			Ci.nsIMemoryReporter.KIND_OTHER,
			Ci.nsIMemoryReporter.UNITS_COUNT,
			this._chunksActive,
			"Connections that are currently alive.",
			closure
			);
		callback.callback(
			this.process,
			"downthemall-connections-suspended",
			Ci.nsIMemoryReporter.KIND_OTHER,
			Ci.nsIMemoryReporter.UNITS_COUNT,
			this._chunksScheduled,
			"Connections that are currently suspended, e.g. due to speed limits or memory concerns.",
			closure
			);
		callback.callback(
			this.process,
			"downthemall-connections-total",
			Ci.nsIMemoryReporter.KIND_OTHER,
			Ci.nsIMemoryReporter.UNITS_COUNT,
			this.chunks.length,
			"Total number of connections that are currently in use by DownThemAll!.",
			closure
			);
		callback.callback(
			this.process,
			"downthemall-session-connections",
			Ci.nsIMemoryReporter.KIND_OTHER,
			Ci.nsIMemoryReporter.UNITS_COUNT_CUMULATIVE,
			this.session.chunks,
			"Total connections (chunks) created during this session.",
			closure
			);
		callback.callback(
			this.process,
			"downthemall-session-bytes",
			Ci.nsIMemoryReporter.KIND_OTHER,
			Ci.nsIMemoryReporter.UNITS_BYTES,
			this.session.written,
			"Total bytes received during this session.",
			closure
			);
	},
	explicitNonHeap: 0,
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
	Services.memrm.registerMultiReporter(MemoryReporter);
} catch (ex) {}


const Observer = {
	memoryPressure: 0,
	unload: function() {
		Services.obs.removeObserver(this, "memory-pressure");
		Prefs.removeObserver("extensions.dta.permissions", this);
		try {
			_thread.shutdown();
		}
		catch (ex) {}
		try {
			Services.memrm.unregisterMultiReporter(MemoryReporter);
		} catch (ex) {}
		Timers.killAllTimers();
	},
	observe: function(s, topic, d) {
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
Services.obs.addObserver(Observer, "memory-pressure", true);
unload(Observer.unload.bind(Observer));

function Chunk(download, start, end, written) {
	// saveguard against null or strings and such
	this._written = written > 0 ? written : 0;
	this.safeBytes = this._written;
	this._start = start;
	this.end = end;
	this._parent = download;
	this._sessionBytes = 0;
	this._copiers = [];
	log(LOG_INFO, "chunk created: " + this);
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
		let outStream = new Instances.FileOutputStream(file, 0x02 | 0x08, Prefs.permissions, 0);
		let seekable = outStream.QueryInterface(Ci.nsISeekableStream);
		seekable.seek(0x00, at);
		return outStream;
	},
	open: function CH_open() {
		this._sessionBytes = 0;
		this._canceled = false;
		let file = this.parent.tmpFile;
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
		log(LOG_DEBUG, this + ": chunk closed");
		this.running = false;
		if (this._hasCurrentStream) {
			this._shipCurrentStream();
		}
		this._shipEOFStream();
	},
	_finish: function CH__finish() {
		let notifyOwner = false;
		if (this._outStream) {
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
		delete this.download;

		if (notifyOwner) {
			this.parent.chunkClosed(this);
		}
	},
	onStartRequest: function CH_onStartRequest(aRequest, aContext) {},
	onStopRequest: function CH_onStopRequest(aRequest, aContext, aStatusCode) {
		if (!(aRequest instanceof Ci.nsIAsyncStreamCopier)) {
			log(LOG_ERROR, "Not a copier", aRequest);
			throw new Exception("Not a copier");
		}

		// Untrack the copier
		// XXX .indexOf does NOT work
		for (let i = 0; i < this._copiers.length; ++i) {
			if (aRequest == this._copiers[i]) {
				this._copiers.splice(i, 1);
				if (i != 0) {
					log(LOG_ERROR, "Out of order copier! at: " + i);
				}
				break;
			}
		}

		aContext.QueryInterface(Ci.nsISupportsPRUint32);
		let bytes = aContext.data;
		if (!this._canceled) {
			if (!Components.isSuccessCode(aStatusCode)) {
				log(LOG_ERROR, "Failed to asyncwrite", aStatusCode);
				this.download.writeFailed();
				return;
			}
			if (bytes > 0) {
				log(LOG_DEBUG,  ": shipped " + bytes + " bytes");
				this._buffered -= bytes;
				this.safeBytes += bytes;
			}
		}
		if (bytes == 0) {
			log(LOG_DEBUG, "got EOF stream");
			this._finish();
		}
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
				throw new Error("bytes negative: " + bytes + " " + this.remainder + " " + aCount);
			}

			// we're using nsIFileOutputStream
			// per e10n contract we must consume all bytes
			// or in our case all remainder bytes
			// reqPending from above makes sure that we won't re-schedule
			// the download too early
			let avail;
			if (this._hasCurrentStream
					&& (avail = this._currentInputStream.available()) + bytes >= BUFFER_SIZE) {
				let fill = Math.min(bytes, BUFFER_SIZE - avail);
				bytes -= fill;
				if (fill && this._currentOutputStream.writeFrom(aInputStream, fill) != fill) {
					throw new Error("Failed to fill current stream. fill: " + fill + " bytes: " + bytes + "chunk: " + this);
				}
				this._shipCurrentStream();
			}
			while (bytes >= BUFFER_SIZE) {
				this._ensureStream(true);
				if (this._currentOutputStream.writeFrom(aInputStream, BUFFER_SIZE) != BUFFER_SIZE) {
					throw new Error("Failed to write full stream. " + this);
				}
				this._shipCurrentStream();
				bytes -= BUFFER_SIZE;
			}
			if (bytes) {
				this._ensureStream();
				if (this._currentOutputStream.writeFrom(aInputStream, bytes) != bytes) {
					throw new Error("Failed to write all requested bytes to current stream. bytes: " + bytes + " chunk: " + this);
				}
			}
			this._noteBytesWritten(got);
			return aCount;
		}
		catch (ex) {
			log(LOG_ERROR, 'write: ' + this.parent.tmpFile.path, ex);
			throw ex;
		}
		return 0;
	},
	_ensureStream: function CH__ensureStream(solid) {
		if (!this._hasCurrentStream) {
			let pipe;
			if (solid) {
				pipe = new Instances.Pipe(false, true, BUFFER_SIZE, 1, null);
			}
			else {
				pipe = new Instances.Pipe(false, true, BUFFER_SIZE>>2, 1<<2, null);
			}
			this._currentInputStream = pipe.inputStream;
			this._currentOutputStream = pipe.outputStream;
		}
	},
	get _hasCurrentStream() !!this._currentInputStream,
	_shipCurrentStream: function CH__shipCurrentStream() {
		let is = this._currentInputStream;
		let os = this._currentOutputStream;
		delete this._currentInputStream;
		delete this._currentOutputStream;
		if (!is || !os) {
			return;
		}

		let bytes = is.available();
		os.close();

		let copier = new Instances.AsyncStreamCopier(
			is,
			this._outStream,
			_thread,
			true, // source buffered
			false, // sink buffered
			bytes,
			true, // close source
			false // close sink
			);

		let context = new Instances.SupportsUint32();
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
	_shipEOFStream: function() {
		// hacky way to close the stream off the main thread
		let is = new Instances.StringInputStream("", 0);
		let copier = new Instances.AsyncStreamCopier(
			is,
			this._outStream,
			_thread,
			true, // source buffered
			false, // sink buffered
			0,
			true, // close source
			true // close sink
			);
		let context = new Instances.SupportsUint32();
		context.data = 0;
		try {
			this._copiers.push(copier);
			copier.asyncCopy(this, context);
		}
		catch (ex) {
			this._copiers.pop();
			throw ex;
		}
		log(LOG_DEBUG, "shipped EOF stream");
	},
	_wnd: 2048,
	observe: function() {
		this.run();
	},
	requestBytes: function CH_requestBytes(requested) {
		if (Observer.memoryPressure || MemoryReporter.pendingBytes > MAX_PENDING_SIZE) {
			log(LOG_INFO, "Under pressure: " + MemoryReporter.pendingBytes + " : " + Observer.memoryPressure);
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

exports.Chunk = Chunk;
