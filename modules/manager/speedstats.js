/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

/**
 * Speed Statistics
 * @param maxSpeeds (unsigned) Maximum number of speeds to count
 */
function SpeedStats(maxSpeeds) {
	this._maxSpeeds = maxSpeeds;
	this._speeds = [];
	this._aspeeds = [];
	this._lastTime = this._lastBytes = this._avg = 0;
}

SpeedStats.prototype = Object.freeze({
	/**
	 * Maximum number of speeds to store
	 * Oldest will be dropped if buffer runs full
	 */
	get maxSpeeds() {
		return this._maxSpeeds;
	},
	/**
	 * Average speed (at the moment)
	 */
	get avg() {
		return this._avg;
	},
	/**
	 * First (oldest) speed recorded
	 */
	get first() {
		return this._speeds[0];
	},
	/**
	 * Last (most recent) speed recorded
	 */
	get last() {
		return this._speeds[this._speeds.length - 1];
	},
	/**
	 * Number of speed statistics currently recorded
	 */
	get length() {
		return this._speeds.length;
	},
	/**
	 * Generator over all recorded speeds
	 */
	get all() {
		for (let x of this._speeds) {
			yield x;
		}
	},
	/**
	 * Generator over all avg speeds
	 */
	get allAvg() {
		for (let x of this._aspeeds) {
			yield x;
		}
	},
	/**
	 * Time of last update
	 */
	get lastUpdate() {
		return this._lastTime;
	},
	/**
	 * Bytes in last period
	 */
	get lastBytes() {
		return this._lastBytes;
	},
	/**
	 * Adds a new data point based on given downloaded bytes and time
	 * @param bytes (int) Bytes in the period
	 * @param time (int) Time bytes was recorded
	 */
	add: function DSS_add(bytes, time) {
		let received = 0;
		if (this._lastTime) {
			let elapsed = (time - this._lastTime) / 1000;
			received = bytes - this._lastBytes;
			let last = Math.round(received / elapsed);
			this._speeds.push(last);
			if (this._speeds.length > this._maxSpeeds) {
				this._speeds.shift();
			}
			let v = 1;
			let avg = this._speeds[0];
			for (let _v, i = 1, e = this._speeds.length; i < e; i++) {
				_v = i + 1;
				v += _v;
				avg = avg + _v * this._speeds[i];
			}
			this._avg = avg / v;
			this._aspeeds.push(this.avg);
			if (this._aspeeds.length > this._maxSpeeds) {
				this._aspeeds.shift();
			}
		}
		if (received < 0) {
			this.clear();
			return 0;
		}
		this._lastTime = time;
		this._lastBytes = bytes;
		return received;
	},
	/**
	 * Clears all statistics
	 */
	clear: function DSS_clear() {
		this._speeds.length = 0;
		this._aspeeds.length = 0;
		this._lastTime = this._lastBytes = this._avg = 0;
	}
});
exports.SpeedStats = Object.freeze(SpeedStats);
