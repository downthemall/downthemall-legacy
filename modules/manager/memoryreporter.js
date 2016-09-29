/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/* global BUFFER_SIZE, MAX_PENDING_SIZE */
requireJoined(this, "constants");
const {TimerManager} = require("support/timers");
const pressure = require("support/memorypressure");

const Timers = new TimerManager();

class MemoryReporter {
	constructor() {
		this.explicitNonHeap = 0;
		this.process = "";
		this.chunks = new Set();
		this.session = {
			chunks: 0,
			written: 0
		};
		this._calc();
		this.memoryPressure = 0;
		return Object.seal(this);
	}

	_calc(force) {
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
		this._chunksScheduled = 0;
		this._chunksActive = 0;

		for (let c of this.chunks) {
			let bs = c.buffer_size;
			this._pendingBytes += c.buffered;
			if (c._req) {
				++this._chunksScheduled;
			}
			else {
				++this._chunksActive;
			}
		}
	}
	get pendingBytes() {
		this._calc();
		return this._pendingBytes;
	}
	get cachedBytes() {
		this._calc();
		return this._cachedBytes;
	}
	collectReports(callback, closure) {
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
	}
	noteBytesWritten(bytes) {
		this.session.written += bytes;
	}
	registerChunk(chunk) {
		this.chunks.add(chunk);
		++this.session.chunks;
	}
	unregisterChunk(chunk) {
		this.chunks.delete(chunk);
	}
	unload() {
		pressure.remove(this);
		try {
			if ("unregisterStrongReporter" in Services.memrm) {
				Services.memrm.unregisterStrongReporter(this);
			}
			else {
				Services.memrm.unregisterReporter(this);
			}
		} catch (ex) {}
		Timers.killAllTimers();
	}
	observe(s, topic, data) {
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
	}
	decrementPressure() {
		--this.memoryPressure;
		if (this.memoryPressure <= 0) {
			this.memoryPressure = 0;
			log(LOG_DEBUG, "memoryPressure lifted");
			return;
		}
		this.schedulePressureDecrement();
	}
	schedulePressureDecrement() {
		Timers.createOneshot(100, this.decrementPressure, this);
	}
};
Object.seal(MemoryReporter.prototype);
const memoryReporter = exports.memoryReporter = new MemoryReporter();

try {
	if ("unregisterStrongReporter" in Services.memrm) {
		Services.memrm.registerStrongReporter(memoryReporter);
		log(LOG_DEBUG, "registered strong reporter");
	}
	else {
		Services.memrm.registerReporter(memoryReporter);
		log(LOG_DEBUG, "registered reporter");
	}
}
catch (ex) {
	log(LOG_ERROR, "Failed to register reporter", ex);
}

pressure.add(memoryReporter);
unload(memoryReporter.unload.bind(memoryReporter));
