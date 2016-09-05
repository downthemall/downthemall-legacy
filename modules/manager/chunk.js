/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/* global BUFFER_SIZE, MAX_PENDING_SIZE */
requireJoined(this, "constants");
const Prefs = require("preferences");
const {ByteBucketTee} = require("support/bytebucket");
const {GlobalBucket} = require("./globalbucket");
const {TimerManager} = require("support/timers");
const Limits = require("support/serverlimits");
const {getTimestamp, formatNumber, makeDir} = require("utils");
const {Task} = requireJSM("resource://gre/modules/Task.jsm");
const {memoryReporter} = require("./memoryreporter");

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
	unload(() => {
		AsyncCopierThread.shutdown();
	});
	return AsyncCopierThread;
})();

var buffer_size = Math.max(1<<18, BUFFER_SIZE);

function roundp2(s) {
	s |= (--s) >> 1;
	s |= s >> 2;
	s |= s >> 4;
	s |= s >> 8;
	s |= s >> 16;
	return ++s;
}

exports.hintChunkBufferSize = function(bs) {
	if (!bs) {
		return;
	}
	buffer_size = Math.max(1<<18, Math.min(BUFFER_SIZE * 32, roundp2(bs * 2)));
};

const Observer = {
	observe: function(s, topic, data) {
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
};
Prefs.addObserver("extensions.dta.permissions", Observer);

function Buffer(size) {
	this.size = size;
	this._pipe = new Instances.Pipe(true, true, size, 1);
	this._out = this._pipe.outputStream;
}
Buffer.prototype = Object.seal({
	length: 0,
	get free() {
		return this.size - this.length;
	},
	writeFrom: function(inputStream, length) {
		if (length > this.free) {
			throw new Error(`Buffer overflow, free: ${this.free}, length: ${length}, blen: ${this.length}`);
		}
		let exception = null;
		for (let i = 0; i < 10; ++i) {
			try {
				this._out.writeFrom(inputStream, length);
				exception = null;
				break;
			}
			catch (ex) {
				exception = ex;
				try {
					Services.memrm.minimizeMemoryUsage(() => {});
				}
				catch (iex) {
					log(LOG_ERROR, "Failed to minimize memory usage", iex);
				}
				for (let j = 0; j < (i + 1) * 1000; ++j) {
					// Do some busy looping
				}
			}
		}
		if (exception) {
			throw exception;
		}
		this.length += length;
		return length;
	},
	unlink: function() {
		if (this._out) {
			this._out.close();
			this._out = null;
		}
		if (this._pipe) {
			this._pipe = null;
			delete this._pipe;
		}
		this.length = this.size = 0;
	},
	get stream() {
		return this._pipe.inputStream;
	}
});

function shipStream(instream, outstream, closeSink) {
	let copier = new Instances.AsyncStreamCopier(
		instream,
		outstream,
		_thread,
		true, // source buffered
		false, // sink buffered
		instream.available(),
		true, // close source
		closeSink // close sink
		);
	return new Promise(function(resolve, reject) {
		copier.asyncCopy({
			onStartRequest: function(req, context) {},
			onStopRequest: function(req, context, status) {
				if (!Components.isSuccessCode(status)) {
					reject(status);
				}
				else {
					resolve();
				}
			}
		}, null);
	});
}

function Chunk(download, start, end, written) {
	// safeguard against null or strings and such
	this._parent = download;
	this._start = start;
	this._written = written > 0 ? written : 0;
	this._sessionBytes = 0;

	this.end = end;
	this.safeBytes = this._written;

	log(LOG_INFO, "chunk created: " + this);
}

Chunk.prototype = {
	_inited: false,
	_buffered: 0,
	_written: 0,
	_pendingWrites: 0,
	_wnd: 2048,

	running: false,
	safeBytes: 0,

	get _hasBuffer() {
		return !!this._buffer;
	},

	get starter() {
		return this.end <= 0;
	},
	get start() {
		return this._start;
	},
	get end() {
		return this._end;
	},
	set end(nv) {
		this._end = nv;
		this._total = this.end && (this._end - this._start + 1);
	},
	get total() {
		return this._total;
	},
	get written() {
		return this._written;
	},
	get bufferedPending() {
		return this._buffered;
	},
	get bufferedCached() {
		return this._hasBuffer ? this._buffer.length : 0;
	},
	get buffered() {
		return this.bufferedPending + this.bufferedCached;
	},
	get currentPosition() {
		return this.start + this.written;
	},
	get remainder() {
		return this._total - this._written;
	},
	get complete() {
		if (this._end <= 0) {
			return this.written !== 0;
		}
		return this._total === this.written;
	},
	get parent() {
		return this._parent;
	},
	get sessionBytes() {
		return this._sessionBytes;
	},

	_init: function() {
		if (this._inited) {
			return;
		}
		this._inited = true;
		this.errored = false;

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
		if (this._outStream) {
			return new Promise(r => r(this._outStream));
		}
		if (this._openPromise) {
			return this._openPromise;
		}

		const file = this.parent.tmpFile;
		let pos = this.start + this.safeBytes;
		log(LOG_DEBUG, "opening " + file.path + " at: " + pos);
		this.errored = false;
		return this._openPromise = Task.spawn(function*() {
			try {
				yield makeDir(file.parent, Prefs.dirPermissions);
			}
			catch (ex if ex.becauseExists) {
				// no op
			}
			let outStream = new Instances.FileOutputStream(
				file,
				0x02 | 0x08,
				Prefs.permissions,
				Ci.nsIFileOutputStream.DEFER_OPEN
				);
			if (pos) {
				let seekable = outStream.QueryInterface(Ci.nsISeekableStream);
				seekable.seek(0x00, pos);
			}
			delete this._openPromise;
			return (this._outStream = outStream);
		}.bind(this));
	},
	_noteBytesWritten: function(bytes) {
		this._written += bytes;
		this._sessionBytes += bytes;
		memoryReporter.noteBytesWritten(bytes);

		this.parent.timeLastProgress = getTimestamp();
	},
	_ensureBuffer: function() {
		if (this._hasBuffer) {
			return;
		}
		this.buffer_size = buffer_size;
		this._buffer = new Buffer(this.buffer_size);
	},
	_shipBuffer: function() {
		let buffer = this._buffer;
		delete this._buffer;
		if (!buffer) {
			return;
		}
		let length = buffer.length;
		if (!length) {
			log(LOG_DEBUG, "Not shipping buffer, zero length");
			return;
		}

		log(LOG_DEBUG, "shipping buffer: " + length);
		let stream = buffer.stream;
		buffer.unlink();
		this._buffered += length;
		++this._pendingWrites;
		if (this.errored) {
			log(LOG_DEBUG, "Not shipping buffer, we're errored");
			return;
		}
		Task.spawn(function* _shipBufferTask() {
			try {
				yield shipStream(stream, (yield this._open()), false);
				this._buffered -= length;
				--this._pendingWrites;
				this.safeBytes += length;
				if (!this.running) {
					this.close();
				}
			}
			catch (ex) {
				try {
					this.errored = true;
					this._buffered -= length;
					--this._pendingWrites;
					log(LOG_ERROR, "Failed to write", ex);
					this.download.writeFailed(ex);
				}
				catch (ex2) {
					log(LOG_ERROR, "aggregate failure", ex2);
				}
				if (!this.running) {
					this.close();
				}
			}
		}.bind(this));
	},
	close: function() {
		if (this._closing) {
			return this._closing;
		}
		if (!this._inited) {
			return new Promise(r => r());
		}
		this.running = false;
		return (this._closing = Task.spawn(function*() {
			try {
				if (this._hasBuffer) {
					this._shipBuffer();
				}
				if (this._outStream || this._openPromise) {
					// hacky way to close the stream off the main thread
					let is = new Instances.StringInputStream("", 0);
					yield shipStream(is, (yield this._open()), true);
					delete this._outStream;
				}
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
			}
			catch (ex) {
				log(LOG_ERROR, "Damn!", ex);
			}
			finally {
				delete this._closing;
			}
		}.bind(this)));
	},
	merge: function(ch) {
		if (!this.complete && !ch.complete) {
			throw new Error("Cannot merge incomplete chunks this way!");
		}
		this.end = ch.end;
		this._written += ch._written;
		this.safeBytes += ch.safeBytes;
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
			this._buffer.unlink();
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

			// per e10n contract we must consume all bytes
			// or in our case all remainder bytes
			// reqPending from above makes sure that we won't re-schedule
			// the download too early
			let written = 0;
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
				written += fill;
			}
			this._ensureBuffer();
			while (bytes >= this.buffer_size) {
				if (this._buffer.writeFrom(aInputStream, this.buffer_size) !== this.buffer_size) {
					throw new Error("Failed to write full stream. " + this);
				}
				this._shipBuffer();
				bytes -= this.buffer_size;
				written += this.buffer_size;
				this._ensureBuffer();
			}
			if (bytes) {
				this._ensureBuffer();
				try {
					let part = this._buffer.writeFrom(aInputStream, bytes);
					if (part !== bytes) {
						throw new Error("Failed to write all requested bytes to current stream. bytes: " +
							bytes + " actual: " + part + " chunk: " + this);
					}
					written += part;
					bytes -= part;
				}
				catch (ex) {
					log(LOG_ERROR, "Failed to write: " + bytes + "/" + this._buffer.free + "/" + this.buffer_size, ex);
					throw ex;
				}
			}
			this._noteBytesWritten(got);

			return written;
		}
		catch (ex) {
			log(LOG_ERROR, 'write: ' + this.parent.tmpFile.path, ex);
			throw ex;
		}
		return 0;
	},
	observe: function() {
		this.run();
	},
	requestBytes: function(requested) {
		if (memoryReporter.pendingBytes > MAX_PENDING_SIZE) {
			log(LOG_INFO, `Under pressure: pending total: ${memoryReporter.pendingBytes} this: ${this.bufferedPending} and cached ${this.bufferedCached}`);
			// basically stop processing while under memory pressure
			this.schedule();
			return 0;
		}
		if (memoryReporter.memoryPressure > 0) {
			log(LOG_INFO, "Under some pressure: " + memoryReporter.pendingBytes +
				" : " + memoryReporter.memoryPressure + " : " + requested);
			requested = Math.max(Math.min(requested, 256), Math.floor(requested / memoryReporter.memoryPressure));
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
