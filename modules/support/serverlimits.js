/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const Prefs = require("preferences");
requireJoined(this, "constants");
const {ByteBucket} = require("support/bytebucket");
const {filterInSitu} = require("utils");
const obs = require("support/observers");

const TOPIC = 'DTA:serverlimits-changed';
const PREFS = 'extensions.dta.serverlimit.';
const LIMITS_PREF  = 'extensions.dta.serverlimit.limits.';

const SCHEDULER_DIR = 'dir';
const SCHEDULER_FAST = 'fast';
const SCHEDULER_FAIR = 'fair';
const SCHEDULER_RND = 'rnd';
const SCHEDULER_LEGACY = 'legacy';

let limits = {};

const LIMIT_PROTO = {
	c: 2,
	s: -1,
	seg: 0
};
Object.freeze(LIMIT_PROTO);

function Limit(host, isNew) {
	this._host = host;
	this._isNew = isNew;
	let o = LIMIT_PROTO;
	try {
		o = JSON.parse(Prefs.get(LIMITS_PREF + this._host, ""));
		for (let p in LIMIT_PROTO) {
			if (!o.hasOwnProperty(p)) {
				o[p] = LIMIT_PROTO[p];
			}
		}
	}
	catch (ex) {
		// no op;
	}
	this.connections = o.c;
	this.speed = o.s;
	this.segments = o.seg;
}
Limit.prototype = Object.freeze({
	get host() this._host,
	get isNew() this._isNew,
	get connections() this._connections,
	set connections(value) {
		if (!isFinite(value)) {
			throw new Exception("Invalid Limit");
		}
		this._connections = value;
	},
	get speed() this._speed,
	set speed(value) {
		if (!isFinite(value)) {
			throw new Exception("Invalid Limit");
		}
		this._speed = value;
	},
	get segments() this._segments,
	set segments(value) {
		if (!isFinite(value)) {
			throw new Exception("Invalid Limit");
		}
		this._segments = value;
	},
	save: function() {
		Prefs.set(LIMITS_PREF + this._host, JSON.stringify({c: this._connections, s: this._speed, seg: this._segments}));
		this._isNew = false;
	},
	remove: function() {
		Prefs.reset(LIMITS_PREF + this._host);
	},
	toString: (function() this._host
		+ " conn: " + this._connections
		+ " speed: " + this._speed
		+ " segments:" + this._segments)
});

function loadLimits() {
	limits = Object.create(null);
	let hosts = Prefs.getChildren(LIMITS_PREF).map(function(e) e.substr(LIMITS_PREF.length));
	hosts.sort();

	for (let host of hosts) {
		try {
			let limit = new Limit(host);
			limits[limit.host] = limit;
			log(LOG_DEBUG, "loaded limit: " + limit);
		}
		catch (ex) {
			log(LOG_ERROR, "Failed to load: " + host, ex);
		}
	}
	obs.notify(null, TOPIC, null);
}

function getEffectiveHost(url) {
	try {
		return Services.eTLD.getBaseDomain(url);
	}
	catch (ex) {
		return url.host;
	}
}

function addLimit(host) {
	host = getEffectiveHost(Services.fixups.createFixupURI(host, 0x0));
	if (host in limits) {
		return limits[host];
	}
	return new Limit(host, true);
}

function listLimits() {
	return limits;
}

function getLimitFor(d) {
	let host = d.urlManager.domain;
	if (host in limits) {
		return limits[host];
	}
	return null;
}


let globalConnections = -1;

function BaseScheduler() {}
BaseScheduler.prototype = Object.freeze({
	_queuedFilter: function(e) e.state == QUEUED,
	next: function() {
		for (let d; this._schedule.length;) {
			d = this._schedule.shift();
			if (d.state != QUEUED) {
				continue;
			}
			return d;
		}
		return null;
	},
	destroy: function() {
		this._schedule.length = 0;
		delete this._schedule;
	}
});
Object.freeze(BaseScheduler);

// Legacy scheduler. Does not respect limits
// Basically Olegacy(1)
function LegacyScheduler(downloads) {
	this._schedule = downloads.filter(this._queuedFilter);
}
LegacyScheduler.prototype = BaseScheduler.prototype;
Object.freeze(LegacyScheduler);

// Fast generator: Start downloads as in queue
function FastScheduler(downloads, running) {
	this._downloads = [];
	for (let i = 0, e = downloads.length; i < e; ++i) {
		let d = downloads[i];
		if (d.state == QUEUED) {
			this._downloads.push(d);
		}
	}
	this._runCount = 0;
	//this._downloads = downloads.filter(this._queuedFilter);
}
FastScheduler.prototype = Object.freeze({
	__proto__: BaseScheduler.prototype,
	next: function(running) {
		if (!this._downloads.length) {
			return null;
		}

		let downloadSet = Object.create(null);
		let i, e, d, host;

		if (this._runCount > 50) {
			filterInSitu(this._downloads, this._queuedFilter);
			this._runCount = 0;
		}

		// count running downloads per host
		for (i = 0, e = running.length; i < e; ++i) {
			host = running[i].urlManager.domain;
			downloadSet[host] = ++downloadSet[host] || 1;
		}

		// calculate available slots
		// negative means: available, else not available;
		for (host in downloadSet) {
			if (host in limits) {
				i = limits[host].connections;
			}
			else {
				i = globalConnections;
			}
			if (i <= 0) {
				// no limit
				downloadSet[host] = -1;
			}
			else {
				downloadSet[host] -= i;
			}
		}

		for (i = 0, e = this._downloads.length; i < e; ++i) {
			d = this._downloads[i];

			if (!d || d.state != QUEUED) {
				continue;
			}
			host = d.urlManager.domain;

			// no running downloads for this host yet
			if (!(host in downloadSet)) {
				this._runCount++;
				return d;
			}

			if (downloadSet[host] < 0) {
				this._runCount++;
				return d;
			}
		}
		return null;
	},
	destroy: function() {
		this._downloads.length = 0;
		delete this._downloads;
	}
});
Object.freeze(FastScheduler);

// Fair Scheduler: evenly distribute slots
// Performs worse than FastScheduler but is more precise.
function FairScheduler(downloads) {
	this._downloadSet = Object.create(null);

	// set up our internal state
	for (let i = 0, e = downloads.length, d, host; i < e; ++i) {
		d = downloads[i];
		if (d.state != QUEUED) {
			continue;
		}
		host = d.urlManager.domain;
		if (!(host in this._downloadSet)) {
			this._downloadSet[host] = new FairScheduler.SchedItem(host);
		}
		this._downloadSet[host].push(d);
	}
}
FairScheduler.prototype = Object.freeze({
	__proto__: BaseScheduler.prototype,

	next: function(running) {
		let i, e, d, host;

		// reset all counters
		for (i in this._downloadSet) {
			this._downloadSet[i].resetCounter();
		}

		// Count the running tasks
		for (i = 0, e = running.length; i < e; ++i) {
			d = running[i];
			host = d.urlManager.domain;
			if (!(host in this._downloadSet)) {
				// we don't care, because we don't have any more queued downloads for this host
				continue;
			}
			this._downloadSet[host].inc();
		}

		// Find the host with the least running downloads that still has slots available
		e = null;
		for (i in this._downloadSet) {
			d = this._downloadSet[i];
			if ((!e || e.n > d.n) && d.available) {
				e = d;
			}
		}

		// found an item?
		if (e) {
			while (e.length) {
				d = e.shift();
				if (d && d.state == QUEUED) {
					break;
				}
				d = null;
			}
			// host queue is now empty, hence remove
			if (!e.length) {
				delete this._downloadSet[e.host];
			}
			return d;
		}
		return null;
	},
	destroy: function() {
		for (let k in this._downloadSet) {
			this._downloadSet[k].destroy();
			delete this._downloadSet[k];
		}
		this._downloadSet = null;
	}
});
FairScheduler.SchedItem = function(host) {
	this.host = host;
	this.limit = 0;
	if (host in limits) {
		this.limit = limits[host].connections;
	}
	else {
		this.limit = globalConnections;
	}
	this.downloads = [];
	this.resetCounter();
};
FairScheduler.SchedItem.prototype = Object.freeze({
	get available() (this.limit <= 0 || this.n < this.limit),
	inc: function() { this.n++; },
	resetCounter: function() this.n = 0,
	toString: function() this.host,
	get length() this.downloads.length,
	shift: function() {
		++this.n;
		return this.downloads.shift();
	},
	pop: function() {
		++this.n;
		return this.downloads.pop();
	},
	push: function(d) this.downloads.push(d),
	destroy: function() {
		this.downloads.length = 0;
		delete this.downloads;
	}
});
Object.freeze(FairScheduler);

// Fair Dir Scheduler: evenly distribute slots
function DirScheduler(downloads) {
	this._downloadSet = Object.create(null);

	// set up our internal state
	for (let i = 0, e = downloads.length, d, dir; i < e; ++i) {
		d = downloads[i];
		if (d.state != QUEUED) {
			continue;
		}
		dir = d.destinationPath;
		if (!(dir in this._downloadSet)) {
			this._downloadSet[dir] = new FairScheduler.SchedItem(dir);
		}
		this._downloadSet[dir].push(d);
	}
}
DirScheduler.prototype = Object.freeze({
	__proto__: BaseScheduler.prototype,

	next: function(running) {
		let i, e, d, dir;

		// reset all counters
		for (i in this._downloadSet) {
			this._downloadSet[i].resetCounter();
		}

		// Count the running tasks
		for (i = 0, e = running.length; i < e; ++i) {
			d = running[i];
			dir = d.destinationPath;
			if (!(dir in this._downloadSet)) {
				// we don't care, because we don't have any more queued downloads for this directory
				continue;
			}
			this._downloadSet[dir].inc();
		}

		// Find the host with the least running downloads that still has slots available
		e = null;
		for (i in this._downloadSet) {
			d = this._downloadSet[i];
			if ((!e || e.n > d.n) && d.available) {
				e = d;
			}
		}

		// found an item?
		if (e) {
			while (e.length) {
				d = e.pop();
				if (d.state == QUEUED) {
					break;
				}
				d = null;
			}
			// host queue is now empty, hence remove
			if (!e.length) {
				delete this._downloadSet[e.host];
			}
			return d;
		}
		return null;
	},
	destroy: FairScheduler.prototype.destroy,
});
Object.freeze(DirScheduler);

//Random scheduler. Does not respect limits
function RndScheduler(downloads, running) {
	this._schedule = downloads.filter(this._queuedFilter);
	this.shuffle(this._schedule);
}
// Fisher-Yates based shuffle
RndScheduler.prototype = Object.freeze({
	__proto__: BaseScheduler.prototype,
	shuffle: function shuffle(a) {
		let c, e = a.length;
		if (e < 4) {
			// no need to shuffle for such small sets
			return;
		}
		while (e > 1) {
			c = Math.floor(Math.random() * (e--));
			// swap
			[a[e], a[c]] = [a[c], a[e]];
		}
	}
});
Object.freeze(RndScheduler);

let scheduler;
function loadScheduler() {
	switch (Prefs.getExt('serverlimit.connectionscheduler', SCHEDULER_FAST)) {
	case SCHEDULER_FAIR:
		scheduler = FairScheduler;
		break;
	case SCHEDULER_RND:
		scheduler = RndScheduler;
		break;
	case SCHEDULER_DIR:
		scheduler = DirScheduler;
		break;
	case SCHEDULER_LEGACY:
		scheduler = LegacyScheduler;
		break;
	default:
		scheduler = FastScheduler;
		break;
	}
	log(LOG_INFO, "Using scheduler" + scheduler.name);
}
function getConnectionScheduler(downloads) {
	return new scheduler(downloads);
}

var buckets = Object.create(null);
var unlimitedBucket = new ByteBucket(-1);
function loadServerBuckets() {
	for (let b in buckets) {
		if (b in limits) {
			buckets[b].byteRate = limits[b].speed * 1024;
		}
		else {
			buckets[b].byteRate = -1;
		}
	}
}
function killServerBuckets() {
	for (let [,bucket] in Iterator(buckets)) {
		bucket.kill();
	}
	buckets = Object.create(null);
}
function getServerBucket(d) {
	let host = d.urlManager.domain;
	if (host in buckets) {
		return buckets[host];
	}
	if (host in limits) {
		return (buckets[host] = new ByteBucket(limits[host].speed * 1024, 1.2));
	}
	return unlimitedBucket;
}

// install our observer
const Observer = {
	unload: function() {
		killServerBuckets();
		unlimitedBucket.kill();
		unlimitedBucket = null;
	},
	observe: function(topic, subject, data) {
		globalConnections = Prefs.getExt("serverlimit.perserver", 4);
		loadLimits();
		loadServerBuckets();
		loadScheduler();
	}
};
Prefs.addObserver(PREFS, Observer);
unload(function() Observer.unload());
Observer.observe();

Object.defineProperties(exports, {
	"Limit": {value: Limit, enumerable: true},
	"addLimit": {value: addLimit, enumerable: true},
	"listLimits": {value: listLimits, enumerable: true},
	"getLimitFor": {value: getLimitFor, enumerable: true},
	"getEffectiveHost": {value: getEffectiveHost, enumerable: true},
	"getConnectionScheduler": {value: getConnectionScheduler, enumerable: true},
	"getServerBucket": {value: getServerBucket, enumerable: true},
	"killServerBuckets": {value: killServerBuckets, enumerable: true},
});
