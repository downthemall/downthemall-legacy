/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const EXPORTED_SYMBOLS = ["require", "requireJoined", "requireJSM", "unload", "weak", "Services", "Instances", "XPCOMUtils", "LRUMap"];

const {
	classes: Cc,
	interfaces: Ci,
	utils: Cu,
	results: Cr,
	manager: Cm,
	Constructor: ctor,
	Exception: Exception
} = Components;
Cm.QueryInterface(Ci.nsIComponentRegistrar);

const {
	getWeakReference: weak,
	reportError: reportError
} = Cu;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

const lazy = XPCOMUtils.defineLazyGetter;

let log = function logStub() {
	Cu.reportError(Array.join(arguments, ", "));
}
let LOG_DEBUG = 0, LOG_INFO = 0, LOG_WARN = 0;

//Map shim
if (!("Map" in this)) {
	this.Map = function() {
		this._dict = Object.create(null);
		Object.freeze(this);
	}
	this.Map.prototype = Object.freeze({
		"get": function(key) this._dict[key],
		"has": function(key) key in this._dict,
		"set": function(key, val) { this._dict[key] = val; },
		"delete": function(key) { delete this._dict[key]; },
	});
	EXPORTED_SYMBOLS.push("Map");
}

function LRUMap(limit) {
	this._limit = limit;
	this.clear();
	Object.preventExtensions(this);
}
LRUMap.prototype = Object.freeze({
	"get": function(key) this._dict.get(key),
	"has": function(key) this._dict.has(key),
	"set": function(key, val) {
		if (this.has(key)) {
			this._dict.set(key, val);
			return;
		}
		if (this._arr.length == this._limit) {
			this._dict.delete(this._arr.shift());
		}
		this._dict.set(key, val);
		this._arr.push(key);
	},
	"delete": function(key) {
		if (!this._dict.has(key)) {
			return;
		}
		this._dict.delete(key);
		this._arr.splice(this._arr.indexOf(key), 1);
	},
	"clear": function() {
		this._dict = new Map();
		this._arr = [];
	}
});

//hide our internals
//Since require() uses .scriptloader, the loaded require scopes will have
//access to the named stuff within this module scope, but we actually want
//them to have access to certain stuff.
(function setup_scope(exports) {
	function itor(name, cls, iface, init) {
		if (init) {
			XPCOMUtils.defineLazyGetter(Instances, name, function() ctor(cls, iface, init));
			XPCOMUtils.defineLazyGetter(Instances, "Plain" + name, function() ctor(cls, iface));
		}
		else {
			XPCOMUtils.defineLazyGetter(Instances, name, function() ctor(cls, iface));
			XPCOMUtils.defineLazyGetter(Instances, name.toLowerCase(), function() new this[name]());
		}
	}

	/* let */ Services = exports.Services = Object.create(Services);
	let dlsg = XPCOMUtils.defineLazyServiceGetter.bind(XPCOMUtils, Services);
	dlsg("catman", "@mozilla.org/categorymanager;1", "nsICategoryManager");
	dlsg("clipbrd", "@mozilla.org/widget/clipboard;1", "nsIClipboard");
	dlsg("eps", "@mozilla.org/uriloader/external-protocol-service;1", "nsIExternalProtocolService");
	dlsg("fixups", "@mozilla.org/docshell/urifixup;1", "nsIURIFixup");
	dlsg("favicons", "@mozilla.org/browser/favicon-service;1", "nsIFaviconService");
	dlsg("httphandler", "@mozilla.org/network/protocol;1?name=http", "nsIHttpProtocolHandler");
	dlsg("memrm", "@mozilla.org/memory-reporter-manager;1", "nsIMemoryReporterManager");
	dlsg("mime", "@mozilla.org/uriloader/external-helper-app-service;1", "nsIMIMEService");
	dlsg("mimeheader", "@mozilla.org/network/mime-hdrparam;1", "nsIMIMEHeaderParam");
	dlsg("ttsu", "@mozilla.org/intl/texttosuburi;1", "nsITextToSubURI");
	dlsg("uuid", "@mozilla.org/uuid-generator;1", "nsIUUIDGenerator");
	dlsg("wintaskbar", "@mozilla.org/windows-taskbar;1", "nsIWinTaskbar");
	dlsg("clipboardhelper", "@mozilla.org/widget/clipboardhelper;1", "nsIClipboardHelper");

	const Instances = exports.Instances = {};

	// non-init
	itor("XHR", "@mozilla.org/xmlextras/xmlhttprequest;1", "nsIXMLHttpRequest");
	itor("DOMSerializer", "@mozilla.org/xmlextras/xmlserializer;1", "nsIDOMSerializer");
	itor("MimeInputStream", "@mozilla.org/network/mime-input-stream;1", "nsIMIMEInputStream");
	itor("SupportsBool","@mozilla.org/supports-PRBool;1", "nsISupportsPRBool");
	itor("SupportsString","@mozilla.org/supports-string;1", "nsISupportsString");
	itor("SupportsUint32","@mozilla.org/supports-PRUint32;1", "nsISupportsPRUint32");
	itor("Transferable", "@mozilla.org/widget/transferable;1", "nsITransferable");
	itor("UniConverter", "@mozilla.org/intl/scriptableunicodeconverter", "nsIScriptableUnicodeConverter");

	// init
	itor("AsyncStreamCopier", "@mozilla.org/network/async-stream-copier;1","nsIAsyncStreamCopier", "init");
	itor("BinaryInputStream", "@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream", "setInputStream");
	itor("BinaryOutputStream", "@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream", "setOutputStream");
	itor("BufferedOutputStream", "@mozilla.org/network/buffered-output-stream;1", "nsIBufferedOutputStream", "init");
	itor("ConverterOutputStream", "@mozilla.org/intl/converter-output-stream;1", "nsIConverterOutputStream", "init");
	itor("FileInputStream", "@mozilla.org/network/file-input-stream;1", "nsIFileInputStream", "init");
	itor("FileOutputStream", "@mozilla.org/network/file-output-stream;1", "nsIFileOutputStream", "init");
	itor("FilePicker", "@mozilla.org/filepicker;1", "nsIFilePicker", "init");
	itor("InputStreamPump", "@mozilla.org/network/input-stream-pump;1", "nsIInputStreamPump", "init");
	itor("Hash", "@mozilla.org/security/hash;1", "nsICryptoHash", "init");
	itor("LocalFile", "@mozilla.org/file/local;1", "nsILocalFile", "initWithPath");
	itor("Pipe", "@mozilla.org/pipe;1", "nsIPipe", "init");
	itor("Process", "@mozilla.org/process/util;1", "nsIProcess", "init");
	itor("Sound", "@mozilla.org/sound;1", "nsISound", "play");
	itor("ScriptableInputStream", "@mozilla.org/scriptableinputstream;1", "nsIScriptableInputStream", "init");
	itor("ScriptError", "@mozilla.org/scripterror;1", "nsIScriptError", "init");
	itor("StreamListenerTee", "@mozilla.org/network/stream-listener-tee;1", "nsIStreamListenerTee", "init");
	itor("StringInputStream", "@mozilla.org/io/string-input-stream;1", "nsIStringInputStream", "setData");
	itor("Timer", "@mozilla.org/timer;1", "nsITimer", "init");
	itor("ZipReader", "@mozilla.org/libjar/zip-reader;1", "nsIZipReader", "open");

	const {SELF_PATH, BASE_PATH} = (function() {
	let rv;
	try { throw new Error("narf"); }
	catch (ex) {
		rv = {
			SELF_PATH: ex.fileName,
			BASE_PATH: /^(.+\/).*?$/.exec(ex.fileName)[1]
		};
	}
	return rv;
	})();
	exports.BASE_PATH = BASE_PATH;

	var _unloaders = [];
	let _runUnloader = function _runUnloader(fn, args) {
		try {
			fn.apply(null, args);
		}
		catch (ex) {
			try {
				log(LOG_ERROR, "unloader failed " + fn.name, ex);
			}
			catch (iex) {
				reportError(ex);
			}
		}
	}
	exports.unload = function unload(fn) {
		if (fn == "shutdown") {
			if (arguments.length > 1 && arguments[1]) {
				let cancel = new Instances.SupportsBool();
				cancel.data = false;
				Services.obs.notifyObservers(cancel, "DTA:upgrade", null);
				if (cancel.data) {
					log(LOG_INFO, "Not going down right now - vetoed!");
					return;
				}
			}
			for (let i = _unloaders.length; ~(--i);) {
				_runUnloader(_unloaders[i]);
			}
			_unloaders.splice(0);
			return;
		}
		// add an unloader
		if (typeof(fn) != "function") {
			throw new Error("unloader is not a function");
		}
		_unloaders.push(fn);
		return function() {
			_runUnloader(fn, arguments);
			_unloaders = _unloaders.filter(function(c) c != fn);
		};
	}

	const _registry = Object.create(null);
	exports.require = function require(module) {
		module = BASE_PATH + module + ".js";

		// already loaded?
		if (module in _registry) {
			return _registry[module];
		}

		// try to load the module
		let scope = {exports: Object.create(null)};
		try {
			Services.scriptloader.loadSubScript(module, scope);
		}
		catch (ex) {
			log(LOG_ERROR, "failed to load " + module, ex);
			throw ex;
		}

		_registry[module] = scope.exports;

		return scope.exports;
	};
	exports.requireJoined = function requireJoined(where, module) {
		module = require(module);
		for (let [k,v] in Iterator(module)) {
			where[k] = v;
		}
	};
	exports.requireJSM = function requireJSM(mod) {
		let _m = {};
		Cu.import(mod, _m);
		Object.freeze(_m);
		return _m;
	};

	// registry unloader; must be first :p
	unload(function() {
		log(LOG_INFO, "glue going down");
		try {
			let keys = Object.keys(_registry);
			for (let i = keys.length; ~(--i);) {
				delete _registry[keys[i]];
			}
			// unload ourselves
			Cu.unload(SELF_PATH);
		}
		catch (ex) {
			reportError(ex);
		}
	});

	// init autoloaded modules
	const logging = require("logging");
	for (let k of Object.keys(logging)) {
		exports[k] = logging[k];
		exports.EXPORTED_SYMBOLS.push(k);
	}
	const {getExt, setExt, addObserver} = require("preferences");
	const LogPrefObs = {
		observe: function(s,t,d) {
			logging.setLogLevel(getExt("logging") ? logging.LOG_DEBUG : logging.LOG_NONE);
		}
	}
	addObserver("extensions.dta.logging", LogPrefObs);
	LogPrefObs.observe();
	require("version").getInfo(function setupVersion(v) {
		log(LOG_INFO, v.NAME + "/" + v.VERSION + " on " + v.APP_NAME + "/" + v.APP_VERSION + " (" + v.LOCALE + " / " + v.OS + ") ready");
	});
	try {
		require("main").main();
	}
	catch (ex) {
		log(LOG_ERROR, "main failed to run", ex);
	}
})(this);
