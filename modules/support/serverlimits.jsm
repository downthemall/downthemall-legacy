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

var EXPORTED_SYMBOLS = [
	'addLimit',
	'Limit',
	'listLimits',
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
module("resource://dta/json.jsm");
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

function Limit(host, isNew) {
	this._host = host;
	this._isNew = isNew;
	this._connections = 2;
	this._speed = -1;
	try {
		let o = parse(Prefs.get(LIMITS_PREF + this._host, ""));
		this.connections = o.c;
		this.speed = o.s;
	}
	catch (ex) {
		// no op;
	}
}
Limit.prototype = {
	get host() { return this._host; },
	get isNew() { return this._isNew; },
	get connections() { return this._connections; },
	set connections(value) {
		if (!isFinite(value)) {
			throw new Exception("Invalid Limit");
		}
		this._connections = value;
	},
	get speed() { return this._speed; },
	set speed(value) {
		if (!isFinite(value)) {
			throw new Exception("Invalid Limit");
		}
		this._speed = value;
	},	
	save: function() {
		Prefs.set(LIMITS_PREF + this._host, stringify({c: this._connections, s: this._speed}));
		this._isNew = false;
	},
	remove: function() {
		Prefs.reset(LIMITS_PREF + this._host);
		delete this;
	},
	toString: function() this._host	+ " conn: " + this._connections + " speed: " + this._speed
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
			Debug.log("Failed to load: " + limit, ex);
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
	for (let d in downloads) {
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
	for each (let d in running) {
		let host = d.urlManager.domain;
		let knownHost = (host in downloadSet);
		if (!knownHost) {
			downloadSet[host] = new SchedItem(host);
		}
		else {
			downloadSet[host].inc();
		}
	}		
	for (let d in downloads) {
		if (!d.is(QUEUED)) {
			continue;
		}
		const host = d.urlManager.domain;
		const knownHost = (host in downloadSet);
		if (!knownHost) {
			downloadSet[host] = new SchedItem(host);
			yield d;
			continue;
		}
		let item = downloadSet[host];
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
	
	// Count the running tasks
	for each (let d in running) {
		let host = d.urlManager.domain;
		if (!(host in downloadSet)) {
			downloadSet[host] = new SchedItem(host);
		}
		else {
			downloadSet[host].inc();
		}
	}

	for (let d in downloads) {
		if (!d.is(QUEUED)) {
			continue;
		}
		let host = d.urlManager.domain;
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
			let s = sorted.shift();
			while (s.queued) {
				yield s.pop();
			} 		
			return;
		}

		// round robin		
		for (let i = 0, e = sorted.length; i < e; ++i) {
			let s = sorted[i];
			yield s.pop();
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
	function rndOrd() 0.5 - Math.random();
	let _d = [];
	for (let d in downloads) {
		if (!d.is(QUEUED)) {
			continue;
		}
		_d.push(d);
	}
	_d.sort(rndOrd);
	for each (let d in _d) {
		yield d;
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
				delete unlimitedBucket; 
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
