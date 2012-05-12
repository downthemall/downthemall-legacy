/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const EXPORTED_SYMBOLS = ["require", "lazyRequire", "requireJoined", "unload", "Services", "Instances", "XPCOMUtils"];

const {
	classes: Cc,
	interfaces: Ci,
	utils: Cu,
	results: Cr,
	Constructor: ctor,
	Exception: Exception
} = Components;
const {
	getWeakReference: weak,
	reportError: reportError
} = Cu;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

const lazy = XPCOMUtils.defineLazyGetter;

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
	dlsg("drags", "@mozilla.org/widget/dragservice;1", "nsIDragService");
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

	const Instances = exports.Instances = {};

	// non-init
	itor("XHR", "@mozilla.org/xmlextras/xmlhttprequest;1", "nsIXMLHttpRequest");
	itor("DOMSerializer", "@mozilla.org/xmlextras/xmlserializer;1", "nsIDOMSerializer");
	itor("MimeInputStream", "@mozilla.org/network/mime-input-stream;1", "nsIMIMEInputStream");
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
	itor("Hash", "@mozilla.org/security/hash;1", "nsICryptoHash", "init");
	itor("LocalFile", "@mozilla.org/file/local;1", "nsILocalFile", "initWithPath");
	itor("Pipe", "@mozilla.org/pipe;1", "nsIPipe", "init");
	itor("Process", "@mozilla.org/process/util;1", "nsIProcess", "init");
	itor("Sound", "@mozilla.org/sound;1", "nsISound", "play");
	itor("ScriptableInputStream", "@mozilla.org/scriptableinputstream;1", "nsIScriptableInputStream", "init");
	itor("ScriptError", "@mozilla.org/scripterror;1", "nsIScriptError", "init");
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
			// XXX: transplant new logging infrastructure
			// log(LOG_ERROR, "unloader failed", ex);
		}
	}
	exports.unload = function unload(fn) {
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
	Services.obs.addObserver({
		observe: function SHUTDOWN_observe(s,t,d) {
			Services.obs.removeObserver(this, "xpcom-shutdown");
			for (let i = _unloaders.length; ~(--i);) {
				_runUnloader(_unloaders[i]);
			}
			_unloaders.splice(0);
		}
	}, "xpcom-shutdown", false);

	const _registry = Object.create(null);
	exports.require = function require(module) {
		module = BASE_PATH + module + ".js";

		// already loaded?
		if (module in _registry) {
			return _registry[module];
		}

		// try to load the module
		// log(LOG_DEBUG, "going to load: " + module);
		let scope = {exports: Object.create(null)};
		try {
			Services.scriptloader.loadSubScript(module, scope);
		}
		catch (ex) {
			Cu.reportError(ex);
			// log(LOG_ERROR, "failed to load " + module, ex);
			throw ex;
		}

		_registry[module] = scope.exports;
		// log(LOG_DEBUG, "loaded module: " + module);

		return scope.exports;
	};
	exports.requireJoined = function requireJoined(where, module) {
		module = require(module);
		for (let [k,v] in Iterator(module)) {
			where[k] = v;
		}
	};
	exports.lazyRequire = function lazyRequire(module) {
		function lazyBind(props, prop) {
			//log(LOG_DEBUG, "lazily binding " + props + " for module " + module);
			let m = require(module);
			for (let [,p] in Iterator(props)) {
				delete this[p];
				this[p] = m[p];
			}
			return this[prop];
		};

		// Already loaded?
		if (module in _registry) {
			//log(LOG_DEBUG, "not lazily binding " + module + "; already loaded");
			return _registry[module];
		}

		let props = Array.slice(arguments, 1);
		let rv = {};
		let binder = lazyBind.bind(rv, props);
		for (let [,p] in Iterator(props)) {
			let _p = p;
			lazy(rv, _p, function() binder(_p));
		}
		return rv;
	}

	/* XXX: Reconsider when making restartless
	unload(function() {
	let keys = Object.keys(_registry);
	for (let i = keys.length; ~(--i);) {
		delete _registry[keys[i]];
	}
	// unload ourselves
	Cu.unload(SELF_PATH);
	});*/
})(this);