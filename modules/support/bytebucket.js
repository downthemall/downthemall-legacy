/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {TimerManager} = require("./timers");

const Timers = new TimerManager();

class ObserversBase {
	constructor(name) {
		this._name = name || "unnamed";
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
	toString() {
		return `<observer ${this._name}>`;
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
			super("manager");
			this._timer = Timers.createRepeating(1000, this.notify, this);
		}
		notify() {
			for (let o of this._obs) {
				try {
					o.notify();
				}
				catch (ex) {
					log(LOG_ERROR, "failed to notify", ex);
				}
			}
		}
	}
	return new Manager();
})();

class ByteBucket {
	constructor(byteRate, burstFactor, name) {
		log(LOG_DEBUG, `creating bucket: ${name} - ${byteRate} - ${burstFactor}`);
		this._name = `<${name || "unnamed"} bucket>`;
		this._obs = new Observers(this._name);
		this.byteRate = byteRate;
		this.burstFactor = burstFactor;
		this._available = byteRate;
		this._timer = null;
	}
	get name() {
		return this._name;
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
		if (!isFinite(nv) || nv < 1) {
			throw new Error("Invalid burst factor");
		}
		return this._burstFactor = nv;
	}
	requestBytes(bytes) {
		if (this._available === -1) {
			return bytes;
		}
		if (this._available < 0) {
			throw new Error("invalid avail");
		}
		let rv = Math.max(0, Math.min(bytes, this._available));
		return rv;
	}
	commitBytes(bytes) {
		this._available = Math.max(-1, this._available - bytes);
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
				this._byteRate * this._burstFactor
				)
			);
	}
	kill() {
		Timers.killTimer(this._timer);
		this._obs.kill();
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
