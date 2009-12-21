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
	'getEffectiveHost'
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const module = Components.utils.import;
const Exception = Components.Exception;

let Prefs = {};
module("resource://dta/preferences.jsm", Prefs);
module("resource://dta/utils.jsm");

ServiceGetter(this, "Debug", "@downthemall.net/debug-service;1", "dtaIDebugService");
ServiceGetter(this, 'tlds', '@mozilla.org/network/effective-tld-service;1', 'nsIEffectiveTLDService');
ServiceGetter(this, 'fixups', '@mozilla.org/docshell/urifixup;1', 'nsIURIFixup');
ServiceGetter(this, 'obs', '@mozilla.org/observer-service;1', 'nsIObserverService');

const TOPIC = 'DTA:serverlimits-changed';
const PREFS = 'extensions.dta.serverlimit.';
const HOSTS_PREF  = 'extensions.dta.serverlimit.host.';
const CONNECTIONS_PREF  = 'extensions.dta.serverlimit.connections.';
const SPEEDS_PREF  = 'extensions.dta.serverlimit.speed.';

let limits = {};

function Limit(host, isNew) {
	this._host = host;
	this._isNew = isNew;
	this.enabled = Prefs.get(HOSTS_PREF + this._host, true);
	this.connections = Prefs.get(CONNECTIONS_PREF + this._host, 2);
	this.speed = Prefs.get(SPEEDS_PREF + this._host, 0);
}
Limit.prototype = {
	get host() { return this._host; },
	get isNew() { return this._isNew; },
	get enabled() { return this._enabled; },
	set enabled(value) {
		this._enabled = !!value;
	},
	get connections() { return this._connections; },
	set connections(value) {
		if (!isFinite(value) || value < 0) {
			throw new Exception("Invalid Limit");
		}
		this._connections = value;
	},
	get speed() { return this._speed; },
	set speed(value) {
		if (!isFinite(value) || value < 0) {
			throw new Exception("Invalid Limit");
		}
		this._speed = value;
	},	
	save: function() {
		Prefs.set(HOSTS_PREF + this._host, this._enabled);
		Prefs.set(CONNECTIONS_PREF + this._host, this._connections);
		Prefs.set(SPEEDS_PREF + this._host, this._speed);
		this._isNew = false;
	},
	remove: function() {
		Prefs.reset(HOSTS_PREF + this._host);
		Prefs.reset(CONNECTIONS_PREF + this._host);
		Prefs.reset(SPEEDS_PREF + this._host);
		delete this;
	},
	toString: function() this._host	+ " conn: " + this._connections + " speed: " + this._speed
}

function load() {
	limits = {};
	let hosts = Prefs.getChildren(HOSTS_PREF).map(function(e) e.substr(HOSTS_PREF.length));
	hosts.sort();
	
	for each (let host in hosts) {
		try {
			let limit = new Limit(host);
			limits[limit.host] = limit;
			Debug.logString("loaded limit: " + limit);
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

// first load the limits
load();

// install our pref-observer
const PrefObserver = {
	observe: function(topic, subject, data) {
		load();
	}
}
Prefs.addObserver(PREFS, PrefObserver);