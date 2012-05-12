/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const EXPORTED_SYMBOLS = ['TimerManager'];

const nsITimer = Ci.nsITimer;

Cu.import("resource://dta/utils.jsm");

function uuid() Services.uuid.generateUUID().toString();

// Represents the (private) timer data and observer
function TimerData(owner, time, type, func, ctx) {
	this.owner = owner;
	this.uuid = uuid();
	this.func = func;
	if (!this.func) {
		throw new Exception("callback function is null");
	}
	if (typeof this.func != 'function') {
		throw new Exception("callback function is not actually a function");
	}
	this.ctx = ctx;
	this.timer = new Instances.Timer(this, time, type);
}

TimerData.prototype = {
	cancel: function() this.timer.cancel(),
	toString: function() this.uuid,
	observe: function(timer) {
		if (this.timer.type == nsITimer.TYPE_ONE_SHOT) {
			this.owner.killTimer(this.uuid);
		}
		this.execute();
	},
	execute: function() {
		try {
			this.func.call(this.ctx);
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("Failed to execute timer callback", ex);
			}
		}
	}
};

/**
 * Manage Timers
 */
function TimerManager() {
	this._timers = {};
}
TimerManager.prototype = {
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),
	/**
	 * Creates one shot timer
	 * @param delay (int) Delay before timer will expire
	 * @param func (function) Callback function called once timer expires
	 * @param ctx (function) Optional. Function context or __parent__ of func if non given.
	 * @return (Timer) Timer id
	 */
	createOneshot: function(delay, func, ctx) {
		ctx = ctx || null;
		let td = new TimerData(this, delay, nsITimer.TYPE_ONE_SHOT, func, ctx);
		this._timers[td] = td;
		return td.uuid;
	},
	/**
	 * Creates repeating timer
	 * @param interval (int) Interval after the timer will expire
	 * @param func (function) Callback function called once timer expires
	 * @param ctx (function) Optional. Function context or __parent__ of func if non given.
	 * @param fireInitially (boolean) Optional. Fires the Timer right after creation (before function returns) if true.
	 * @param precise (boolean) Optional. Timer should be high a precise (not slack) timer. Default is false.s
	 * @return (Timer) Timer id
	 */
	createRepeating: function(interval, func, ctx, fireInitially, precise) {
		ctx = ctx || null;
		let td = new TimerData(this, interval, precise ? nsITimer.TYPE_REPEATING_PRECISE : nsITimer.TYPE_REPEATING_SLACK, func, ctx);
		this._timers[td] = td;
		if (fireInitially) {
			td.execute();
		}
		return td.uuid;
	},
	/**
	 * Kill a timer again
	 * @param (Timer) Timer to kill
	 */
	killTimer: function TM_kill(uuid) {
		if (uuid in this._timers) {
			this._timers[uuid].cancel();
			delete this._timers[uuid];
		}
	},
	/**
	 * Kills all timers associated with this TimerManager instance
	 */
	killAllTimers: function TM_killAll() {
		for (let td in this._timers) {
			try {
				td.cancel();
			}
			catch (ex) {
				// no op
			}
		}
		this._timers = {};
	}
};
exports.TimerManager = TimerManager;
