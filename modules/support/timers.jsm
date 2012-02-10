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
 * The Original Code is DownThemAll ByteBucket module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
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

const EXPORTED_SYMBOLS = ['TimerManager'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const module = Components.utils.import;
const Exception = Components.Exception;

const nsITimer = Ci.nsITimer;

module("resource://dta/glue.jsm");
module("resource://dta/utils.jsm");
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
