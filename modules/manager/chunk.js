/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/* global BUFFER_SIZE, MAX_PENDING_SIZE */
requireJoined(this, "constants");
const Prefs = require("preferences");
const {ByteBucketTee} = require("support/bytebucket");
const {GlobalBucket} = require("manager/globalbucket");
const {TimerManager} = require("support/timers");
const Limits = require("support/serverlimits");
const pressure = require("support/memorypressure");
const {getTimestamp, formatNumber} = require("utils");
const {OS} = requireJSM("resource://gre/modules/osfile.jsm");
const {Promise, Task} = require("support/promise");

const Timers = new TimerManager();

var buffer_size = BUFFER_SIZE;

exports.hintChunkBufferSize = function(bs) {
	bs--;
	bs |= bs >> 1;
	bs |= bs >> 2;
	bs |= bs >> 4;
	bs |= bs >> 8;
	bs |= bs >> 16;
	bs++;
	buffer_size = Math.max(1<<17, Math.min(BUFFER_SIZE * 8, bs));
};

function MemoryReporter() {
	this.chunks = new Set();
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

		for (let c of this.chunks) {
			let bs = c.buffer_size;
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
		this.chunks.add(chunk);
		++this.session.chunks;
	},
	unregisterChunk: function(chunk) {
		this.chunks.delete(chunk);
	}
};
Object.freeze(MemoryReporter.prototype);
const memoryReporter = new MemoryReporter();

try {
	Services.memrm.registerMultiReporter(memoryReporter);
} catch (ex) {}


const Observer = {
	memoryPressure: 0,
	unload: function() {
		pressure.remove(this);
		try {
			_thread.shutdown();
		}
		catch (ex) {}
		try {
			Services.memrm.unregisterMultiReporter(memoryReporter);
		} catch (ex) {}
		Timers.killAllTimers();
	},
	observe: function(s, topic, data) {
		if (topic === "memory-pressure") {
			if (data === "low-memory") {
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
		--this.memoryPressure;
		if (this.memoryPressure <= 0) {
			this.memoryPressure = 0;
			log(LOG_DEBUG, "memoryPressure lifted");
			return;
		}
		this.schedulePressureDecrement();
	},
	schedulePressureDecrement: function() {
		Timers.createOneshot(100, this.decrementPressure, this);
	}
};
Prefs.addObserver("extensions.dta.permissions", Observer);
pressure.add(Observer);
unload(Observer.unload.bind(Observer));

function Buffer(size) {
	this.size = size;
	this._data = new Uint8Array(size);
}
Buffer.prototype = Object.seal({
	_buf: new ArrayBuffer(1<<16),
	length: 0,
	writeFrom: function(inputStream, length) {
		if (length > this.free) {
			throw new Error("Buffer overflow, free: " + this.free + ", length: " + length + ", blen: " + this.length);
		}
		if (this._buf.byteLength < length) {
			let nl = this._buf.byteLength;
			while (nl < length) {
				nl += 1<<16;
			}
			this._buf = new ArrayBuffer(nl);
		}
		inputStream.readArrayBuffer(length, this._buf);
		this._data.set(new Uint8Array(this._buf, 0, length), this.length);
		this.length += length;
		return length;
	},
	get free() this.size - this.length,
	get data() {
		return this._data;
	}
});


function Chunk(download, start, end, written) {
	// safeguard against null or strings and such
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
	get bufferedCached() this._hasBuffer ? this._buffer.length : 0,
	get buffered() (this.bufferedPending + this.bufferedCached),
	safeBytes: 0,
	get currentPosition() (this.start + this.written),
	get remainder() (this._total - this._written),
	get complete() {
		if (!~this._end) {
			return this.written !== 0;
		}
		return this._total === this.written;
	},
	get parent() this._parent,
	get sessionBytes() this._sessionBytes,
	merge: function(ch) {
		if (!this.complete && !ch.complete) {
			throw new Error("Cannot merge incomplete chunks this way!");
		}
		this.end = ch.end;
		this._written += ch._written;
		this.safeBytes += ch.safeBytes;
	},
	_inited: false,
	_init: function() {
		if (this._inited) {
			return;
		}
		this._inited = true;

		this._sessionBytes = 0;
		this._canceled = false;
		this.buckets = new ByteBucketTee(
			this.parent.bucket,
			Limits.getServerBucket(this.parent),
			GlobalBucket
			);
		this.buckets.register(this);
		memoryReporter.registerChunk(this);
	},
	_open: function() {
		if (this._osFile) {
			// File was already opened
			let p = Promise.defer();
			p.resolve(this._osFile);
			return p.promise;
		}
		if (this._openDeferred) {
			// File open is already pending
			return this._openDeferred.promise;
		}

		this._openDeferred = Promise.defer();
		const path = this.parent.tmpFile.path;
		let pos = this.start + this.safeBytes;
		log(LOG_ERROR, "opening " + path + " at: " + pos);
		Task.spawn((function() {
			const flags = OS.Constants.libc.O_CREAT | OS.Constants.libc.O_LARGEFILE | OS.Constants.libc.O_WRONLY;
			this._osFile = yield OS.File.open(path, {write:true}, {unixFlags: flags, unixMode: Prefs.permissions});
			if (pos) {
				yield this._osFile.setPosition(pos, OS.File.POS_START);
			}
			this._openDeferred.resolve(this._osFile);
			delete this._openDeferred;
		}).bind(this)).then(null, (function(ex) {
			log(LOG_ERROR, ex);
			this._openDeferred.reject(ex);
			delete this._openDeferred;
		}).bind(this));

		this.parent.chunkOpened(this);
		return this._openDeferred.promise;
	},
	close: function() {
		this.running = false;
		if (this._hasBuffer) {
			this._shipBuffer();
		}
		log(LOG_DEBUG, "pending writes: " + this._pendingWrites);
		if (this._pendingWrites) {
			return;
		}
		if (this._osFile) {
			let f = this._osFile;
			delete this._osFile;
			log(LOG_DEBUG, "closing osfile");
			f.close().then((function() {
				log(LOG_DEBUG, "closed osfile");
				this._finish(true);
			}).bind(this),
			(function(ex) {
				log(LOG_ERRROR, "failed to close osfile: " + ex);
				this._finish(true);
			}).bind(this));
			return;
		}
		log(LOG_DEBUG, this + ": chunk closed");
		this._finish(false);
	},
	_finish: function(notifyOwner) {
		log(LOG_ERROR, "Finishing " + this + " notify: " + notifyOwner);
		if (this.buckets) {
			this.buckets.unregister(this);
			delete this.buckets;
		}
		delete this._req;
		memoryReporter.unregisterChunk(this);
		this._inited = false;

		this._sessionBytes = 0;
		this._buffered = 0;
		this._written = this.safeBytes;
		delete this.download;

		if (notifyOwner) {
			this.parent.chunkClosed(this);
		}
	},
	rollback: function() {
		if (!this._sessionBytes || this._sessionBytes > this._written) {
			return;
		}
		this._written -= this._sessionBytes;
		this._sessionBytes = 0;
	},
	cancelChunk: function() {
		this.running = false;
		this._canceled = true;

		// prevent shipping the current buffer
		if (this._hasBuffer) {
			delete this._buffer;
		}
		this.close();
		if (this.download) {
			this.download.cancel();
		}
	},
	pauseChunk: function() {
		this.running = false;
		this.close();
		if (this.download) {
			this.download.cancel();
		}
	},
	_written: 0,
	_noteBytesWritten: function(bytes) {
		this._written += bytes;
		this._sessionBytes += bytes;
		memoryReporter.noteBytesWritten(bytes);

		this.parent.timeLastProgress = getTimestamp();
	},
	write: function(aRequest, aInputStream, aCount) {
		try {
			// not running: do not write anything
			if (!this.running) {
				return -1;
			}
			this._init();
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

			if (!(aInputStream instanceof Ci.nsIBinaryInputStream)) {
				aInputStream = new Instances.BinaryInputStream(aInputStream);
			}

			// per e10n contract we must consume all bytes
			// or in our case all remainder bytes
			// reqPending from above makes sure that we won't re-schedule
			// the download too early
			if (this._hasBuffer) {
				let fill = Math.min(bytes, this._buffer.free);
				bytes -= fill;
				if (fill && this._buffer.writeFrom(aInputStream, fill) !== fill) {
					throw new Error("Failed to fill current stream. fill: " +
						fill + " bytes: " + bytes + "chunk: " + this);
				}
				if (!this._buffer.free) {
					this._shipBuffer();
				}
			}
			while (bytes >= this.buffer_size) {
				this._ensureBuffer();
				if (this._buffer.writeFrom(aInputStream, this.buffer_size) !== this.buffer_size) {
					throw new Error("Failed to write full stream. " + this);
				}
				this._shipBuffer();
				bytes -= this.buffer_size;
			}
			if (bytes) {
				this._ensureBuffer();
				let written = this._buffer.writeFrom(aInputStream, bytes);
				if (written !== bytes) {
					throw new Error("Failed to write all requested bytes to current stream. bytes: " +
						bytes + " actual: " + written + " chunk: " + this);
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
	_ensureBuffer: function() {
		if (this._hasBuffer) {
			return;
		}
		this.buffer_size = buffer_size;
		this._buffer = new Buffer(this.buffer_size);
	},
	get _hasBuffer() !!this._buffer,
	_pendingWrites: 0,
	_shipBuffer: function() {
		let buffer = this._buffer;
		delete this._buffer;
		if (!buffer) {
			return;
		}
		log(LOG_DEBUG, "shipping buffer: " + buffer.length);

		let bytes = buffer.length;
		if (!bytes) {
			log(LOG_DEBUG, "Not shipping buffer, zero length");
		}
		this._buffered += bytes;
		++this._pendingWrites;
		Task.spawn((function _shipBufferTask() {
			let file = yield this._open();
			yield file.write(buffer.data, {bytes: bytes});
			log(LOG_DEBUG, this + ": shipped " + bytes + " bytes");
			this._buffered -= bytes;
			this.safeBytes += bytes;
			--this._pendingWrites;
			if (!this.running) {
				this.close();
			}
		}).bind(this)).then(null, (function _shipBufferFailure(ex) {
			log(LOG_ERROR, ex);
			--this._pendingWrites;
			this.download.writeFailed();
			if (!this.running) {
				this.close();
			}
		}).bind(this));
	},
	_wnd: 2048,
	observe: function() {
		this.run();
	},
	requestBytes: function(requested) {
		if (memoryReporter.pendingBytes > MAX_PENDING_SIZE) {
			log(LOG_INFO, "Under pressure: " + memoryReporter.pendingBytes + " : " + Observer.memoryPressure);
			// basically stop processing while under memory pressure
			this.schedule();
			return 0;
		}
		if (Observer.memoryPressure > 0) {
			log(LOG_INFO, "Under some pressure: " + memoryReporter.pendingBytes +
				" : " + Observer.memoryPressure + " : " + requested);
			requested = Math.max(Math.min(requested, 256), Math.floor(requested / Observer.memoryPressure));
			log(LOG_INFO, "Using instead: " + requested);
			this.schedule();
		}
		return this.buckets.requestBytes(requested);
	},
	schedule: function() {
		if (this._schedTimer) {
			return;
		}
		this._schedTimer = Timers.createOneshot(250, function() {
			delete this._schedTimer;
			this.run();
		}, this);
	},
	run: function() {
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
			else if (requested === this._wnd) {
				this._wnd += 256;
			}
			this._reqPending -= got;
			this.parent.timeLastProgress = getTimestamp();

			this.schedule();
			return;
		}

		// Ready to resume the download
		let req = this._req;
		delete this._req;
		delete this._reqPending;
		req.resume();
		this.parent.timeLastProgress = getTimestamp();
	},
	toString: function() {
		let len = this.parent.totalSize ? String(this.parent.totalSize).length  : 10;
		return formatNumber(this.start, len) +
			"/" + formatNumber(this.end, len) +
			"/" + formatNumber(this.total, len) +
			" running:" + this.running +
			" written/remain/sb:" + formatNumber(this.written, len) +
			"/" + formatNumber(this.remainder, len) +
			"/" + formatNumber(this._sessionBytes, len);
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
