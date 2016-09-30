/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {addObserver, getExt} = require("preferences");
const {ByteBucket} = require("support/bytebucket");
exports.GlobalBucket = new ByteBucket(getExt('speedlimit', -1), 1.2, "global");
exports.GlobalBucket.Observer = {
	observe: function(s,t,d) {
		let limit = getExt("speedlimit", -1);
		exports.GlobalBucket.byteRate = limit;
		log(LOG_DEBUG, "new global speed limit " + limit + " " + exports.GlobalBucket.byteRate);
	}
};
addObserver("extensions.dta.speedlimit", exports.GlobalBucket.Observer);
