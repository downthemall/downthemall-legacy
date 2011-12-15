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
 * The Original Code is DownThemAll! Schedule Auto Start
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2011
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

const EXPORTED_SYMBOLS = [];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

const Prefs = {};
module("resource://dta/glue.jsm");
module("resource://dta/preferences.jsm", Prefs);
module("resource://dta/utils.jsm");
module("resource://dta/support/timers.jsm");

//Add some helpers to Date
//Notes to reviewer: Our scope, our rules ;)
merge(
	Date.prototype,
	{
		addMilliseconds: function(ms) this.setMilliseconds(this.getMilliseconds() + ms),
		addSeconds: function(s) this.addMilliseconds(s * 1000),
		addMinutes: function(m) this.addMilliseconds(m * 60000),
		addHours: function(h) this.addMilliseconds(h * 3600000),
		addDays: function(d) this.setDate(this.getDate() + d)
	}
);
merge(
	Date,
	{
		today: function() {
			let rv = new Date();
			rv.setHours(0);
			rv.setMinutes(0);
			rv.setSeconds(0);
			rv.setMilliseconds(0);
			return rv;
		}
	}
);

const Timers = new TimerManager();

setNewGetter(this, "DTA", function() {
	let _m = {};
	module("resource://dta/api.jsm", _m);
	return _m;
});
setNewGetter(this, "QueueStore", function() {
	let _m = {};
	module("resource://dta/manager/queuestore.jsm", _m);
	_m = _m.QueueStore;
	module("resource://dta/constants.jsm", _m);
	return _m;
})

const Observer = {
	init: function() {
		Prefs.makeObserver(this);
		Services.obs.addObserver(this, "quit-application", false);
		Prefs.addObserver("extensions.dta.schedule", this);
		this.immidiatelyOpened = this.openIfInRange();
	},
	observe: function(s, topic, d) {
		if (topic == "quit-application") {
			Timers.killAllTimers();
			Services.obs.removeObserver(this, "quit-application");
			return;
		}
		if (topic == "nsPref:changed") {
			if (!this.immediatelyOpened) {
				this.immidiatelyOpened = this.openIfInRange();
			}
			else {
				this.scheduleNext();
			}
			return;
		}
	},
	openIfQueued: function() {
		QueueStore.loadItems(function(items) {
			if (items.some(function(i) i.item.state == QueueStore.QUEUED)) {
				if (Logger.enabled) {
					Logger.log("auto-opening");
				}
				DTA.openManager();
			}
			else {
				if (Logger.enabled) {
					Logger.log("No queued items");
				}
			}
		}, null);
	},
	openIfInRange: function() {
		this.cancelTimer();

		let disabled = true;
		if (Prefs.getExt("schedule.enabled", false)) {
			let start = Prefs.getExt("schedule.start", 0);
			let end = Prefs.getExt("schedule.end", 0);
			let current = new Date();
			current = current.getHours() * 60 + current.getMinutes();

			if (start < end) {
				disabled = current < start || current > end;
			}
			else {
				disabled = current < start && current > end;
			}
			if (!disabled) {
				this.openIfQueued();
			}
		}
		this.scheduleNext();
		return !disabled;
	},
	timer: null,
	cancelTimer: function() {
		if (!this.timer) {
			return;
		}
		Timers.killTimer(this.timer);
		this.timer = null;
	},
	scheduleNext: function() {
		this.cancelTimer();
		let start = Prefs.getExt("schedule.start", 0);
		let current = Date.today();
		let now = new Date();
		current.addMinutes(start);
		if (current < now) {
			current.addDays(1);
		}
		current = current.valueOf() - now.valueOf() + 1000;
		this.timer = Timers.createOneshot(current, this.openIfInRange, this);
	}
};
Observer.init();
