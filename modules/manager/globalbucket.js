/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {addObserver, getExt} = require("preferences");
exports.GlobalBucket = new (require("support/bytebucket").ByteBucket)(getExt('speedlimit', -1), 1.3);
exports.GlobalBucket.Observer = {
	observe: function(s,t,d) {
		exports.GlobalBucket.byteRate = getExt("speedlimit", -1);
	}
};
addObserver("extensions.dta.speedlimit", exports.GlobalBucket.Observer);
