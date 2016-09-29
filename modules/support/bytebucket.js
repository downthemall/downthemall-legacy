/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {TimerManager} = require("./timers");

const Timers = new TimerManager();

class ObserversBase {
	constructor() {
		this._obs = new Set();
	}
	register(observer) {
		this._obs.add(observer);
	}
	unregister(observer) {
		this._obs.delete(observer);
	}
	notify() {
		for (let o of this._obs) {
			o.observe.call(o);
		}
	}
}

class Observers extends ObserversBase {
	start() {
		Observers.Manager.register(this);
	}
	stop() {
		Observers.Manager.unregister(this);
	}
	kill() {
		this.stop();
		this._obs.length = 0;
	}
	observe() {
		//this._obs.sort(function() Math.round(Math.random() - 0.5));
	}
}
Object.assign(Observers.prototype, {
	QueryInterface: QI([Ci.nsIObserver]),
});
Observers.Manager = (function() {
	class Manager extends ObserversBase {
		constructor() {
			super();
			this._timer = Timers.createRepeating(1000, this.notify, this);
		}
	}
	return new Manager();
})();

class ByteBucket {
	constructor(byteRate, burstFactor) {
		this._obs = new Observers();
		this.byteRate = byteRate;
		if (arguments.length > 1) {
			this.burstFactor = burstFactor;
		}
		this._available = byteRate;
		this._timer = null;
		this._available = -1;
		this._byteRate = 0;
		this._burstFactor = 1.5;
	}
	get byteRate() {
		return this._byteRate;
	}
	set byteRate(nv) {
		if (!isFinite(nv)) {
			throw new Error("Invalid byte rate");
		}
		nv = Math.round(nv);
		if (nv === 0) {
			nv = -1;
		}
		this._available = this._byteRate = nv;

		if (nv > 0 && !this._timer) {
			this._timer = Timers.createRepeating(100, this.observe, this, false, true);
			this._obs.start();
		}
		else if (nv <= 0 && this._timer) {
			this.observe();
			this._obs.notify();
			Timers.killTimer(this._timer);
			this._timer = null;
			this._obs.stop();
		}

		return this._byteRate;
	}
	get burstFactor() {
		return this._burstFactor;
	}
	set burstFactor(nv) {
		if (!isFinite(nv) || nv <= 1) {
			throw new Error("Invalid burst factor");
		}
		return this._burstFactor = nv;
	}
	requestBytes(bytes) {
		if (this._available < 0) {
			return bytes;
		}
		return Math.max(0, Math.min(bytes, this._available));
	}
	commitBytes(bytes) {
		this._available -= bytes;
	}
	register(observer) {
		return this._obs.register(observer);
	}
	unregister(observer) {
		return this._obs.unregister(observer);
	}
	observe() {
		if (this._byteRate <= 0) {
			// Do not notify, as there is no limit imposed
			return;
		}
		this._available = Math.round(
			Math.min(
				this._available + (this._byteRate / 10),
				this.byteRate * this._burstFactor
				)
			);
		this._obs.notify();
	}
	kill() {
		Timers.killTimer(this._timer);
		this._obs.kill();
	}
}

class ByteBucketTee {
	constructor() {
		this._buckets = Array.filter(arguments, e => e instanceof ByteBucket);
		if (!this._buckets.length) {
			throw new Error("No buckets supplied");
		}
	}
	get byteRate() {
		return this._buckets
			.map(e => e.byteRange)
			.reduce((p, c) =>  c > 0 ? Math.min(p,c) : p);
	}
	get burstFactor() {
		return this._buckets
			.map(e =>e.burstFactor)
			.reduce((p, c) => Math.min(p,c));
	}
	requestBytes(bytes) {
		for (let i = 0, e = this._buckets.length; i < e; ++i) {
			bytes = this._buckets[i].requestBytes(bytes);
			if (!bytes) {
				return 0;
			}
		}
		for (let i = 0, e = this._buckets.length; i < e; ++i) {
			this._buckets[i].commitBytes(bytes);
		}
		return bytes;
	}
	register(observer) {
		for (let b of this._buckets) {
			b.register(observer);
		}
	}
	unregister(observer) {
		for (let b of this._buckets) {
			b.unregister(observer);
		}
	}
}

exports.ByteBucket = ByteBucket;
exports.ByteBucketTee = ByteBucketTee;
