/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const TOPIC_SHUTDOWN = "profile-change-teardown";

function Observer() {
	Services.obs.addObserver(this, TOPIC_SHUTDOWN, false);
}
Observer.prototype = Object.freeze({
	observers: new Map(),

	unload: function() {
		log(LOG_DEBUG, "DYING");
		for (let [t, o] of this.observers) {
			try {
				Services.obs.removeObserver(this, t, false);
			}
			catch (ex) {
				log(LOG_ERROR, "unload; failed to remove observer for topic " + t, ex);
			}
			o.clear();
		}
		this.observers.clear();
		Services.obs.removeObserver(this, TOPIC_SHUTDOWN);
	},

	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),

	add: function(obs, topic) {
		if (!obs || !topic) {
			throw new Error("Invalid arguments");
		}
		let observers = this.observers.get(topic);
		if (!observers) {
			if (topic !== TOPIC_SHUTDOWN) {
				Services.obs.addObserver(this, topic, false);
			}
			observers = new Set();
			this.observers.set(topic, observers);
		}
		observers.add(obs);
	},
	remove: function(obs, topic) {
		if (!obs || !topic) {
			throw new Error("Invalid arguments");
		}
		let observers = this.observers.get(topic);
		if (!observers) {
			log(LOG_ERROR, "not a registered topic: " + topic);
			return;
		}
		observers.delete(obs);
		if (!observers.size) {
			if (topic !== TOPIC_SHUTDOWN) {
				Services.obs.removeObserver(this, topic);
			}
			this.observers.delete(topic);
		}
	},
	get topics() {
		let topics = [];
		for (let [t,o] of this.observers) {
			topics.push(t);
		}
		return topics;
	},
	observe: function(subject, topic, data) {
		var observers = this.observers.get(topic);
		if (!observers) {
			return;
		}
		for (let o of observers) {
			try {
				if (o.observe) {
					o.observe(subject, topic, data);
				}
				else {
					o(subject, topic, data);
				}
			}
			catch (ex) {
				log(LOG_ERROR, "observer bailed, " + o, ex);
			}
		}
		if (topic === TOPIC_SHUTDOWN) {
			this.unload();
		}
	}
});
const observer = new Observer();
unload(observer.unload.bind(observer));


Object.defineProperties(exports, {
	"add": {
		value: function add(obs, topic) observer.add(obs, topic),
		enumerable: true
	},
	"remove": {
		value: function remove(obs, topic) observer.remove(obs, topic),
		enumerable: true
	},
	"topics": {
		get: function() observer.topics,
		enumerable: true
	},
	"notify": {
		value: function notify(subject, topic, data) Services.obs.notifyObservers(subject, topic, data),
		enumerable: true
	},
	"notifyLocal": {
		value: function notifyLocal(subject, topic, data) observer.observe(subject, topic, data),
		enumerable: true
	}
});
