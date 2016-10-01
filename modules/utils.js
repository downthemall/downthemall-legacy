/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const Prefs = require("preferences");
const {toURI} = require("support/stringfuncs");
const {identity} = require("support/memoize");
const {OS} = requireJSM("resource://gre/modules/osfile.jsm");
const {PluralForm} = requireJSM("resource://gre/modules/PluralForm.jsm");

/**
 * XUL namespace
 */
const NS_XUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
exports.NS_XUL = NS_XUL;

/**
 * DownThemAll! Properties namespace
 */
const NS_DTA = 'http://www.downthemall.net/properties#';
exports.NS_DTA = NS_DTA;

/**
 * XHTML namespace
 */
const NS_HTML = 'http://www.w3.org/1999/xhtml';
exports.NS_HTML = NS_HTML;

const MAX_STACK = 6;

/**
 * returns a new UUID in string representation
 * @return String UUID
 */
exports.newUUIDString = function newUUIDString() {
	return Services.uuid.generateUUID().toString();
};

/**
 * Range generator (python style).
 * Difference: step direction is initialized accordingly if corresponding parameter is omitted.
 *
 * @param start Optional. Start value (default: 0)
 * @param stop Stop value (exclusive)
 * @param step Optional. Step value (default: 1/-1)
 */
exports.range = function* range() {
	if (!arguments.length) {
		throw Components.results.NS_ERROR_INVALID_ARG;
	}
	let start = 0, stop = parseInt(arguments[0], 10), step;
	if (arguments.length >= 2) {
		start = stop;
		stop = parseInt(arguments[1], 10);
	}
	if (arguments.length >= 3) {
		step = parseInt(arguments[2], 10);
	}
	else {
		step = stop - start > 0 ? 1 : -1;
	}
	if (!isFinite(start) || !isFinite(stop) || !isFinite(step) || !step) {
		throw Cr.NS_ERROR_INVALID_ARG;
	}
	if ((stop - start) / step < 0) {
		// negative range
		throw Cr.NS_ERROR_INVALID_ARG;
	}
	stop += -Math.abs(step) / step;
	stop += step - ((stop - start) % step);
	for (; start !== stop; start += step) {
		yield ~~start;
	}
};

function toHex(c) {
	return ('0' + c.toString(16)).slice(-2);
}

/**
 * Builds the hexdigest of (binary) data
 * @param {Object} data
 * @return {String} hexdigest
 */
exports.hexdigest = function hexdigest(data) {
	data = data.toString();
	let rv = Array.from(data, (c, i) => toHex(data.charCodeAt(i)));
	return rv.join('');
};

/**
 * Head-Pads a number so that at it contains least "digits" digits.
 * @param {Object} num The number in question
 * @param {Object} digits Number of digits the results must contain at least
 */
exports.formatNumber = function formatNumber(num, digits) {
	let rv = num.toString();
	if (num < 0) {
		return rv;
	}
	if (!isFinite(digits)) {
		digits = 3;
	}
	else if (digits <= 0) {
		throw Cr.NS_ERROR_INVALID_ARG;
	}
	for (let i = rv.length; i < digits; ++i) {
		rv = '0' + rv;
	}
	return rv;
};

/**
 * Formats a time delta (seconds)
 * @param {Number} delta in seconds
 * @return {String} formatted result
 */
exports.formatTimeDelta = function formatTimeDelta(delta) {
	let rv = (delta < 0) ? '-' : '';

	delta = Math.abs(delta);
	let h = Math.floor(delta / 3600);
	let m = Math.floor((delta % 3600) / 60);
	let s = Math.floor(delta % 60);

	if (h) {
		rv += exports.formatNumber(h, 2) + ':';
	}
	return rv + exports.formatNumber(m, 2) + ':' + exports.formatNumber(s, 2);
};

/**
 * Converts a Datestring into an integer timestamp.
 * @param {Object} str Datestring or null for current time.
 */
exports.getTimestamp = function getTimestamp(str) {
	if (!str) {
		return Date.now();
	}
	let rv = Date.parse(str);
	if (!isFinite(rv)) {
		throw new Error('invalid date');
	}
	return rv;
};

const fmi = require("support/uniquelinks");
exports.filterInSitu = fmi.filterInSitu;
exports.mapInSitu = fmi.mapInSitu;
exports.filterMapInSitu = fmi.filterMapInSitu;
exports.mapFilterInSitu = fmi.mapFilterInSitu;

exports.shuffle = function(a) {
	let c, e = a.length;
	if (e < 2) {
		return;
	}
	if (e === 2) {
		[a[0], a[1]] = [a[1], a[0]];
		return;
	}

	while (e > 1) {
		c = Math.floor(Math.random() * (e--));
		// swap
		[a[e], a[c]] = [a[c], a[e]];
	}
};

exports.randint = function(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min)) + min;
};

/**
 * Sorts an array with natural sort order.
 * @param arr (array) Array to sort
 * @param mapper (function) Optional. Mapping function mapping array items to search keys.
 * @return (array) Sorted array
 */
function naturalSort(arr, mapper) {
	if (typeof mapper !== 'function' && !(mapper instanceof Function)) {
		mapper = naturalSort.identity;
	}
	exports.mapInSitu(arr, naturalSort.tokenize.bind(null, mapper));
	arr.sort(naturalSort.compare);
	return exports.mapInSitu(arr, naturalSort.unmap);
}
naturalSort.identity = function(e) {
	return e;
};
naturalSort.strtol = function strtol(str, rv) {
	str = str.trimLeft();
	let base = 10;
	let negative = false;
	let parsed = "";
	let c0 = str[0];
	if (c0 === "-") {
		parsed = "-";
		negative = true;
		str = str.substr(1);
	}
	else if (c0 === "+") {
		parsed = "+";
		str = str.substr(1);
	}
	else if (c0 === "0" && str[1] === "x") {
		parsed = "0x";
		base = 16;
		str = str.substr(2);
	}
	const chars = exports.mapInSitu(
		str.toLowerCase().split(""),
		e => e.charCodeAt(0)
		);
	for (let [idx,c] in new Iterator(chars)) {
		if ((c >= 48 && c <= 57) || (base === 16 && c >= 97 && c <= 100)) {
			continue;
		}
		if (!idx) {
			rv.num = NaN;
			rv.parsed = "";
			rv.remainder = str;
			return false;
		}
		rv.parsed = parsed + str.substr(0, idx);
		rv.num = parseInt(rv.parsed, base);
		if (negative) {
			rv.num = -rv.num;
		}
		rv.remainder = str.substr(idx);
		return true;
	}
	rv.parsed = parsed + str;
	rv.num = parseInt(str, base);
	if (negative) {
		rv.num = -rv.num;
	}
	rv.remainder = "";
	return true;
};
naturalSort.tokenize = function tokenize(mapper, elem) {
	let str = (mapper(elem) || "")
		.toString()
		.replace(/\b(?:a|one|the)\b/g, " ")
		.replace(/\s+/g, " ")
		.toLowerCase()
		.trim();
	if (!str) {
		return {elem: elem, chunks: [{l: 0, e: ""}]};
	}
	let rv = [];
	let res = Object.create(null);
	let plain = "";
	while (str) {
		if (naturalSort.strtol(str, res)) {
			plain = plain.trim();
			if (plain) {
				rv.push({l:plain.length, e:plain});
				plain = "";
			}
			rv.push({l: res.parsed.length, e:res.num});
			str = res.remainder;
		}
		if (str) {
			plain += str[0];
			str = str.substr(1);
		}
	}
	plain = plain.trim();
	if (plain) {
		rv.push({l:plain.length, e:plain});
	}
	return {elem: elem, chunks: rv};
};
naturalSort.compareElement = function(a, b) {
	return a === b ? 0 : (a < b ? -1 : 1);
};
naturalSort.compare = function(a, b) {
	let ai, bi;
	[a, b] = [a.chunks, b.chunks];
	let m = Math.min(a.length, b.length);
	for (let i = 0; i < m; ++i) {
		ai = a[i];
		bi = b[i];
		try {
			let rv = naturalSort.compareElement(typeof ai.e, typeof bi.e);
			if (rv) {
				return rv;
			}

			if ((rv = naturalSort.compareElement(ai.e, bi.e)) ||
					(rv = naturalSort.compareElement(ai.l, bi.l))) {
				return rv;
			}
		}
		catch (ex) {
			log(LOG_ERROR, "FAILED!", ex);
			log(LOG_ERROR, "m " + m + " i " + i);
			log(LOG_ERROR, a.toSource());
			log(LOG_ERROR, "ai " + ai);
			log(LOG_ERROR, b.toSource());
			log(LOG_ERROR, "bi " + bi);
			throw ex;
		}
	}
	return naturalSort.compareElement(a.length, b.length);
};
naturalSort.unmap = function(e) {
	return e.elem;
};
exports.naturalSort = naturalSort;


/**
 * Simple Iterator encapsulating nsISimpleEnumerator for easy access
 * @param obj (nsISimpleEnumerator) Enumerator to convert to an iterator
 * @param iface (Interface) Optional. Interface of elements
 * @return
 */
function SimpleIterator(obj, iface) {
	this.iface = iface || Ci.nsISupport;
	this.obj = obj.QueryInterface(Ci.nsISimpleEnumerator);
}
SimpleIterator.prototype[Symbol.iterator] = function*() {
	while (this.obj.hasMoreElements()) {
		yield this.obj.getNext().QueryInterface(this.iface);
	}
};
exports.SimpleIterator = Object.freeze(SimpleIterator);

/**
 * Construct object from nsIProperties.
 * Properties elements will be mapped to this newly created object as
 * regular JS properties.
 * @param properties (nsIProperties) initial properties
 */
function Properties() {
	for (let p of Array.slice(arguments)) {
		this._parse(p);
	}
}
Properties.prototype = Object.freeze({
	_parse: function(properties) {
		function toUpper(str, n) {
			return n.toUpperCase();
		}

		if (!properties) {
			return;
		}
		let keys = properties.getKeys({});
		for (let key of keys) {
			try {
				let prop =  properties.get(key, Ci.nsISupports);
				if (prop instanceof Ci.nsIVariant) {
					prop = prop;
				}
				else if (prop instanceof Ci.nsISupportsPrimitive) {
					switch(prop.type || prop.TYPE_STRING) {
					case prop.TYPE_CSTRING:
						prop = prop.QueryInterface(Ci.nsISupportsCString);
						break;
					case prop.TYPE_STRING:
						prop = prop.QueryInterface(Ci.nsISupportsString);
						break;
					case prop.TYPE_PRBOOL:
						prop = prop.QueryInterface(Ci.nsISupportsPRBool);
						break;
					case prop.TYPE_PRUINT8:
						prop = prop.QueryInterface(Ci.nsISupportsPRUint8);
						break;
					case prop.TYPE_PRUINT16:
						prop = prop.QueryInterface(Ci.nsISupportsPRUint16);
						break;
					case prop.TYPE_PRUINT32:
						prop = prop.QueryInterface(Ci.nsISupportsPRUint32);
						break;
					case prop.TYPE_PRUINT64:
						prop = prop.QueryInterface(Ci.nsISupportsPRUint64);
						break;
					case prop.TYPE_PRINT8:
						prop = prop.QueryInterface(Ci.nsISupportsPRInt8);
						break;
					case prop.TYPE_PRINT16:
						prop = prop.QueryInterface(Ci.nsISupportsPRInt16);
						break;
					case prop.TYPE_PRINT32:
						prop = prop.QueryInterface(Ci.nsISupportsPRInt32);
						break;
					case prop.TYPE_PRINT64:
						prop = prop.QueryInterface(Ci.nsISupportsPRInt64);
						break;
					case prop.TYPE_FLOAT:
						prop = prop.QueryInterface(Ci.nsISupportsFloat);
						break;
					case prop.TYPE_DOUBLE:
						prop = prop.QueryInterface(Ci.nsISupportsDouble);
						break;
					case prop.TYPE_CHAR:
						prop = prop.QueryInterface(Ci.nsISupportsChar);
						break;
					case prop.TYPE_PRTIME:
						prop = prop.QueryInterface(Ci.nsISupportsPRTime);
						break;
					case prop.TYPE_INTERFACE_POINTER:
						prop = prop.QueryInterface(Ci.nsISupportsInterfacePointer);
						break;
					default:
						throw new Exception("Invalid type");
					}
					prop = prop.data;
				}
				key = key.replace(/[.-](.)/g, toUpper);
				this[key] = prop;
			}
			catch (ex) {
				Components.utils.reportError("Failed to convert property: " + ex);
			}
		}
	}
});
exports.Properties = Object.freeze(Properties);

/**
 * Mime quality param constructor
 */
class MimeQuality {
	constructor() {
		this._q = {};
	}

	/**
	 * Add new item
	 * @param v (string) Parameter value
	 * @param q (number) Quality number
	 */
	add(v, q) {
		if (typeof q !== "number" || q > 1 || q < 0) {
			throw new Error("Invalid q");
		}
		q = parseInt(q * 1000, 10) / 1000;
		if (!(q in this._q)) {
			this._q[q] = [];
		}
		this._q[q].push(v);
		return this;
	}
	/**
	 * String representation to be used as Mime parameter literal
	 * @return Representation
	 */
	toString() {
		function qval(x, i) {
			return i + (x >= 1 ? "" : ";q=" + x);
		}

		let rv = [];
		for (let x in this._q) {
			let e = this._q[x];
			e.sort();
			rv.push({
				q: x,
				v: e.map(qval.bind(null, x)).join(",")
			});
		}
		rv.sort(function(a, b) {
			return (a.q > b.q) ? -1 : ((a.q < b.q) ? 1 : 0);
		});
		return exports.mapInSitu(rv, e => e.v).join(",");
	}
}
exports.MimeQuality = Object.freeze(MimeQuality);

let _bundles = Object.create(null);
function _loadBundles(urls) {
	function bundle(url) {
		return Services.strings.createBundle(url).getSimpleEnumeration();
	}

	function _load(url) {
		if (url in _bundles) {
			return _bundles[url];
		}
		let strings = {};
		let uri = toURI(url);
		for (let s of new SimpleIterator(bundle(url), Ci.nsIPropertyElement)) {
			strings[s.key] = s.value;
		}
		if (uri.host === "dta") {
			url = "chrome://dta-locale" + uri.path.replace("/locale/", "/content/");
			log(LOG_DEBUG, "also loading: " + url);
			for (let s of new SimpleIterator(bundle(url), Ci.nsIPropertyElement)) {
				let k = s.key;
				if (!(k in strings)) {
					strings[k] = s.value;
				}
			}
		}
		return _bundles[url] = strings;
	}

	exports.filterInSitu(
		urls,
		function(e) {
			return !((e in this) || (this[e] = null));
		},
		{}
	);
	urls.sort();
	let key = urls.toString();
	if (key in _bundles) {
		return _bundles[key];
	}
	let rv = {};
	for (let b of exports.mapInSitu(urls, _load)) {
		for (let k in b) {
			rv[k] = b[k];
		}
	}
	return _bundles[key] = rv;
}

/**
 * Encapulates all stringbundles of the current document and provides unified
 * access
 *
 * @author Nils
 * @see _
 */
var StringBundles_params;
class StringBundles {
	constructor(documentOrStrings) {
		if (!('getElementsByTagNameNS' in documentOrStrings)) {
			this._strings = _loadBundles(documentOrStrings);
		}
		else {
			this._strings = _loadBundles(Array.map(
				documentOrStrings.getElementsByTagNameNS(NS_DTA, 'stringbundle'),
				e => e.getAttribute('src')
			).concat(
				Array.map(
					documentOrStrings.getElementsByTagNameNS(NS_XUL, 'stringbundle'),
					e => e.getAttribute('src')
				)
			));
		}
	}
	getString(id) {
		return this._strings[id];
	}
	getFormattedString(id, params, num) {
		let fmt = this.getString(id);
		if (isFinite(num)) {
			fmt = PluralForm.get(num, fmt);
		}
		StringBundles_params = params;
		try {
			fmt = fmt.replace(StringBundles._br, StringBundles._repl);
		}
		finally {
			StringBundles_params = null;
		}
		return fmt;
	}
}
StringBundles._br = /%S/gi;
StringBundles._repl = function() {
	return StringBundles_params.shift();
};
const StringBundles_Observer = {
	observe: function() {
		_bundles = Object.create(null);
	}
};
Prefs.addObserver("general.useragent.locale", StringBundles_Observer);
require("support/memorypressure").add(StringBundles_Observer);
exports.StringBundles = Object.freeze(StringBundles);

/**
 * XP compatible reveal/launch
 *
 * @author Nils (derived from DownloadManager code)
 */

function openExternal_prepare(file) {
	if (file instanceof Ci.nsIFile) {
		return file;
	}
	if (!(file instanceof Ci.nsIFile)) {
		file = new Instances.LocalFile(file);
	}
	return file;
}
function openExternal_nixLaunch(file) {
	try {
		Services.eps.loadURI(Services.io.newFileURI(file));
	}
	catch (ex) {
		Services.eps.loadUrl(Services.io.newFileURI(file));
	}
}

/**
 * Launch/Execute a file
 *
 * @param nsIFile/String
 *          pointing to the desired file
 */
exports.launch = function launch(file) {
	file = openExternal_prepare(file);
	if (!file.exists()) {
		throw new Exception("OpenExternal: file not found!");
	}
	try {
		file.launch();
	}
	catch (ex) {
		// *nix will throw as not implemented
		openExternal_nixLaunch(file);
	}
};

/**
 * Reveal a file, which will open the directory and furthermore select the
 * file on some platforms.
 *
 * @param nsIFile/String
 *          pointing to the desired file
 */
exports.reveal = function reveal(file) {
	file = openExternal_prepare(file);
	try {
		if (!file.exists()) {
			throw new Exception("LocalFile does not exist");
		}
		else {
			file.reveal();
		}
	}
	catch (ex) {
		// try to open the directory instead
		// (either because the file does not exist anymore
		// or because the platform does not implement reveal);
		exports.launch(file.parent);
	}
};

/**
 * Convert metalink priorities to start from 1 and give more weitage to ones with lower prioroty,
 * to dta preferences
 * @param array of DTA.URL
 */
exports.normalizeMetaPrefs = function(urls) {
	if (!urls || !urls.length) {
		return;
	}
	let pmax = urls.reduce((p,c) => isFinite(c.preference) ? Math.max(c.preference, p) : p, 1);
	let pmin = urls.reduce((p,c) => isFinite(c.preference) ? Math.min(c.preference, p) : p, pmax - 1);
	urls.forEach(function(url) {
		url.preference = Math.max(100 - ((url.preference - pmin) *  100 / (pmax - pmin)).toFixed(0), 10);
	});
};

const makeDirCache = new LRUMap(10);

exports.makeDir = function*(dir, perms, force) {
	if (!force && makeDirCache.has(dir.path)) {
		return;
	}
	try {
		yield OS.File.makeDir(dir.path, {unixMode: perms});
		makeDirCache.set(dir.path, perms);
	}
	catch (ex if ex.becauseExists) {
		// no op
	}
	catch (ex if ex.becauseNoSuchFile) {
		yield exports.makeDir(dir.parent, perms);
		yield exports.makeDir(dir, perms);
	}
	catch (ex if ex.winLastError === 3) {
		yield exports.makeDir(dir.parent, perms);
		yield exports.makeDir(dir, perms);
	}
};
