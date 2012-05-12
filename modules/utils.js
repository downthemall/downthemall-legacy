/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const Prefs = require("preferences");

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

const SYSTEMSLASH = (function() {
	let f = Services.dirsvc.get("TmpD", Ci.nsIFile);
	f.append('dummy');
	return (f.path.indexOf('/') != -1) ? '/' : '\\';
})();
exports.SYSTEMSLASH = SYSTEMSLASH;

const MAX_STACK = 6;

/**
 * returns a new UUID in string representation
 * @return String UUID
 */
exports.newUUIDString = function newUUIDString() Services.uuid.generateUUID().toString();

/**
 * Range generator (python style). Difference: step direction is initialized accordingly if corresponding parameter is omitted.
 * @param start Optional. Start value (default: 0)
 * @param stop Stop value (exclusive)
 * @param step Optional. Step value (default: 1/-1)
 */
exports.range = function range() {
	if (arguments.length == 0) {
		throw Components.results.NS_ERROR_INVALID_ARG;
	}
	let start = 0, stop = new Number(arguments[0]), step;
	if (arguments.length >= 2) {
		start = stop;
		stop = new Number(arguments[1]);
	}
	if (arguments.length >= 3) {
		step = new Number(arguments[2]);
	}
	else {
		step = stop - start > 0 ? 1 : -1;
	}
	if (!isFinite(start) || !isFinite(stop) || !isFinite(step) || step == 0) {
		throw Cr.NS_ERROR_INVALID_ARG;
	}
	if ((stop - start) / step < 0) {
		// negative range
		return;
	}
	stop += -Math.abs(step) / step;
	stop += step - ((stop - start) % step);
	for (; start != stop; start += step) {
		yield start;
	}

}

/**
 * Builds the hexdigest of (binary) data
 * @param {Object} data
 * @return {String} hexdigest
 */
exports.hexdigest = function hexdigest(data) {
	data = data.toString();
	return [('0' + data.charCodeAt(i).toString(16)).slice(-2) for (i in exports.range(data.length))].join('');
}

/**
 * Merges the enumeratable properties of two objects
 * @param {Object} me Object that has the properties added the properties
 * @param {Object} that Object of which the properties are taken
 */
function merge(me, that) {
	for (let c in that) {
		me[c] = that[c];
	}
}

/**
 * Head-Pads a number so that at it contains least "digits" digits.
 * @param {Object} num The number in question
 * @param {Object} digits Number of digits the results must contain at least
 */
exports.formatNumber = function formatNumber(num, digits) {
	let rv = num.toString();
	if (!isFinite(digits)) {
		digits = 3;
	}
	for (let i = rv.length; i < digits; ++i) {
		rv = '0' + rv;
	}
	return rv;
}

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
}

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
}

/**
 * Filter arrays in-situ. Like Array.filter, but in place
 *
 * @param {Array} arr
 * @param {Function} cb
 * @param {Object} tp
 * @returns {Array} Filtered array (identity)
 */
exports.filterInSitu = function filterInSitu(arr, cb, tp) {
	tp = tp || null;
	let i, k, e;
	for (i = 0, k = 0, e = arr.length; i < e; i++) {
		let a = arr[k] = arr[i]; // replace filtered items
		if (a && cb.call(tp, a, i, arr)) {
			k += 1;
		}
	}
	arr.length = k; // truncate
	return arr;
}

/**
 * Map arrays in-situ. Like Array.map, but in place.
 * @param {Array} arr
 * @param {Function} cb
 * @param {Object} tp
 * @returns {Array} Mapped array (identity)
 */
exports.mapInSitu = function mapInSitu(arr, cb, tp) {
	tp = tp || null;
	for (let i = 0, e = arr.length; i < e; i++) {
		arr[i] = cb.call(tp, arr[i], i, arr);
	}
	return arr;
}

/**
 * Filters and then maps an array in-situ
 * @param {Array} arr
 * @param {Function} filterStep
 * @param {Function} mapStep
 * @param {Object} tp
 * @returns {Array} Filtered and mapped array (identity)
 */
exports.filterMapInSitu = function filterMapInSitu(arr, filterStep, mapStep, tp) {
	tp = tp || null;
	let i, k, e;
	for (i = 0, k = 0, e = arr.length; i < e; i++) {
		let a = arr[i]; // replace filtered items
		if (a && filterStep.call(tp, a, i, arr)) {
			arr[k] = mapStep.call(tp, a, i, arr);
			k += 1;
		}
	}
	arr.length = k; // truncate
	return arr;
}

/**
 * Map and then filter an array in place
 *
 * @param {Array} arr
 * @param {Function} mapStep
 * @param {Function} filterStep
 * @param {Object} tp
 * @returns {Array} Mapped and filtered array (identity)
 */
exports.mapFilterInSitu = function mapFilterInSitu(arr, mapStep, filterStep, tp) {
	tp = tp || null;
	let i, k, e;
	for (i = 0, k = 0, e = arr.length; i < e; i++) {
		let a = arr[k] = mapStep.call(tp, arr[i], i, arr); // replace filtered items
		if (a && filterStep.call(tp, a, i, arr)) {
			k += 1;
		}
	}
	arr.length = k; // truncate
	return arr;
}

/**
 * Sorts an array with natural sort order.
 * Unlike Array.sort the array is NOT sorted in-situ.
 * @param arr (array) Array to sort
 * @param mapper (function) Optional. Mapping function mapping array items to search keys.
 * @return (array) Sorted array
 */
function naturalSort(arr, mapper) {
	if (typeof mapper != 'function' && !(mapper instanceof Function)) {
		mapper = naturalSort.identity;
	}
	exports.mapInSitu(
		arr,
		function(b) {
			let e = mapper(b);
			if (e == null || e == undefined || typeof e == 'number') {
				return {elem: b, chunks: [e]};
			}
			let a = e.toString()
				.replace(/\b(?:a|one|the)\b/g, ' ')
				.replace(/^\s+|\s+$/g, '')
				.replace(/\s+/g, ' ')
				.toLowerCase();
			let len = a.length;
			if (!len) {
				return {elem: b, chunks: [a]};
			}
			let rv = [];
			let last = naturalSort.isDigit(a, 0);
			let cur = last;
			start = 0;

			for (let i = 0; i < len; ++i) {
				cur = naturalSort.isDigit(a, i);
				if (cur != last) {
					rv.push(cur ? a.substr(start, i - start) : Number(a.substr(start, i - start)));
					start = i;
					last = cur;
				}
			}
			if (!rv.length || len - start != 1) {
				rv.push(cur ? Number(a.substr(start)) : a.substr(start));
			}
			return {elem: b, chunks: rv};
		}
	);
	arr.sort(
		function (a, b) {
			let ai, bi;
			[a, b] = [a.chunks, b.chunks];
			let m = Math.max(a.length, b.length);
			for (let i = 0; i < m; ++i) {
				let ai = a[i], bi = b[i];
				let rv = naturalSort.compare(typeof ai, typeof bi);
				if (rv) {
					return rv;
				}
				rv = naturalSort.compare(ai, bi);
				if (rv) {
					return rv;
				}
			}
			return a.length - b.length;
		}
	);
	return exports.mapInSitu(arr, function(a) a.elem);
}
naturalSort.identity = function(e) e;
naturalSort.isDigit = function(a, i) {
	i = a[i];
	return i >= '0' && i <= '9';
};
naturalSort.compare = function(a, b) {
	return a === b ? 0 : (a < b ? -1 : 1);
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
SimpleIterator.prototype = {
	__iterator__: function() {
		while(this.obj.hasMoreElements()) {
			yield this.obj.getNext().QueryInterface(this.iface);
		}
	}
};
exports.SimpleIterator = SimpleIterator;

/**
 * Construct object from nsIProperties.
 * Properties elements will be mapped to this newly created object as
 * regular JS properties.
 * @param properties (nsIProperties) initial properties
 */
function Properties() {
	for each (let p in Array.slice(arguments)) {
		this._parse(p);
	}
}
Properties.prototype = {
	_parse: function(properties) {
		if (!properties) {
			return;
		}
		let keys = properties.getKeys({});
		for each (let key in keys) {
			try {
				let prop =  properties.get(key, Ci.nsISupports);
				if (prop instanceof Ci.nsIVariant);
				else if (prop instanceof Ci.nsISupportsPrimitive) {
					prop = prop.QueryInterface(Ci.nsISupportsPrimitive);
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
					case TYPE_INTERFACE_POINTER:
						prop = prop.QueryInterface(Ci.nsISupportsInterfacePointer);
						break;
					default:
						throw new Exception("Invalid type");
						break;
					}
					prop = prop.data;
				}
				key = key.replace(/[.-](.)/g, function(str, n) n.toUpperCase());
				this[key] = prop;
			}
			catch (ex) {
				Components.utils.reportError("Failed to convert property: " + ex);
			}
		}
	}
};
exports.Properties = Properties;

/**
 * Mime quality param constructor
 */
function MimeQuality() {
	this._q = {};
}
MimeQuality.prototype = {
	/**
	 * Add new item
	 * @param v (string) Parameter value
	 * @param q (number) Quality number
	 */
	add: function(v, q) {
		if (typeof q != "number" || q > 1 || q < 0) {
			throw new Error("Invalid q");
		}
		q = parseInt(q * 1000) / 1000;
		if (!(q in this._q)) {
			this._q[q] = [];
		}
		this._q[q].push(v);
		return this;
	},
	/**
	 * String representation to be used as Mime parameter literal
	 * @return Representation
	 */
	toString: function() {
		let rv = [];
		for (let x in this._q) {
			let e = this._q[x];
			e.sort();
			rv.push({q: x, v: e.join(", ")});
		}
		rv.sort(function(a, b) (a.q > b.q) ? -1 : ((a.q < b.q) ? 1 : 0));
		exports.mapInSitu(rv, function(e) e.v + ";q=" + e.q).join(", ");
		return rv;
	}
}
exports.MimeQuality = MimeQuality;

const _bundles = {};
function _loadBundle(url) {
	if (url in _bundles) {
		return _bundles[url];
	}
	let strings = {};
	for (let s in new SimpleIterator(Services.strings.createBundle(url).getSimpleEnumeration(), Ci.nsIPropertyElement)) {
		strings[s.key] = s.value;
	}
	return _bundles[url] = strings;
}
function _loadBundles(urls) {
	exports.filterInSitu(
		urls,
		function(e) !((e in this) || (this[e] = null)), {}
	);
	urls.sort();
	let key = urls.toString();
	if (key in _bundles) {
		return _bundles[key];
	}
	let rv = {};
	for each (let b in exports.mapInSitu(urls, function(e) _loadBundle(e))) {
		merge(rv, b);
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
function StringBundles(documentOrStrings) {
	if (!('getElementsByTagNameNS' in documentOrStrings)) {
		this._strings = documentOrStrings;
	}
	else {
		this._strings = _loadBundles(Array.map(
			documentOrStrings.getElementsByTagNameNS(NS_DTA, 'stringbundle'),
			function(e) e.getAttribute('src')
		).concat(
			Array.map(
				documentOrStrings.getElementsByTagNameNS(NS_XUL, 'stringbundle'),
				function(e) e.getAttribute('src')
			)
		));
	}
}
StringBundles._br = /%S/gi;
StringBundles._repl = function() {
	return StringBundles._params.shift();
}
StringBundles.prototype = {
	getString: function(id) this._strings[id],
	getFormattedString: function(id, params) {
		let fmt = this.getString(id);
		StringBundles._params = params;
		try {
			fmt = fmt.replace(StringBundles._br, StringBundles._repl);
		}
		finally {
			delete StringBundles._params;
		}
		return fmt;
	}
};
exports.StringBundles = StringBundles;

/**
 * XP compatible reveal/launch
 *
 * @author Nils (derived from DownloadManager code)
 */

function OpenExternal_prepare(file) {
	if (file instanceof Ci.nsIFile) {
		return file.QueryInterface(Ci.nsILocalFile);
	}
	if (!(file instanceof Ci.nsILocalFile)) {
		file = new Instances.LocalFile(file);
	}
	return file;
}
function OpenExternal_nixLaunch(file) {
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
 * @param nsILocalFile/String
 *          pointing to the desired file
 */
exports.launch = function launch(file) {
	file = OpenExternal_prepare(file);
	if (!file.exists()) {
		throw new Exception("OpenExternal: file not found!");
	}
	try {
		file.launch();
	}
	catch (ex) {
		// *nix will throw as not implemented
		OpenExternal_nixLaunch(file);
	}
}

/**
 * Reveal a file, which will open the directory and furthermore select the
 * file on some platforms.
 *
 * @param nsILocalFile/String
 *          pointing to the desired file
 */
exports.reveal = function reveal(file) {
	file = OpenExternal_prepare(file);
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
		launch(file.parent);
	}
}

exports.extendString = function extendString(_s) {
	const rbc_u = /[\n\r\v?:<>*|"]/g;
	const rbc_w = /%(?:25)?20/g;
	const rsl_r = /[\/\\]/g;
	const gufn_u = /\?.*$/;

	merge(
		_s.prototype,
		{
			removeBadChars: function() {
				return this
					.replace(rbc_u, '_')
					.replace(rbc_w, ' ');
			},
			addFinalSlash: function() {
				if (!this) {
					return SYSTEMSLASH;
				}
				if (this.charAt(this.length - 1) != SYSTEMSLASH) {
					return this + SYSTEMSLASH;
				}
				return this;
			},
			removeFinalChar: function(c) {
				if (!this) {
					return this;
				}
				if (this.charAt(this.length - 1) == c) {
					return this.substr(0, this.length - 1);
				}
				return this;
			},
			removeLeadingChar: function(c) {
				if (!this) {
					return this;
				}
				if (this.charAt(0) == c) {
					return this.substr(1);
				}
				return this;
			},
			removeFinalSlash: function() {
				return this.removeFinalChar(SYSTEMSLASH);
			},
			replaceSlashes: function(replaceWith) {
				return this.replace(rsl_r, replaceWith);
			},
			normalizeSlashes: function() {
				return this.replaceSlashes(SYSTEMSLASH);
			},
			removeLeadingSlash: function() {
				return this.removeLeadingChar(SYSTEMSLASH);
			},
			getUsableFileName: function() {
				let i = this.indexOf("?");
				let t = (~i ? this.substr(0, i) : this)
					.normalizeSlashes()
					.trim()
					.removeFinalSlash();
				i = t.lastIndexOf(SYSTEMSLASH);
				return (~i ? t.substr(i + 1) : t).removeBadChars().trim();
			},
			getUsableFileNameWithFlatten: (function()
					this.replaceSlashes(Prefs.getExt('flatReplacementChar', '-')).getUsableFileName()),
			getExtension: function() {
				let name = this.getUsableFileName();
				let c = name.lastIndexOf('.');
				return (c == - 1) ? null : name.substr(c + 1);
			},
			cropCenter : function(newLength) {
				if (this.length > newLength) {
					return this.substr(0, newLength / 2)
						+ "..."
						+ this.substr(this.length - newLength / 2, this.length);
				}
				return this;
			},
			toURI: function(charset, baseURI) {
				return Services.io.newURI(this, charset, baseURI);
			},
			toURL: function(charset, baseURI) {
				return this.toURI(charset, baseURI).QueryInterface(Ci.nsIURL);
			}
		}
	);
}
exports.extendString(String);
