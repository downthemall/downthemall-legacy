/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const {MimeQuality} = require("utils");
const Preferences = require("preferences");
const {isWindowPrivate} = require("support/pbm");
const Mediator = require("support/mediator");
const Histories = require("support/historymanager");

lazy(this, "FilterManager", function() require("support/filtermanager").FilterManager);

function _decodeCharset(text, charset) {
	let rv = text;
	try {
		if (!charset.length) {
			throw 'no charset';
		}
		rv = Services.ttsu.unEscapeURIForUI(charset || "UTF-8", text);
	}
	catch (ex) {
		try {
			rv = decodeURIComponent(text);
		}
		catch (ex) {
			log(LOG_INFO, "decodeCharset: failed to decode: " + text, ex);
		}
	}
	return rv;
}
function URL(url, preference, _fast) {
	this.preference = preference || 100;

	if (!(url instanceof Ci.nsIURL)) {
		throw new Exception("You must pass a nsIURL");
	}
	if (!_fast && URL.schemes.indexOf(url.scheme) == -1) {
		throw new Exception("Not a supported URL");
	}

	this._url = url.clone();
	this._urlCharset = url.originCharset;
	if (!_fast) {
		let hash = exports.getLinkPrintHash(this._url);
		this._url.ref = '';
		if (hash) {
			this.hash = hash;
		}
	}
	this._urlSpec = this._url.spec;
	this._usable = _decodeCharset(this._urlSpec, this._urlCharset);
};
URL.schemes = ['http', 'https', 'ftp'];
URL.prototype = Object.freeze({
	get url() {
		return this._url;
	},
	get usable() {
		return this._usable;
	},
	toJSON: function() {
		return 	{
			url: this._urlSpec,
			charset: this._urlCharset,
			preference: this.preference
		};
	},
	toString: function() this._usable
});
exports.URL = Object.freeze(URL);

/**
 * Checks if a provided strip has the correct hash format Supported are: md5,
 * sha1, sha256, sha384, sha512
 *
 * @param hash
 *          Hash to check
 * @return hash type or null
 */
const SUPPORTED_HASHES = Object.freeze({
	'MD5': {l: 32, q: 0.3 },
	'SHA1': {l: 40, q: 0.4 },
	'SHA256': {l: 64, q: 1 },
	'SHA384': {l: 96, q: 0.8 },
	'SHA512': {l: 128, q: 1 }
});
exports.SUPPORTED_HASHES = Object.freeze(SUPPORTED_HASHES);
const SUPPORTED_HASHES_ALIASES = Object.freeze({
	'MD5': 'MD5',
	'MD-5': 'MD5',
	'SHA1': 'SHA1',
	'SHA': 'SHA1',
	'SHA-1': 'SHA1',
	'SHA256': 'SHA256',
	'SHA-256': 'SHA256',
	'SHA384': 'SHA384',
	'SHA-384': 'SHA384',
	'SHA512': 'SHA512',
	'SHA-512': 'SHA512'
});
exports.SUPPORTED_HASHES_ALIASES = Object.freeze(SUPPORTED_HASHES_ALIASES);
exports.WANT_DIGEST_STRING = (function() {
	let rv = new MimeQuality();
	for (let h of ["MD5", "SHA", "SHA1", "SHA256", "SHA512"]) {
		let q = SUPPORTED_HASHES[SUPPORTED_HASHES_ALIASES[h]].q;
		rv.add(h, q);
	}
	return rv.toString();
})();

function Hash(hash, type) {
	if (typeof(hash) != 'string' && !(hash instanceof String)) {
		throw new Exception("hash is invalid");
	}
	if (typeof(type) != 'string' && !(type instanceof String)) {
		throw new Exception("hashtype is invalid");
	}

	type = type.toUpperCase().replace(/[\s-]/g, '');
	if (!(type in SUPPORTED_HASHES_ALIASES)) {
		throw new Exception("hashtype is invalid: " + type);
	}
	this.type = SUPPORTED_HASHES_ALIASES[type];
	this.sum = hash.toLowerCase().replace(/\s/g, '');
	let h = SUPPORTED_HASHES[this.type];
	if (h.l != this.sum.length || isNaN(parseInt(this.sum, 16))) {
		throw new Exception("hash is invalid");
	}
	this._q = h.q;
}
Hash.prototype = Object.freeze({
	get q() {
		return this._q;
	},
	toString: function() {
		return this.type + " [" + this.sum + "]";
	},
	toJSON: function() {
		return {
			type: this.type,
			sum: this.sum
		};
	}
});
exports.Hash = Object.freeze(Hash);

/**
 * Collection of hashes (checksums) about a single download
 * @param fullHash Full hash covering the whole download
 */
function HashCollection(fullHash) {
	if (!(fullHash instanceof Hash)) {
		throw new Exception("Cannot init empty HashCollection");
	}
	this.full = fullHash;
	this.partials = [];
	this._serialize();
}
/**
 * Load HashCollection from a serialized object
 * (Static)
 * @see serialize
 * @param obj (object) Serialized object
 */
HashCollection.load = function(obj) {
	let rv = new HashCollection(new Hash(obj.full.sum, obj.full.type));
	rv.parLength = obj.parLength ? obj.parLength : 0;
	rv.partials = obj.partials.map(function(e) new Hash(e.sum, e.type));
	rv._serialize();
	return rv;
},

HashCollection.prototype = Object.freeze({
	/**
	 * Iterator over all partial hashes
	 * Gives {hash,start,end} dict
	 */
	__iterator__: function() {
		for (let partial of this._partials) {
			yield partial;
		}
	},

	/**
	 * HashCollection has parital hashes
	 */
	get hasPartials() { return !!this.partials.length; },
	add: function(hash) {
		if (!(hash instanceof Hash)) {
			throw Exception("Must supply hash");
		}
		this.partials.push(hash);
		this._serialize();
	},
	/**
	 * Serializes HashCollection
	 * @return (object) Serialized HashCollection
	 */
	toJSON: function() this._serialized,
	_serialize: function() {
		this._serialized = {
			full: this.full,
			parLength: this.parLength,
			partials: this.partials
		};
	}
});
exports.HashCollection = Object.freeze(HashCollection);

const _rglph = /^hash\((md5|sha(?:-?(?:1|256|384|512))?):([\da-f]+)\)$/i;
/**
 * Get a link-fingerprint hash from an url (or just the hash component)
 *
 * @param url.
 *          Either String or nsIURI
 * @return Valid hash string or null
 */
exports.getLinkPrintHash = function getLinkPrintHash(url) {
	if (!(url instanceof Ci.nsIURL)) {
		return null;
	}
	var lp = url.ref.match(_rglph);
	if (lp) {
		try {
			return new Hash(lp[2], lp[1]);
		}
		catch (ex) {
			// pass down
		}
	}
	return null;
}

/**
 * Get a link-fingerprint metalink from an url (or just the hash component
 *
 * @param url.
 *          Either String or nsIURI
 * @param charset.
 *          Optional. Charset of the orgin link and link to be created
 * @return Valid hash string or null
 */
exports.getLinkPrintMetalink = function getLinkPrintMetalink(url) {
	if (!(url instanceof Components.interfaces.nsIURL)) {
		return null;
	}
	let lp = url.ref.match(/^!meta(?:link)?(?:3|4)!(.+)$/);
	if (lp) {
		let rv = lp[1];
		try {
			return new URL(Services.io.newURI(rv, url.originCharset, url)).url;
		}
		catch (ex) {
			// not a valid link, ignore it.
		}
	}
	return null;
}

exports.getProfileFile = (function() {
	let _profile = Services.dirsvc.get("ProfD", Ci.nsIFile);
	return function getProfileFile(fileName) {
		var file = _profile.clone();
		file.append(fileName);
		return file;
	};
})();


exports.composeURL = function composeURL(doc, rel) {
	// find <base href>
	let base = doc.location.href;
	let bases = doc.getElementsByTagName('base');
	for (var i = 0; i < bases.length; ++i) {
		if (bases[i].hasAttribute('href')) {
			base = bases[i].getAttribute('href');
			break;
		}
	}
	return Services.io.newURI(rel, doc.characterSet, Services.io.newURI(base, doc.characterSet, null));
}

exports.getRef = function getRef(doc) {
	try {
		log(LOG_DEBUG, "getting ref for" + doc.URL);
		return (new URL(Services.io.newURI(doc.URL, doc.characterSet, null))).url.spec;
	}
	catch (ex) {
		let b = doc.getElementsByTagName('base');
		for (let i = 0; i < b.length; ++i) {
			if (!b[i].hasAttribute('href')) {
				continue;
			}
			try {
				return exports.composeURL(doc, b[i].getAttribute('href')).spec;
			}
			catch (ex) {
				continue;
			}
		}
	}
}

exports.getDropDownValue = function getDropDownValue(name, isPrivate) {
	let values = Histories.getHistory(name, isPrivate).values;
	return values.length ? values[0] : '';
}

exports.setPrivateMode = function setPrivateMode(window, items) {
	const ip = isWindowPrivate(window);
	for (let i of items) {
		i.isPrivate = ip;
	}
	return items;
};

exports.saveSingleItem = function saveSingleItem(window, turbo, item) {
	if (turbo) {
		exports.turboSendLinksToManager(window, [item]);
		return;
	}

	// else open addurl.xul
	window = window || Mediator.getMostRecent();
	window.openDialog(
		"chrome://dta/content/dta/addurl.xul",
		"_blank",
		"chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no",
		item
	);
}

exports.sendLinksToManager = function sendLinksToManager(window, start, links) {
	exports.openManager(window, false, function(win) {
		win.startDownloads(start, links);
	});
}

function somePrivate(e) e.isPrivate;

exports.turboSendLinksToManager = function turboSendLinksToManager(window, urlsArray) {
	let isPrivate = urlsArray.some(somePrivate);
	let dir = exports.getDropDownValue('directory', isPrivate);
	let mask = exports.getDropDownValue('renaming', isPrivate);

	if (!mask || !dir) {
		throw new Exception("missing required information");
	}

	let num = null;

	for (let u of urlsArray) {
		u.mask = mask;
		u.dirSave = dir;
		u.numIstance = u.numIstance || (num === null ? num = exports.incrementSeries() : num);
	}

	exports.sendLinksToManager(window, !Preferences.getExt("lastqueued", false), urlsArray);
}

exports.saveLinkArray = function saveLinkArray(window, urls, images, error) {
	if (urls.length == 0 && images.length == 0) {
		throw new Exception("no links");
	}
	window = window || Mediator.getMostRecent();
	window.openDialog(
		"chrome://dta/content/dta/select.xul",
		"_blank",
		"chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no",
		urls,
		images,
		error
	);
}

exports.turboSaveLinkArray = function turboSaveLinkArray(window, urls, images) {
	if (urls.length == 0 && images.length == 0) {
		throw new Exception("no links");
	}
	log(LOG_INFO, "turboSaveLinkArray(): DtaOneClick filtering started");

	let links;
	let type;
	if (Preferences.getExt("seltab", 0)) {
		links = images;
		type = 2;
	}
	else {
		links = urls;
		type = 1;
	}

	let fast = null;
	let isPrivate = urls.some(somePrivate) || images.some(somePrivate);
	try {
		fast = FilterManager.getTmpFromString(exports.getDropDownValue('filter', isPrivate));
	}
	catch (ex) {
		// fall-through
	}
	links = links.filter(
		function(link) {
			if (fast && (fast.match(link.url.usable) || fast.match(link.description))) {
				return true;
			}
			return FilterManager.matchActive(link.url.usable, type);
		}
	);

	log(LOG_INFO, "turboSaveLinkArray(): DtaOneClick has filtered " + links.length + " URLs");

	if (links.length == 0) {
		throw new Exception('no links remaining');
	}
	this.turboSendLinksToManager(window, links);
	return links.length > 1 ? links.length : links[0];
}

var isManagerPending = false;
var managerRequests = [];
function openManagerCallback(event) {
	log(LOG_DEBUG, "manager ready; pushing queued items");
	event.target.removeEventListener("DTA:dieEarly", openManagerDiedCallback, true);
	event.target.removeEventListener("DTA:ready", openManagerCallback, true);
	for (let cb of managerRequests) {
		cb(event.target);
	}
	managerRequests.length = 0;
	isManagerPending = false;
}
function openManagerDiedCallback(event) {
	event.target.removeEventListener("DTA:dieEarly", openManagerDiedCallback, true);
	event.target.removeEventListener("DTA:ready", openManagerCallback, true);
	log(LOG_ERROR, "manager died early");
	isManagerPending = false;
	if (managerRequests.length) {
		log(LOG_ERROR, "manager died early, but pending requests; reopen");
		exports.openManager();
	}
}

exports.openManager = function openManager(window, quiet, cb) {
	try {
		if (isManagerPending) {
			if (cb) {
				managerRequests.push(cb);
			}
			log(LOG_DEBUG, "manager already pending; queuing");
			return;
		}

		let win = Mediator.getMostRecent('DTA:Manager');
		if (win) {
			log(LOG_DEBUG, "manager already open; direct");
			if (!cb && !quiet) {
				win.focus();
			}
			else if (cb) {
				cb(win);
			}
			return;
		}

		log(LOG_DEBUG, "manager not open yet; queueing");
		window = window || Mediator.getMostRecent();
		win = window.openDialog(
			"chrome://dta/content/dta/manager.xul",
			"_blank",
			"chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no",
			!!cb
		);
		if (cb) {
			managerRequests.push(cb);
		}
		isManagerPending = true;
		win.addEventListener("DTA:diedEarly", openManagerDiedCallback, true);
		win.addEventListener("DTA:ready", openManagerCallback, true);
	}
	catch(ex) {
		log(LOG_ERROR, "openManager():", ex);
	}
	return null;
};

const Series = {
	_session: 1,
	_persist: true,
	get value() {
		return this._persist ? Preferences.getExt("counter", 1) : this._session;
	},
	set value(nv) {
		this._persist ? Preferences.setExt("counter", nv) : (this._session = nv);
	},
	increment: function() {
		let rv = this.value;
		let store = rv;
		if (++store > 999) {
			store = 1;
		}
		this.value = store;
		return rv;
	}
};

exports.currentSeries = function currentSeries() Series.value;
exports.incrementSeries = function incrementSeries() Series.increment();
