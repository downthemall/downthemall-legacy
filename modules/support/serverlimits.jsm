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
 * The Original Code is DownThemAll! ServerLimits module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developers are Copyright (C) 2009
 * the Initial Developers. All Rights Reserved.
 *
 * Contributor(s):
 *    Nils Maier <MaierMan@web.de>
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

var EXPORTED_SYMBOLS = [
	'Limit',
	'addLimit',
	'listLimits',
	'getLimitFor',
	'getEffectiveHost',
	'getConnectionScheduler',
	'getServerBucket',
	'killServerBuckets'
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const module = Components.utils.import;
const Exception = Components.Exception;

let Prefs = {};
module("resource://dta/glue.jsm");
module("resource://dta/preferences.jsm", Prefs);
module("resource://dta/utils.jsm");
module("resource://dta/constants.jsm");
module("resource://dta/support/bytebucket.jsm");

const TOPIC = 'DTA:serverlimits-changed';
const PREFS = 'extensions.dta.serverlimit.';
const LIMITS_PREF  = 'extensions.dta.serverlimit.limits.';
const SHUTDOWN_TOPIC = 'profile-change-teardown';

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
Limit.prototype = {
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
	toString: function() this._host
		+ " conn: " + this._connections
		+ " speed: " + this._speed
		+ " segments:" + this._segments
}

function loadLimits() {
	limits = Object.create(null);
	let hosts = Prefs.getChildren(LIMITS_PREF).map(function(e) e.substr(LIMITS_PREF.length));
	hosts.sort();

	for each (let host in hosts) {
		try {
			let limit = new Limit(host);
			limits[limit.host] = limit;
			if (Logger.enabled) {
				Logger.log("loaded limit: " + limit);
			}
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("Failed to load: " + host, ex);
			}
		}
	}
	Services.obs.notifyObservers(null, TOPIC, null);
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
BaseScheduler.prototype = {
	_queuedFilter: function(e) e.is(QUEUED),
	next: function() {
		for (let d; this._schedule.length;) {
			d = this._schedule.shift();
			if (!d.is(QUEUED)) {
				continue;
			}
			return d;
		}
		return null;
	}
};

// Legacy scheduler. Does not respect limits
// Basically Olegacy(1)
function LegacyScheduler(downloads) {
	this._schedule = downloads.filter(this._queuedFilter);
}
LegacyScheduler.prototype = {
	__proto__: BaseScheduler.prototype
};

// Fast generator: Start downloads as in queue
function FastScheduler(downloads, running) {
	this._downloads = downloads.filter(this._queuedFilter);
}
FastScheduler.prototype = {
	__proto__: BaseScheduler.prototype,

	_runCount: 0,
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

			if (d._state != QUEUED) {
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
	}
};

// Fair Scheduler: evenly distribute slots
// Performs worse than FastScheduler but is more precise.
function FairScheduler(downloads) {
	this._downloadSet = Object.create(null);

	// set up our internal state
	for (let i = 0, e = downloads.length, d, host; i < e; ++i) {
		d = downloads[i];
		if (!d.is(QUEUED)) {
			continue;
		}
		host = d.urlManager.domain;
		if (!(host in this._downloadSet)) {
			this._downloadSet[host] = new FairScheduler.SchedItem(host);
		}
		this._downloadSet[host].push(d);
	}
}
FairScheduler.prototype = {
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
				d = e.pop();
				if (d._state == QUEUED) {
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
};
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
FairScheduler.SchedItem.prototype = {
	get available() (this.limit <= 0 || this.n < this.limit),
	inc: function() { this.n++; },
	resetCounter: function() this.n = 0,
	toString: function() this.host,
	get length() this.downloads.length,
	pop: function() {
		++this.n;
		return this.downloads.shift();
	},
	push: function(d) this.downloads.push(d),
};

//Random scheduler. Does not respect limits
function RndScheduler(downloads, running) {
	this._schedule = downloads.filter(this._queuedFilter);
	this.shuffle(this._schedule);
}
// Fisher-Yates based shuffle
RndScheduler.prototype = {
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
};

let scheduler;
function loadScheduler() {
	switch (Prefs.getExt('serverlimit.connectionscheduler', SCHEDULER_FAST)) {
	case SCHEDULER_FAIR:
		scheduler = FairScheduler;
		break;
	case SCHEDULER_RND:
		scheduler = RndScheduler;
		break;
	case SCHEDULER_LEGACY:
		scheduler = LegacyScheduler;
		break;
	default:
		scheduler = FastScheduler;
		break;
	}
	if (Logger.enabled) {
		Logger.log("Using scheduler " + scheduler.name);
	}
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
	for each (let bucket in buckets) {
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
	observe: function(topic, subject, data) {
		if (topic == SHUTDOWN_TOPIC) {
			try {
				killServerBuckets();
				unlimitedBucket.kill();
				unlimitedBucket = null;
			}
			catch (ex) {
				// nothing we can do
			}
			Services.obs.removeObserver(this, SHUTDOWN_TOPIC);
			return;
		}

		globalConnections = Prefs.getExt("serverlimit.perserver", 4);
		loadLimits();
		loadServerBuckets();
		loadScheduler();
	}
}
Prefs.addObserver(PREFS, Observer);
Services.obs.addObserver(Observer, SHUTDOWN_TOPIC, true);
Observer.observe();
