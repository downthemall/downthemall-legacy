/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const obs = require("support/observers");

const Observer = Object.freeze({
	observers: new Set(),
	add: function(obs) {
		this.observers.add(obs);
	},
	remove: function(obs) {
		this.observers.delete(obs);
	},
	unload: function() {
		obs.remove(this, "memory-pressure");
		this.observers.clear();
	},
	observe: function(subject, topic, data) {
		for (let o of this.observers) {
			try {
				if (o.observe) {
					o.observe(subject, topic, data);
				}
				else {
					o(subject, topic, data);
				}
			}
			catch (ex) {
				log(LOG_ERROR, "memory pressure observer bailed, " + o, ex);
			}
		}
	}
});

obs.add(Observer, "memory-pressure", false);
unload(Observer.unload.bind(Observer));

Object.defineProperties(exports, {
	"add": {
		value: function add(obs) Observer.add(obs),
		enumerable: true
	},
	"remove": {
		value: function remove(obs) Observer.remove(obs),
		enumerable: true
	},
	"notify": {
		value: function notify() Observer.observe(null, "memory-pressure", "low-memory"),
		enumerable: true
	}
});
