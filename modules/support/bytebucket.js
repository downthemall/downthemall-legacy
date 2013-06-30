/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {TimerManager} = require("support/timers");

const Timers = new TimerManager();

function ObserversBase() {
	this._obs = new Set();
}
ObserversBase.prototype = Object.freeze({
	register: function(observer) {
		this._obs.add(observer);
	},
	unregister: function(observer) {
		this._obs.delete(observer);
	},
	notify: function() {
		for (let o of this._obs) {
			o.observe.call(o);
		}
	}
});

function Observers() {
	ObserversBase.call(this);
}
Observers.prototype = {
	__proto__: ObserversBase.prototype,
	QueryInterface: QI([Ci.nsIObserver]),
	start: function() {
		Observers.Manager.register(this);
	},
	stop: function() {
		Observers.Manager.unregister(this);
	},
	kill: function() {
		this.stop();
		this._obs.length = 0;
	},
	observe: function() {
		this._obs.sort(function() Math.round(Math.random() - 0.5));
	}
}
Observers.Manager = (function() {
	function Manager() {
		ObserversBase.call(this);
		this._timer = Timers.createRepeating(1000, this.notify, this);
	}
	Manager.prototype = {
		__proto__: ObserversBase.prototype
	};
	return new Manager();
})();

function ByteBucket(byteRate, burstFactor) {
	this._obs = new Observers();
	this.byteRate = byteRate;
	if (arguments.length > 1) {
		this.burstFactor = burstFactor;
	}
	this._available = byteRate;
}
ByteBucket.prototype = {
	_timer: null,
	_available: -1,
	_byteRate: 0,
	_burstFactor: 1.5,
	get byteRate() {
		return this._byteRate;
	},
	set byteRate(nv) {
		if (!isFinite(nv)) {
			throw new Error("Invalid byte rate");
		}
		nv = Math.round(nv);
		if (nv == 0) {
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
	},
	get burstFactor() {
		return this._burstFactor;
	},
	set burstFactor(nv) {
		if (!isFinite(nv) || nv <= 1) {
			throw new Error("Invalid burst factor");
		}
		return this._burstFactor = nv;
	},
	requestBytes: function(bytes) {
		if (this._available < 0) {
			return bytes;
		}
		return Math.max(0, Math.min(bytes, this._available));
	},
	commitBytes: function(bytes) {
		this._available -= bytes;
	},
	_obs: null,
	register: function(observer) {
		return this._obs.register(observer);
	},
	unregister: function(observer) {
		return this._obs.unregister(observer);
	},
	observe: function() {
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
	},
	kill: function() {
		Timers.killTimer(this._timer);
		this._obs.kill();
	}
};

function ByteBucketTee() {
	this._buckets = Array.filter(arguments, function(e) e instanceof ByteBucket);
	if (!this._buckets.length) {
		throw new Error("No buckets supplied");
	}
}
ByteBucketTee.prototype = {
	get byteRate() {
		return this._buckets
			.map(function(e) e.byteRange)
			.reduce(function(p, c) c > 0 ? Math.min(p,c) : p);
	},
	get burstFactor() {
		return this._buckets
			.map(function(e) e.burstFactor)
			.reduce(function(p, c) Math.min(p,c));
	},
	requestBytes: function(bytes) {
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
	},
	register: function(observer) {
		for (let b of this._buckets) {
			b.register(observer);
		}
	},
	unregister: function(observer) {
		for (let b of this._buckets) {
			b.unregister(observer);
		}
	}
};

exports.ByteBucket = ByteBucket;
exports.ByteBucketTee = ByteBucketTee;
