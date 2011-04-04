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
	'getScheduler',
	'getServerBucket',
	'killServerBuckets'
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const module = Components.utils.import;
const Exception = Components.Exception;

let Prefs = {};
module("resource://dta/preferences.jsm", Prefs);
module("resource://dta/utils.jsm");
module("resource://dta/constants.jsm");
module("resource://dta/support/bytebucket.jsm");

ServiceGetter(this, 'tlds', '@mozilla.org/network/effective-tld-service;1', 'nsIEffectiveTLDService');
ServiceGetter(this, 'fixups', '@mozilla.org/docshell/urifixup;1', 'nsIURIFixup');
ServiceGetter(this, 'obs', '@mozilla.org/observer-service;1', 'nsIObserverService');

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
if ('freeze' in Object) {
	Object.freeze(LIMIT_PROTO);
}

function Limit(host, isNew) {
	this._host = host;
	this._isNew = isNew;
	let o = LIMIT_PROTO;
	try {
		o = JSON.parse(Prefs.get(LIMITS_PREF + this._host, ""));
		o.prototype = LIMIT_PROTO;
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
	limits = {};
	let hosts = Prefs.getChildren(LIMITS_PREF).map(function(e) e.substr(LIMITS_PREF.length));
	hosts.sort();

	for each (let host in hosts) {
		try {
			let limit = new Limit(host);
			limits[limit.host] = limit;
			Debug.log("loaded limit: " + limit);
		}
		catch (ex) {
			Debug.log("Failed to load: " + host, ex);
		}
	}
	obs.notifyObservers(null, TOPIC, null);
}

function getEffectiveHost(url) {
	try {
		return tlds.getBaseDomain(url);
	}
	catch (ex) {
		return url.host;
	}
}

function addLimit(host) {
	host = getEffectiveHost(fixups.createFixupURI(host, 0x0));
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
function SchedItem(host) {
	this.host = host;
	this.limit = 0;
	if (host in limits) {
		this.limit = limits[host].connections;
	}
	else {
		this.limit = globalConnections;
	}
	this.n = 1;
	this.downloads = [];
};
SchedItem.prototype = {
	cmp: function(a, b)  a.n - b.n,
	get available() {
		return (this.limit <= 0 || this.n < this.limit);
	},
	get queued() {
		return (this.limit <= 0 || this.n < this.limit) && this.downloads.length != 0;
	},
	inc: function() ++this.n,
	pop: function() {
		++this.n;
		return this.downloads.shift();
	},
	push: function(d) this.downloads.push(d),
	toString: function() this.host
};

// Legacy scheduler. Does not respect limits
// Basically Olegacy(1)
function LegacyScheduler(downloads, running) {
	let i, e, d;
	for (i = 0, e = downloads.length; i < e; ++i) {
		d = downloads[i];
		if (!d.is(QUEUED)) {
			continue;
		}
		yield d;
	}
}

// Fast generator: Start downloads as in queue
// Ofast(running)
function FastScheduler(downloads, running) {
	let downloadSet = {};
	let i, e, d, host, item;
	for (i = 0, e = running.length; i < e; ++i) {
		d = running[i];
		host = d.urlManager.domain;
		if (!(host in downloadSet)) {
			downloadSet[host] = new SchedItem(host);
		}
		else {
			downloadSet[host].inc();
		}
	}

	for (i = 0, e = downloads.length; i < e; ++i) {
		d = downloads[i];
		if (!d.is(QUEUED)) {
			continue;
		}
		host = d.urlManager.domain;
		if (!(host in downloadSet)) {
			downloadSet[host] = new SchedItem(host);
			yield d;
			continue;
		}
		item = downloadSet[host];
		if (item.available) {
			yield d;
			item.inc();
		}
	}
}

// Fair Scheduler: evenly distribute slots
// Performs far worse than FastScheduler but is more precise.
// Oeven = O(running) + O(downloads) + O(downloadSet) + Osort(sorted)
function FairScheduler(downloads, running) {
	let downloadSet = {};
	let i, e, d, host, item;

	// Count the running tasks
	for (i = 0, e = running.length; i < e; ++i) {
		d = running[i];
		host = d.urlManager.domain;
		if (!(host in downloadSet)) {
			downloadSet[host] = new SchedItem(host);
		}
		else {
			downloadSet[host].inc();
		}
	}

	for (i = 0, e = downloads.length; i < e; ++i) {
		d = downloads[i];
		if (!d.is(QUEUED)) {
			continue;
		}
		host = d.urlManager.domain;
		if (!(host in downloadSet)) {
			downloadSet[host] = new SchedItem(host);
			yield d;
			continue;
		}
		downloadSet[host].push(d);
	}
	let sorted = [];
	for (let s in downloadSet) {
		let c = downloadSet[s];
		if (!c.available) {
			continue;
		}
		sorted.push(c);
	}
	sorted.sort(SchedItem.prototype.cmp);
	while (sorted.length) {
		// short-circuit: only one host left
		if (sorted.length == 1) {
			item = sorted.shift();
			while (item.queued) {
				yield item.pop();
			}
			return;
		}

		// round robin
		for (i = 0, e = sorted.length; i < e; ++i) {
			item = sorted[i];
			yield item.pop();
			if (!s.queued) {
				sorted.splice(i, 1);
				break;
			}
		}
	}
}

//Random scheduler. Does not respect limits
//Basically Ornd(1)
function RndScheduler(downloads, running) {
	let _d = [];
	let i, e, d;
	for (i = 0, e = downloads.length; i < e; ++i) {
		d = downloads[i];
		if (!d.is(QUEUED)) {
			continue;
		}
		_d.push(d);
	}
	RndScheduler.shuffle(_d);
	for (i = 0, e = _d.length; i < e; ++i) {
		yield _d[i];
	}
}
// Fisher-Yates based shuffle
RndScheduler.shuffle = function shuffle(a) {
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
	Debug.log("Using scheduler " + scheduler.name);
}
function getScheduler(downloads, running) {
	return scheduler(downloads, running);
}

var buckets = {};
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
	buckets = {};
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
			obs.removeObserver(this, SHUTDOWN_TOPIC);
			return;
		}

		globalConnections = Prefs.getExt("serverlimit.perserver", 4);
		loadLimits();
		loadServerBuckets();
		loadScheduler();
	}
}
Prefs.addObserver(PREFS, Observer);
obs.addObserver(Observer, SHUTDOWN_TOPIC, true);
Observer.observe();
