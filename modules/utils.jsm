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
	'atos',
	'bind',
	'setNewGetter',
	'ServiceGetter',
	'InstanceGetter',
	'newUUIDString',
	'range',
	'hexdigest',
	'merge',
	'clone',
	'formatNumber',
	'formatTimeDelta',
	'getTimestamp',
	'naturalSort',
	'SimpleIterator',
	'Properties',
	'MimeQuality',
	'StringBundles',
	'launch',
	'reveal',
	'NS_XUL', 'NS_DTA', 'NS_HTML'
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const ctor = Components.Constructor;
const log = Components.utils.reportError;
const Exception = Components.Exception;

const File = new ctor('@mozilla.org/file/local;1', 'nsILocalFile', 'initWithPath');


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

/**
 * Installs a new lazy getter
 * @param aObject (object) Object to install the getter to
 * @param aName (string) Name of the getter property
 * @param aLambda (function) Initializer function (called once, return value becomes getter value)
 */
function setNewGetter(aObject, aName, aLambda) {
	if (aName in aObject) {
		throw new Exception(aName + " is already defined in context " + aObject);
	}
	try {
		aObject.__defineGetter__(aName, function() {
			delete aObject[aName];
			return aObject[aName] = aLambda.apply(aObject);
		});

	}
	catch (ex) {
		log(aName);
		log(ex);
	}
}

/**
 * Install lazy service getter
 * @param context (object) Object to install the getter to
 * @param name Name of the getter property
 * @param contract (string) Contract id of the service
 * @param iface (string) Interface of the service
 */
function ServiceGetter(context, name, contract, iface) {
	if (!iface) {
		iface = Ci.nsISupports;
	}
	else if (typeof iface == "string") {
		iface = Ci[iface];
	}
	setNewGetter(
		context,
		name,
		function() {
			try {
				return Cc[contract].getService(iface);
			}
			catch (ex) {
				log(ex);
				log(contract);
				log(iface);
				throw ex;
			}
		}
	);	
}

/**
 * Installs lazy instance getter.
 * The instance will be created only once and then reused
 * @param context (object) Object to install the getter to
 * @param name Name of the getter property
 * @param contract (string) Contract id of the class
 * @param iface (string) Interface of the class
 * @param initFuncName (string) Optional. Name of the function to call on the object instance once created.
 * @param ... (mixed) Optional. Any arguments to initFunc
 */
function InstanceGetter(context, name, contract, iface, initFuncName/*, args */) {
	if (!iface) {
		iface = Ci.nsISupports;
	}
	else if (typeof iface == "string") {
		iface = Ci[iface];
	}

	// build an arguments array for the initFunc, stripping the first 5 arguments
	let args = Array.filter(arguments, function(e, i) i > 4);
	setNewGetter(
		context,
		name,
		function() {
			let rv = Cc[contract].createInstance(iface);
			if (initFuncName) {
				rv[initFuncName].apply(rv, args);
			}
			return rv;
		}
	);
}

/**
 * Creates anonymous function with context
 * @param context (object) Context object
 * @param func (function) Function to call
 * @return (function) anonymous function binding func to context 
 */
function bind(context, func) (function() func.apply(context, arguments));

/**
 * returns a new UUID in string representation
 * @return String UUID
 */
setNewGetter(this, "newUUIDString", function() {
	let uuidgen = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator);
	return function() {
		return uuidgen.generateUUID().toString();
	};
});

ServiceGetter(this, "IOService", "@mozilla.org/network/io-service;1", "nsIIOService");
ServiceGetter(this, "ExternalProtocolService", "@mozilla.org/uriloader/external-protocol-service;1", "nsIExternalProtocolService");
ServiceGetter(this, "StringBundleService", "@mozilla.org/intl/stringbundle;1", "nsIStringBundleService");

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
	let rv = atos(num);
	digits = Number(digits);
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
 * Sorts an array with natural sort order.
 * Unlike Array.sort the array is NOT sorted in-situ.
 * @param arr (array) Array to sort
 * @param mapper (function) Optional. Mapping function mapping array items to search keys.
 * @return (array) Sorted array
 */
function naturalSort(arr, mapper) {
	if (typeof mapper != 'function' && !(mapper instanceof Function)) {
		mapper = function(e) e;
	}
	let isDigit = function(a, i) {
		i = a[i];
		return i >= '0' && i <= '9';
	};
	let compare = function(a, b) {
		return a === b ? 0 : (a < b ? -1 : 1);
	}
	arr = arr.map(
		function(b) {
			let e = mapper(b);
			if (e == null || e == undefined || typeof e == 'number') {
				return {elem: b, chunks: [e]};
			}
			let a = e.toString().replace(/\b(?:a|one|the)\b/g, ' ').replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ').toLowerCase();
			let len = a.length;
			if (!len) {
				return {elem: b, chunks: [a]};
			}
			let rv = [];
			let last = isDigit(a, 0);
			let cur = last;
			start = 0;
		
			for (let i = 0; i < len; ++i) {
				cur = isDigit(a, i);
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
				let rv = compare(typeof ai, typeof bi);
				if (rv) {
					return rv;
				}
				rv = compare(ai, bi);
				if (rv) {
					return rv;
				}
			}
			return a.length - b.length;
		}
	);
	return arr.map(function(a) a.elem);
}

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
	for each (let p in Array.map(arguments, function(e) e)) {
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
		rv = rv.map(function(e) e.v + ";q=" + e.q).join(", ");
		return rv;
	}
}

const _bundles = {};
function _loadBundle(url) {
	if (url in _bundles) {
		return _bundles[url];
	}
	let strings = {};
	for (let s in new SimpleIterator(StringBundleService.createBundle(url).getSimpleEnumeration(), Ci.nsIPropertyElement)) {
		strings[s.key] = s.value;
	}	
	return _bundles[url] = strings; 
}
function _loadBundles(urls) {
	urls = urls.filter(
		function(e) !((e in this) || (this[e] = null)), {}
	);
	urls.sort();
	let key = urls.toString();
	if (key in _bundles) {
		return _bundles[key];
	}
	let rv = {};
	for each (let b in urls.map(function(e) _loadBundle(e))) {
		merge(rv, b);
	}
	return _bundles[key] = rv; 
}
const _br = /%S/gi;

/**
 * Encapulates all stringbundles of the current document and provides unified
 * access
 * 
 * @author Nils
 * @see _
 */
function StringBundles(document) {
	this._strings = _loadBundles(Array.map(
		document.getElementsByTagNameNS(NS_DTA, 'stringbundle'),
		function(e) e.getAttribute('src')
	).concat(
		Array.map(
			document.getElementsByTagNameNS(NS_XUL, 'stringbundle'),
			function(e) e.getAttribute('src')
		)
	));
}
StringBundles.prototype = {
	getString: function(id) {
		let rv = this._strings[id];
		if (!rv) {
			throw new Exception('BUNDLE STRING NOT FOUND (' + id + ')');
		}
		return rv;
	},
	getFormattedString: function(id, params) {
		let fmt = this.getString(id);
		function repl() {
			return params.shift();
		}
		return fmt.replace(_br, repl);
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
		file = new File(file);
	}
	return file;
}
function OpenExternal_nixLaunch(file) {
	ExternalProtocolService.loadUrl(IOService.newFileURI(file));	 
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
			throw new Exception("File does not exist");
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