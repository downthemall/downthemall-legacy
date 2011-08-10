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
const Limits = {};
module("resource://dta/support/serverlimits.jsm", Limits);

module("resource://dta/manager/globalbucket.jsm");

const AsyncStreamCopier = ctor("@mozilla.org/network/async-stream-copier;1","nsIAsyncStreamCopier", "init");
const FileOutputStream = ctor("@mozilla.org/network/file-output-stream;1", "nsIFileOutputStream", "init");
const ScriptableInputStream = ctor("@mozilla.org/scriptableinputstream;1", "nsIScriptableInputStream", "init");
const StorageStream = ctor("@mozilla.org/storagestream;1", "nsIStorageStream", "init");
const SupportsUint32 = ctor("@mozilla.org/supports-PRUint32;1", "nsISupportsPRUint32");

const _thread = (function() {
	// Use a dedicated thread, so that we have serialized writes.
	// As we use a single sink for various reasons, we need to ensure the
	// shipped bytes arrive and are written to in the correct order.
	// The assumption that writes will be properly serialized is based on the
	// following assumptions
	//  1. The thread event queue processes events fifo, always
	//  2. The async stream copier writes a bufferStream in one event, i.e. it
	//     does interrupt the copy and reschedule the rest in another event
	//
	// Why do we want to use all this cruft?
	// - To keep the browser snappier by having the slow disk I/O stuff off the
	//   main thread.
	// - Having a single thread doing all the writes might reduce/avoid some
	//   nasty performance issues, such as thrashing due to concurrency.
	// - We cannot use ChromeWorkers, because we cannot do file I/O there
	//   unless we reimplement file I/O using ctypes (and that's just not
	//   reasonable).
	//
	// For the amo-validator context:
	// Editor note: Safe use as an event target for nsIAsyncStreamCopier
	let thread = Cc["@mozilla.org/thread-manager;1"].getService(Ci.nsIThreadManager).newThread(0);
	if (thread instanceof Ci.nsISupportsPriority) {
		thread.priority = thread.PRIORITY_LOW;
		Logger.log("Our async copier thread is low priority now!");
	}
	return thread;
})();

function MemoryReporter() {
	this.chunks = [];
	return Object.freeze(this);
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
	collectReports: function(callback, closure) {
		let pending = 0;
		let cached = 0;
		let chunksActive = 0;
		let chunksScheduled = 0;
		try {
			for (let [,c] in Iterator(this.chunks)) {
				pending += c.bufferedPending;
				cached += c.bufferedCached;
				if (c._req) {
					++chunksScheduled;
				}
				else {
					++chunksActive;
				}
			}
		}
		catch (ex) {
			return;
		}
		callback.callback(
			this.process,
			"explicit/downthemall/downloads/pending",
			1,
			0,
			pending,
			"Downloaded bytes waiting or in the process of being written to disk",
			closure
			);
		callback.callback(
			this.process,
			"explicit/downthemall/downloads/cached",
			1,
			0,
			cached,
			"Downloaded bytes in cache",
			closure
			);
		callback.callback(
			this.process,
			"downthemall/connections-active",
			2,
			1,
			chunksActive,
			"Currently active connections (chunks)",
			closure
			);
		callback.callback(
			this.process,
			"downthemall/connections-scheduled",
			2,
			1,
			chunksScheduled,
			"Currently scheduled/suspended connections (chunks)",
			closure
			);
	},
	registerChunk: function(chunk) {
		this.chunks.push(chunk);
	},
	unregisterChunk: function(chunk) {
		let idx = this.chunks.indexOf(chunk);
		if (idx >= 0) {
			this.chunks.splice(idx, 1);
		}
	}
};
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
	observe: function(s, topic, d) {
		if (topic == "quit-application") {
			Services.obs.removeObserver(this, "quit-application");
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
	}
}
Prefs.addObserver("extensions.dta.permissions", Observer);
Services.obs.addObserver(Observer, "quit-application", true);

function Chunk(download, start, end, written) {
	// saveguard against null or strings and such
	this._written = written > 0 ? written : 0;
	this._start = start;
	this._end = end;
	this.end = end;
	this._parent = download;
	this._sessionBytes = 0;
	this._copiers = [];
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
	get bufferedCached() this._bufferStream ? this._bufferStream.length : 0,
	get buffered() (this.bufferedPending + this.bufferedCached),
	get safeBytes() (this.written - this.buffered),
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
	},
	openOutStream: function CH_openOutStream(file, at) {
		let outStream = new FileOutputStream(file, 0x02 | 0x08, Prefs.permissions, 0);
		let seekable = outStream.QueryInterface(Ci.nsISeekableStream);
		seekable.seek(0x00, at);
		return outStream;
	},
	open: function CH_open() {
		this._sessionBytes = 0;
		let file = this.parent.tmpFile;
		if (!file.parent.exists()) {
			file.parent.create(Ci.nsIFile.DIRECTORY_TYPE, Prefs.dirPermissions);
		}
		this._outStream = this.openOutStream(file, this.start + this.written);
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
		if (this._bufferStream) {
			this._shipBufferStream();
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
		this._sessionBytes = 0;
		MemoryReporter.unregisterChunk(this);
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
	cancel: function CH_cancel() {
		this.running = false;
		this._canceled = true;
		for (let [i,c] in Iterator(this._copiers)) {
			try {
				c.cancel(Cr.NS_ERROR_ABORT);
			}
			catch (ex) {
				Cu.reportError(ex);
				// don't care just now ;)
			}
		}

		// prevent shipping the current bufferStream
		delete this._bufferStream;

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
			let got = this.buckets.requestBytes(bytes);
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
			if (!this._bufferStream) {
				this._bufferStream = new StorageStream((1<<12), (1<<30), null);
			}

			let so = this._bufferStream.getOutputStream(this._bufferStream.length);
			so.write(new ScriptableInputStream(aInputStream).readBytes(bytes), bytes);
			so.close();

			if (this._bufferStream.length + bytes > MIN_CHUNK_SIZE) {
				this._shipBufferStream();
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
	_shipBufferStream: function CH__shipStreamBuffer() {
		let bytes = this._bufferStream.length;
		let copier = new AsyncStreamCopier(
			this._bufferStream.newInputStream(0),
			this._outStream,
			_thread,
			true, // source buffered
			false, // sink buffered
			bytes,
			true, // close source
			false // close sink
			);
		delete this._bufferStream;

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
	run: function CH_run() {
		if (!this._req) {
			return;
		}
		if (this._reqPending > 0) {
			// Still have pending bytes?
			let requested = Math.min(this._wnd, this._reqPending);
			let got = this.buckets.requestBytes(requested);
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
	}
};
