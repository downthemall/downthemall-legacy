/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const Prefs = require("preferences");
const {TimerManager} = require("support/timers");

//Add some helpers to Date
//Note to reviewers: Our scope, our rules ;)
Date.prototype.addMilliseconds =  function(ms) this.setMilliseconds(this.getMilliseconds() + ms);
Date.prototype.addSeconds = function(s) this.addMilliseconds(s * 1000);
Date.prototype.addMinutes = function(m) this.addMilliseconds(m * 60000);
Date.prototype.addHours = function(h) this.addMilliseconds(h * 3600000);
Date.prototype.addDays =  function(d) this.setDate(this.getDate() + d);
Date.__defineGetter__("today", function() {
	let rv = new Date();
	rv.setHours(0);
	rv.setMinutes(0);
	rv.setSeconds(0);
	rv.setMilliseconds(0);
	return rv;
});

const Timers = new TimerManager();

lazy(this, "DTA", function() require("api"));
lazy(this, "QueueStore", function() {
	let {QueueStore} = require("manager/queuestore");
	requireJoined(QueueStore, "constants");
	return QueueStore;
})

const Observer = {
	init: function() {
		Prefs.addObserver("extensions.dta.schedule", this);
		unload(function() Observer.unload());
		this.immidiatelyOpened = this.openIfInRange();
		log(LOG_DEBUG, "scheduler running");
	},
	unload: function() {
		Timers.killAllTimers();
	},
	observe: function(s, topic, d) {
		if (!this.immediatelyOpened) {
			this.immidiatelyOpened = this.openIfInRange();
		}
		else {
			this.scheduleNext();
		}
	},
	openIfQueued: function() {
		QueueStore.loadItems(function(items) {
			if (items.some(function(i) i.item.state == QueueStore.QUEUED)) {
				log(LOG_INFO, "auto-opening");
				DTA.openManager();
			}
			else {
				log(LOG_INFO, "not opening: No queued items");
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
		let current = Date.today;
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
