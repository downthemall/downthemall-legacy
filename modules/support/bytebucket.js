/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

class ByteBucket {
	constructor(byteRate, burstFactor, name) {
		log(LOG_DEBUG, `creating bucket: ${name} - ${byteRate} - ${burstFactor}`);
		this._name = `<${name || "unnamed"} bucket>`;
		this.byteRate = byteRate;
		this.burstFactor = burstFactor;
	}
	get name() {
		return this._name;
	}
	get byteRate() {
		return this._byteRate;
	}
	set byteRate(nv) {
		if (!isFinite(nv)) {
			throw new Error(`${this}: Invalid byte rate`);
		}
		nv = Math.round(nv);
		if (nv <= 0) {
			nv = -1;
		}
		this._available = this._byteRate = nv;
		this._last = Date.now();
		return this._byteRate;
	}
	get burstFactor() {
		return this._burstFactor;
	}
	set burstFactor(nv) {
		if (!isFinite(nv) || nv < 1) {
			throw new Error(`${this}: Invalid burst factor`);
		}
		return this._burstFactor = nv;
	}

	_fill() {
		if (this._byteRate <= 0) {
			// Do not notify, as there is no limit imposed
			return;
		}
		let now = Date.now();
		let diff = now - this._last;
		this._available = Math.max(-1, Math.round(
			Math.min(this._available + (this._byteRate * diff / 1000), this._byteRate * this._burstFactor)
			));
		this._last = now;
	}

	requestBytes(bytes) {
		if (this._available === -1) {
			return bytes;
		}
		this._fill();
		if (this._available < 0) {
			throw new Error(`${this}: Invalid available: ${this._available}`);
		}
		let rv = Math.max(0, Math.min(bytes, this._available));
		return rv;
	}
	commitBytes(bytes) {
		if (this._byteRate <= 0) {
			return;
		}
		if (bytes > this._available) {
			throw Error(`${this}: Invalid over commit of ${bytes}`);
		}
		this._available = Math.max(0, this._available - bytes);
	}
	toString() {
		return `${this._name} (${this.byteRate}/${this.burstFactor}/${this._available})`;
	}
}

class ByteBucketTee {
	constructor(...args) {
		this._buckets = args.filter(e => e instanceof ByteBucket);
		if (!this._buckets.length) {
			throw new Error("No buckets supplied");
		}
	}
	get byteRate() {
		return this._buckets
			.map(e => e.byteRate)
			.reduce((p, c) =>  c > 0 ? Math.min(p,c) : p);
	}
	get burstFactor() {
		return this._buckets
			.map(e => e.burstFactor)
			.reduce((p, c) => Math.min(p,c));
	}
	requestBytes(bytes) {
		for (let b of this._buckets) {
			bytes = b.requestBytes(bytes);
			if (!bytes) {
				return 0;
			}
		}
		for (let b of this._buckets) {
			b.commitBytes(bytes);
		}
		return bytes;
	}
}

exports.ByteBucket = ByteBucket;
exports.ByteBucketTee = ByteBucketTee;
