/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const nsITimer = Ci.nsITimer;

const uuid = (function() {
	var i = 0;
	return function uuid() { return ++i; };
})();

// Represents the (private) timer data and observer
class TimerData {
	constructor(owner, time, type, func, ctx) {
		this.owner = owner;
		this.uuid = uuid();
		this.func = func;
		if (!this.func) {
			throw new Exception("callback function is null");
		}
		if (typeof this.func !== 'function') {
			throw new Exception("callback function is not actually a function");
		}
		this.ctx = ctx;
		this.timer = new Instances.Timer(this, time, type);
	}

	cancel() {
		return this.timer.cancel();
	}
	toString() {
		return this.uuid;
	}
	observe(timer) {
		this.execute();
		if (this.timer.type === nsITimer.TYPE_ONE_SHOT) {
			this.owner.killTimer(this.uuid);
		}
	}
	execute() {
		try {
			this.func.call(this.ctx);
		}
		catch (ex) {
			log(LOG_ERROR, "Failed to execute timer callback", ex);
		}
	}
}

/**
 * Manage Timers
 */
class TimerManager {
	constructor() {
		this._timers = {};
		unload(() => this.killAllTimers());
	}
	/**
	 * Creates one shot timer
	 * @param delay (int) Delay before timer will expire
	 * @param func (function) Callback function called once timer expires
	 * @param ctx (function) Optional. Function context or __parent__ of func if non given.
	 * @return (Timer) Timer id
	 */
	createOneshot(delay, func, ctx) {
		ctx = ctx || null;
		let td = new TimerData(this, delay, nsITimer.TYPE_ONE_SHOT, func, ctx);
		this._timers[td] = td;
		return td.uuid;
	}
	/**
	 * Creates repeating timer
	 * @param interval (int) Interval after the timer will expire
	 * @param func (function) Callback function called once timer expires
	 * @param ctx (function) Optional. Function context or __parent__ of func if non given.
	 * @param fireInitially (boolean) Optional. Fires the Timer right after creation (before function returns) if true.
	 * @param precise (boolean) Optional. Timer should be high a precise (not slack) timer. Default is false.s
	 * @return (Timer) Timer id
	 */
	createRepeating(interval, func, ctx, fireInitially, precise) {
		ctx = ctx || null;
		let td = new TimerData(
			this,
			interval,
			precise ? nsITimer.TYPE_REPEATING_PRECISE : nsITimer.TYPE_REPEATING_SLACK,
			func,
			ctx
			);
		this._timers[td] = td;
		if (fireInitially) {
			td.execute();
		}
		return td.uuid;
	}
	/**
	 * Kill a timer again
	 * @param (Timer) Timer to kill
	 */
	killTimer(uuid) {
		if (uuid in this._timers) {
			let td = this._timers[uuid];
			td.cancel();
			delete td.func;
			delete td.ctx;
			delete td.timer;
			delete this._timers[uuid];
		}
	}
	/**
	 * Kills all timers associated with this TimerManager instance
	 */
	killAllTimers() {
		for (let uuid in this._timers) {
			try {
				let td = this._timers[uuid];
				td.cancel();
				delete td.func;
				delete td.ctx;
				delete td.timer;
			}
			catch (ex) {
				// no op
			}
		}
		this._timers = {};
	}
};
Object.assign(TimerManager.prototype, {
	QueryInterface: QI([Ci.nsIObserver]),
});
exports.TimerManager = Object.freeze(TimerManager);
