/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";
/* global QUEUED */

const Prefs = require("preferences");
requireJoined(this, "constants");
const {ByteBucket} = require("./bytebucket");
const {filterInSitu, shuffle} = require("utils");
const obs = require("./observers");
const domainprefs = require("./domainprefs");

const TOPIC = 'DTA:serverlimits-changed';
const PREFS = 'extensions.dta.serverlimit.';
const LIMITS_PREF  = 'extensions.dta.serverlimit.limits.';

const SCHEDULER_DIR = 'dir';
const SCHEDULER_FAST = 'fast';
const SCHEDULER_FAIR = 'fair';
const SCHEDULER_RND = 'rnd';
const SCHEDULER_LEGACY = 'legacy';

let limits = new Map();

const CONNECTIONS = Symbol.for("conns");
const SPEED = Symbol.for("spd");
const SEGMENTS = Symbol.for("seg");
const CLEAN = Symbol.for("cleanRequest");

const LIMIT_PROTO = {
	c: Prefs.getExt("ntask", 2),
	s: -1,
	seg: 0,
	cr: false,
};
Object.freeze(LIMIT_PROTO);

class Limit {
	constructor(host, isNew) {
		this._host = host;
		this._isNew = isNew;
		try {
			this.connections = domainprefs.getHost(this._host, CONNECTIONS, null);
			if (!this.connections) {
				throw new Error("domain pref not available");
			}
			this.speed = domainprefs.getHost(this._host, SPEED, LIMIT_PROTO.s);
			this.segments = domainprefs.getHost(this._host, SEGMENTS, LIMIT_PROTO.seg);
			this.clean = domainprefs.getHost(this._host, CLEAN, LIMIT_PROTO.cr);
		}
		catch (oex) {
			try {
				let branch = LIMITS_PREF + this._host;
				let o = JSON.parse(Prefs.get(branch, ""));
				for (let p in LIMIT_PROTO) {
					if (!o.hasOwnProperty(p)) {
						o[p] = LIMIT_PROTO[p];
					}
				}
				this.connections = o.c;
				this.speed = o.s;
				this.segments = o.seg;
				this.clean = o.cr;
				this.save();
				Prefs.resetBranch(branch);
			}
			catch (ex) {
				this.connections = LIMIT_PROTO.c;
				this.speed = LIMIT_PROTO.s;
				this.segments = LIMIT_PROTO.seg;
				this.clean = LIMIT_PROTO.cr;
			}
		}
	}

	get host() {
		return this._host;
	}
	get isNew() {
		return this._isNew;
	}
	get connections() {
		return this._connections;
	}
	set connections(value) {
		if (!isFinite(value)) {
			throw new Error("Invalid Limit");
		}
		this._connections = value;
	}
	get speed() {
		return this._speed;
	}
	set speed(value) {
		if (!isFinite(value)) {
			throw new Error("Invalid Limit");
		}
		this._speed = value;
	}
	get segments() {
		return this._segments;
	}
	set segments(value) {
		if (!isFinite(value)) {
			throw new Error("Invalid Limit");
		}
		this._segments = value;
	}

	save() {
		limits.set(this._host, this);
		domainprefs.setHost(this._host, CONNECTIONS, this.connections);
		domainprefs.setHost(this._host, SPEED, this.speed);
		domainprefs.setHost(this._host, SEGMENTS, this.segments);
		domainprefs.setHost(this._host, CLEAN, this.clean);
		this._isNew = false;
	}

	remove() {
		limits.delete(this._host);
		domainprefs.deleteHost(this._host, CONNECTIONS);
		domainprefs.deleteHost(this._host, SPEED);
		domainprefs.deleteHost(this._host, SEGMENTS);
		domainprefs.deleteHost(this._host, CLEAN, this.clean);
		Prefs.reset(LIMITS_PREF + this._host);
	}

	toString() {
		return `[Limit(conn: ${this._connections}, spd: ${this._speed}, seg: ${this._segments}, cr:${this.clean})]`;
	}
}

const loadLimits = async function loadLimits() {
	await domainprefs.load();
	limits = new Map();
	let dp = Array.from(domainprefs.enumHosts()).filter(h => domainprefs.getHost(h, CONNECTIONS));
	let hosts = Prefs.getChildren(LIMITS_PREF).map(e => e.substr(LIMITS_PREF.length));
	log(LOG_DEBUG, "dp " + dp.join(", "));
	log(LOG_DEBUG, "hosts " + hosts.join(", "));
	hosts = Array.from((new Set(dp.concat(hosts))).values());
	hosts.sort();

	for (let host of hosts) {
		try {
			let limit = new Limit(host);
			limits.set(limit.host, limit);
			log(LOG_DEBUG, "loaded limit: " + limit);
		}
		catch (ex) {
			log(LOG_ERROR, "Failed to load: " + host, ex);
		}
	}
	obs.notify(null, TOPIC, null);
};

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
	if (limits.has(host)) {
		return limits.get(host);
	}
	return new Limit(host, true);
}

function listLimits() {
	return limits.entries();
}

function getLimitFor(d) {
	let host = d.urlManager.domain;
	return limits.get(host);
}

let globalConnections = -1;

class BaseScheduler {
	static _queuedFilter(e) {
		return e.state === QUEUED;
	}
	next() {
		for (let d; this._schedule.length;) {
			d = this._schedule.shift();
			if (d.state !== QUEUED) {
				continue;
			}
			return d;
		}
		return null;
	}

	destroy() {
		this._schedule.length = 0;
		delete this._schedule;
	}
}

// Legacy scheduler. Does not respect limits
// Basically Olegacy(1)
class LegacyScheduler extends BaseScheduler {
	constructor(downloads) {
		super();
		this._schedule = downloads.filter(BaseScheduler._queuedFilter);
	}
}
exports.LegacyScheduler = LegacyScheduler;

// Fast generator: Start downloads as in queue
class FastScheduler extends BaseScheduler {
	constructor(downloads, running) {
		super();
		this._downloads = [];
		for (let i = 0, e = downloads.length; i < e; ++i) {
			let d = downloads[i];
			if (d.state === QUEUED) {
				this._downloads.push(d);
			}
		}
		this._runCount = 0;
	}

	next(running) {
		if (!this._downloads.length) {
			return null;
		}

		let downloading = new Map();
		let i, e, d;

		if (this._runCount > 50) {
			filterInSitu(this._downloads, BaseScheduler._queuedFilter);
			this._runCount = 0;
		}

		// count running downloads per host
		for (let r of running) {
			if (r.totalSize && r.totalSize < 1024*1024) {
				continue;
			}
			let host = r.urlManager.domain;
			downloading.set(host, (downloading.get(host) || 0) + 1);
		}

		// calculate available slots
		// negative means: available, else not available;
		for (let [host, count] of downloading.entries()) {
			let limit = limits.get(host);
			if (limit) {
				i = limit.connections;
			}
			else {
				i = globalConnections;
			}
			if (i <= 0) {
				// no limit
				i = -1;
			}
			downloading.set(host, count - i);
		}

		for (i = 0, e = this._downloads.length; i < e; ++i) {
			let d = this._downloads[i];

			if (!d || d.state !== QUEUED) {
				continue;
			}
			let host = d.urlManager.domain;
			//log(LOG_ERROR, "fair check: " + host + " downloading:" + downloading.get(host, -1));

			// no running downloads for this host yet
			if (!downloading.has(host)) {
				this._runCount++;
				return d;
			}
			// free slot
			if (downloading.get(host) < 0) {
				this._runCount++;
				return d;
			}
		}
		return null;
	}

	destroy() {
		this._downloads.length = 0;
		delete this._downloads;
	}
}
exports.FastScheduler = FastScheduler;

// Fair Scheduler: evenly distribute slots
// Performs worse than FastScheduler but is more precise.
class FairScheduler extends BaseScheduler {
	constructor(downloads) {
		super();
		this._downloadSet = Object.create(null);

		// set up our internal state
		for (let i = 0, e = downloads.length, d, host; i < e; ++i) {
			d = downloads[i];
			if (d.state !== QUEUED) {
				continue;
			}
			host = d.urlManager.domain;
			if (!(host in this._downloadSet)) {
				this._downloadSet[host] = new FairScheduler.SchedItem(host);
			}
			this._downloadSet[host].push(d);
		}
	}

	next(running) {
		let i, e, d, host;

		// reset all counters
		for (i in this._downloadSet) {
			this._downloadSet[i].resetCounter();
		}

		// Count the running tasks
		for (let r of running) {
			if (r.totalSize && r.totalSize < 1024*1024) {
				continue;
			}
			host = r.urlManager.domain;
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
				if (d && d.state === QUEUED) {
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
	}

	destroy() {
		for (let k in this._downloadSet) {
			this._downloadSet[k].destroy();
			delete this._downloadSet[k];
		}
		this._downloadSet = null;
	}
}
FairScheduler.SchedItem = class {
	constructor(host) {
		this.host = host;
		this.limit = 0;
		let limit = limits.get(host);
		if (limit) {
			this.limit = limit.connections;
		}
		else {
			this.limit = globalConnections;
		}
		this.downloads = [];
		this.resetCounter();
	}

	get available() {
		return this.limit <= 0 || this.n < this.limit;
	}

	inc() {
		this.n++;
	}
	resetCounter() {
		return this.n = 0;
	}

	toString() {
		return this.host;
	}

	get length() {
		return this.downloads.length;
	}

	shift() {
		++this.n;
		return this.downloads.shift();
	}

	pop() {
		++this.n;
		return this.downloads.pop();
	}

	push(d) {
		return this.downloads.push(d);
	}
	destroy() {
		this.downloads.length = 0;
		delete this.downloads;
	}
};
exports.FairScheduler = FairScheduler;

// Fair Dir Scheduler: evenly distribute slots
class DirScheduler extends BaseScheduler {
	constructor(downloads) {
		super();
		this._downloadSet = Object.create(null);

		// set up our internal state
		for (let i = 0, e = downloads.length, d, dir; i < e; ++i) {
			d = downloads[i];
			if (d.state !== QUEUED) {
				continue;
			}
			dir = d.destinationPath;
			if (!(dir in this._downloadSet)) {
				this._downloadSet[dir] = new FairScheduler.SchedItem(dir);
			}
			this._downloadSet[dir].push(d);
		}
	}

	next(running) {
		let i, e, d, dir;

		// reset all counters
		for (i in this._downloadSet) {
			this._downloadSet[i].resetCounter();
		}

		// Count the running tasks
		for (let d of running) {
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
				if (d.state === QUEUED) {
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
	}
	destroy() {
		for (let k in this._downloadSet) {
			this._downloadSet[k].destroy();
			delete this._downloadSet[k];
		}
		this._downloadSet = null;
	}
}
exports.DirScheduler = DirScheduler;

//Random scheduler. Does not respect limits
class RndScheduler extends BaseScheduler {
	constructor(downloads, running) {
		super();
		this._schedule = downloads.filter(BaseScheduler._queuedFilter);
		shuffle(this._schedule);
	}
}
exports.RndScheduler = RndScheduler;

let Scheduler;
function loadScheduler() {
	switch (Prefs.getExt('serverlimit.connectionscheduler', SCHEDULER_FAST)) {
	case SCHEDULER_FAIR:
		Scheduler = FairScheduler;
		break;
	case SCHEDULER_RND:
		Scheduler = RndScheduler;
		break;
	case SCHEDULER_DIR:
		Scheduler = DirScheduler;
		break;
	case SCHEDULER_LEGACY:
		Scheduler = LegacyScheduler;
		break;
	default:
		Scheduler = FastScheduler;
		break;
	}
	log(LOG_INFO, "Using scheduler" + Scheduler.name);
}
function getConnectionScheduler(downloads) {
	return new Scheduler(downloads);
}

var buckets = Object.create(null);
var unlimitedBucket = new ByteBucket(-1, 1.0, "unlimited");
function loadServerBuckets() {
	for (let b in buckets) {
		if (limits.has(b)) {
			buckets[b].byteRate = limits.get(b).speed * 1024;
		}
		else {
			buckets[b].byteRate = -1;
		}
	}
}
function killServerBuckets() {
	buckets = Object.create(null);
}
function getServerBucket(d) {
	let host = d.urlManager.domain;
	if (host in buckets) {
		return buckets[host];
	}
	if (limits.has(host)) {
		return (buckets[host] = new ByteBucket(limits.get(host).speed * 1024, 1.2, host));
	}
	return unlimitedBucket;
}

// install our observer
const Observer = {
	unload: function() {
		killServerBuckets();
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
require("./observers").add(Observer, "DTA:domain-prefs");
unload(() => Observer.unload());
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
