/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {filterInSitu} = require("utils");
const obs = require("./observers");

/**
 * Determines if a window is private
 */
let isWindowPrivate = function() { return false; };

/**
 * Determines if a channel is private
 */
let isChannelPrivate = function() { return false; };

try {
	let {PrivateBrowsingUtils} = requireJSM("resource://gre/modules/PrivateBrowsingUtils.jsm");
	if ("isWindowPrivate" in PrivateBrowsingUtils) {
		let iwp = PrivateBrowsingUtils.isWindowPrivate.bind(PrivateBrowsingUtils);
		if ("isContentWindowPrivate" in PrivateBrowsingUtils) {
			iwp = PrivateBrowsingUtils.isContentWindowPrivate.bind(PrivateBrowsingUtils);
		}
		isWindowPrivate = function(window) {
			try {
				return iwp(window);
			}
			catch (ex) {
				log(LOG_ERROR, "isWindowPrivate call failed, defaulting to false", ex);
			}
			return false;
		};
		isChannelPrivate = function(channel) {
			return (channel instanceof Ci.nsIPrivateBrowsingChannel) && channel.isChannelPrivate;
		};
	}
}
catch (ex) {
	log(LOG_DEBUG, "no PrivateBrowsingUtils");
}


const purgeObserver = {
	obsFns: [],
	observe: function(s, topic, d) {
		log(LOG_DEBUG, topic);
		for (let fn of this.obsFns) {
			try {
				fn();
			}
			catch (ex) {
				log(LOG_ERROR, "pbm purger threw", ex);
			}
		}
	}
};
obs.add(purgeObserver, "last-pb-context-exited");
unload(function removePurgeObserver() {
	purgeObserver.obsFns = [];
});

function registerPrivatePurger(fn) {
	purgeObserver.obsFns.push(fn);
}
function unregisterPrivatePurger(fn) {
	filterInSitu(purgeObserver.obsFns, e => e !== fn);
}

Object.defineProperties(exports, {
	isWindowPrivate: {value: isWindowPrivate, enumerable: true},
	isChannelPrivate: {value: isChannelPrivate, enumerable: true},
	registerPrivatePurger: {value: registerPrivatePurger, enumerable: true},
	unregisterPrivatePurger: {value: unregisterPrivatePurger, enumerable: true}
});
