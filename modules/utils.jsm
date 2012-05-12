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
 * The Original Code is DownThemAll Utilities module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
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

const EXPORTED_SYMBOLS = [
	'Logger',
	'atos',
	'bind',
	'newUUIDString',
	'range',
	'hexdigest',
	'merge',
	'clone',
	'formatNumber',
	'formatTimeDelta',
	'getTimestamp',
	'filterInSitu',
	'mapInSitu',
	'filterMapInSitu',
	'mapFilterInSitu',
	'naturalSort',
	'SimpleIterator',
	'Properties',
	'MimeQuality',
	'StringBundles',
	'launch',
	'reveal',
	'extendString',
	'SYSTEMSLASH',
	'NS_XUL', 'NS_DTA', 'NS_HTML'
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const error = Components.utils.reportError;
const module = Components.utils.import;
const Exception = Components.Exception;

module("resource://dta/glue2.jsm");
const Prefs = require("preferences");

/**
 * XUL namespace
 */
const NS_XUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

/**
 * DownThemAll! Properties namespace
 */
const NS_DTA = 'http://www.downthemall.net/properties#';

/**
 * XHTML namespace
 */
const NS_HTML = 'http://www.w3.org/1999/xhtml';

const SYSTEMSLASH = (function() {
	let f = Services.dirsvc.get("TmpD", Ci.nsIFile);
	f.append('dummy');
	return (f.path.indexOf('/') != -1) ? '/' : '\\';
})();


const MAX_STACK = 6;

/**
 * Creates anonymous function with context
 * @param context (object) Context object
 * @param func (function) Function to call
 * @return (function) anonymous function binding func to context
 * @deprecated Use XPCOMUtils or glue.jsm
 */
function bind(context, func) (function() func.apply(context, arguments));

/**
 * returns a new UUID in string representation
 * @return String UUID
 */
function newUUIDString() Services.uuid.generateUUID().toString();

/**
 * LoggerService
 */
function LoggerService() {
	Services.prefs.addObserver('extensions.dta.logging', this, true);
	this._setEnabled(Services.prefs.getBoolPref('extensions.dta.logging'));
	try {
		if (this._file.fileSize > (200 * 1024)) {
			this.remove();
		}
	}
	catch(ex) {
		// No-Op
	}
	this.log("Logger: init");
}

LoggerService.prototype = {
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference, Ci.nsIWeakReference, Ci.dtaILoggerService]),

	QueryReferent: function(iid) this.QueryInterface(iid),
	GetWeakReference: function() this,

	// nsIObserver
	observe: function DS_observe(subject, topic, prefName) {
		this._setEnabled(Services.prefs.getBoolPref('extensions.dta.logging'));
	},
	clear: function DS_clear() {
		if (this._file.exists()) {
			this._file.remove(false);
		}
	},
	get _file() {
		let file = Services.dirsvc.get("ProfD", Ci.nsILocalFile);
		file.append('dta_log.txt');
		delete LoggerService.prototype._file;
		return (LoggerService.prototype._file = file);
	},

	get file() {
		return this._file;
	},
	enabled: false,
	_setEnabled: function DS_setEnabled(nv) {
		this.enabled = nv;
		if (nv) {
			this.log = this._log;
		}
		else {
			this.log = this._logDisabled;
		}
	},
	_formatTimeDate: function(value) value.toString().replace(/\b(\d)\b/g, "0$1"),
	_log: function DS__log(msg, exception) {
		try {
			if (!msg || (msg == "" && typeof(exception) != "object")) {
				return;
			}
			if (!(msg instanceof String) && typeof(msg) != 'string') {
				msg = msg.toSource();
			}
			let time = new Date();
			let text = [];
			text.push(this._formatTimeDate(time.getHours()));
			text.push(':');
			text.push(this._formatTimeDate(time.getMinutes()));
			text.push(':');
			text.push(this._formatTimeDate(time.getSeconds()));
			text.push('::');
			text.push(time.getMilliseconds());
			text.push('\n');

			if (msg != "") {
				text.push(msg.replace(/\n/g, "\n\t") + " ");
			}
			if (exception) {
				text.push("\tError: " + exception);
			}
			text.push('\n');
			let stack = Components.stack;
			if (stack) {
				stack = stack.caller;
			}
			let lineNumber = 0;
			let columnNumber = 0;
			let fileName = null;
			let sourceLine = '';


			if (exception && exception.location) {
				lineNumber = exception.lineNumber;
				fileName = exception.filename;
				columnNumber = exception.columnNumber;
				stack = exception.location;

				let initialLine = "Source Frame :: " + fileName;
				initialLine += " :: " + exception.location;
				initialLine += " :: line: " + lineNumber;
				text.push('\t>');
				text.push(initialLine);
				text.push('\n');
			}
			else if (exception && exception.stack) {
				lineNumber = exception.lineNumber;
				fileName = exception.fileName;
				columnNumber = 0;
				let initialLine = "Source Frame (error) :: " + fileName;
				initialLine += " :: " + exception.name;
				initialLine += " :: line: " + lineNumber;
				text.push("\t>" + initialLine + "\n");

			}
			else if (exception && stack) {
				lineNumber = stack.lineNumber;
				fileName = stack.filename;
				let initialLine = "Source Frame (stack) :: " + fileName;
				initialLine += " :: " + stack.name;
				initialLine += " :: line: " + lineNumber;
				text.push('\t>');
				text.push(initialLine);
				text.push('\n');
			}
			else if (stack) {
				text.push('\t>');
				text.push(stack.toString());
				text.push('\n');
				lineNumber = stack.lineNumber;
				fileName = stack.filename;
			}

			if (stack instanceof Ci.nsIStackFrame) {
				let sourceLine = stack.sourceLine;
				let s = stack.caller;
				for (let i = 0; i < MAX_STACK && s; ++i) {
					text.push('\t>');
					text.push(s.toString());
					text.push('\n');
					s = s.caller;
				}
				text = text.join('');
				if (stack && exception) {
					Services.console.logMessage(new Instances.ScriptError(
						text,
						fileName,
						sourceLine,
						lineNumber,
						columnNumber,
						0x2,
						'component javascript'
						));

				}
				else {
					Services.console.logStringMessage(text);
				}
			}
			else {
				text = text.join('');
				Services.console.logStringMessage(text);
			}
			var f = new Instances.FileOutputStream(this.file, 0x04 | 0x08 | 0x10, 0664, 0);
			f.write(text, text.length);
			f.close();
		}
		catch(ex) {
			error(ex);
			error(this.toSource());
		}

	},
	_logDisabled: function DS__dumpDisabled() {
		// no-op;
	},
	log: this._log,

	remove: function DS_remove() {
		try {
			this._file.remove(false);
		}
		catch (ex) {
			throw Cr.NS_ERROR_FAILURE;
		}
	}
};

const Logger = new LoggerService();

/**
 * Range generator (python style). Difference: step direction is initialized accordingly if corresponding parameter is omitted.
 * @param start Optional. Start value (default: 0)
 * @param stop Stop value (exclusive)
 * @param step Optional. Step value (default: 1/-1)
 */
function range() {
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
function hexdigest(data) {
	data = data.toString();
	return [('0' + data.charCodeAt(i).toString(16)).slice(-2) for (i in range(data.length))].join('');
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
 * (Almost) Clones an object. Not instanceof safe :p
 * @param {Object} obj
 * @return {Object} Copy of obj
 */
function clone(obj) {
	var rv = {};
	merge(rv, obj);
	merge(rv.prototype, this.prototype);
	rv.constructor = this.constructor;
	return rv;
}

/**
 * Cast non-strings to strings (using toSource if required instead of toString()
 * @param {Object} data
 */
function atos(data) {
	if (typeof(data) == 'string') {
		return data;
	}
	if (data instanceof String || typeof(data) == 'object') {
		try {
			return data.toSource();
		}
		catch (ex) {
			// fall-trough
		}
	}
	return data.toString();
}

/**
 * Head-Pads a number so that at it contains least "digits" digits.
 * @param {Object} num The number in question
 * @param {Object} digits Number of digits the results must contain at least
 */
function formatNumber(num, digits) {
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
function formatTimeDelta(delta) {
	let rv = (delta < 0) ? '-' : '';

	delta = Math.abs(delta);
	let h = Math.floor(delta / 3600);
	let m = Math.floor((delta % 3600) / 60);
	let s = Math.floor(delta % 60);

	if (h) {
		rv += formatNumber(h, 2) + ':';
	}
	return rv + formatNumber(m, 2) + ':' + formatNumber(s, 2);
}

/**
 * Converts a Datestring into an integer timestamp.
 * @param {Object} str Datestring or null for current time.
 */
function getTimestamp(str) {
	if (!str) {
		return Date.now();
	}
	let rv = Date.parse(atos(str));
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
function filterInSitu(arr, cb, tp) {
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
function mapInSitu(arr, cb, tp) {
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
function filterMapInSitu(arr, filterStep, mapStep, tp) {
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
function mapFilterInSitu(arr, mapStep, filterStep, tp) {
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
	mapInSitu(
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
	return mapInSitu(arr, function(a) a.elem);
}
naturalSort.identity = function(e) e;
naturalSort.isDigit = function(a, i) {
	i = a[i];
	return i >= '0' && i <= '9';
};
naturalSort.compare = function(a, b) {
	return a === b ? 0 : (a < b ? -1 : 1);
};


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
		mapInSitu(rv, function(e) e.v + ";q=" + e.q).join(", ");
		return rv;
	}
}

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
	filterInSitu(
		urls,
		function(e) !((e in this) || (this[e] = null)), {}
	);
	urls.sort();
	let key = urls.toString();
	if (key in _bundles) {
		return _bundles[key];
	}
	let rv = {};
	for each (let b in mapInSitu(urls, function(e) _loadBundle(e))) {
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
function launch(file) {
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
function reveal(file) {
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

function extendString(_s) {
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
extendString(String);
