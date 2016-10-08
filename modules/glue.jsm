/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/* globals Services:true, Instances: true, Cr:true, Cc:true, Ci:true, Cu:true, Cm:true, ctor:true, Exception:true */
/* globals requireJoined:true, weak:true, lazy:true, reportError:true, QI:true, lazyProto:true, LRUMap:true */
/* globals log:true, LOG_DEBUG:true, LOG_INFO:true, LOG_ERROR:true */

var EXPORTED_SYMBOLS = [
	"require",
	"requireJoined",
	"requireJSM",
	"canUnload",
	"unload",
	"weak",
	"lazy",
	"lazyProto",
	"QI",
	"Services",
	"Instances",
	"XPCOMUtils",
	"LRUMap"
	];

//This might be already defined... or not...

var {
	classes: Cc,
	interfaces: Ci,
	utils: Cu,
	results: Cr,
	manager: Cm,
	Constructor: ctor,
	Exception: Exception
} = Components;
Cm.QueryInterface(Ci.nsIComponentRegistrar);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.importGlobalProperties([
	"atob",
	"btoa",
	"Blob",
	"crypto",
	"fetch",
	"File",
	"TextDecoder",
	"TextEncoder",
	"URL",
	"URLSearchParams",
	"XMLHttpRequest",
]);

var weak = Cu.getWeakReference.bind(Cu);
var reportError = Cu.reportError.bind(Cu);
var lazy = XPCOMUtils.defineLazyGetter; // bind?
var QI = XPCOMUtils.generateQI.bind(XPCOMUtils);

var log = function logStub(...args) {
	Cu.reportError(Array.join(args, ", "));
};

var LOG_DEBUG = 0, LOG_INFO = 0, LOG_ERROR = 0;
var Instances;

const DEAD = Symbol();

function canUnload() {
		let cancel = new Instances.SupportsBool();
		cancel.data = false;
		Services.obs.notifyObservers(cancel, "DTA:upgrade", null);
		if (cancel.data) {
			return false;
		}
		return true;
};

var lazyProto = (function() {
	const gdesc = {enumerable: true};
	const vdesc = {enumerable: true};
	return function lazyProto(proto, name, fn) {
		name = name.toString();
		gdesc.get = function() {
			try {
				vdesc.value = fn.call(this);
				Object.defineProperty(this, name, vdesc);
				return vdesc.value;
			}
			catch (ex) {
				log(LOG_ERROR, "lazyProto: " + name, ex);
				throw ex;
			}
		};
		Object.defineProperty(proto, name, gdesc);
	};
})();

class LRUMap extends Map {
	constructor(limit, values) {
		if (!(limit > 1) || (limit !== (limit | 0))) {
			throw new Error("Invalid limit");
		}
		super(values);
		Object.defineProperty(this, "_limit", {value: limit});
	}
	get limit() {
		return this._limit;
	}
	get capacity() {
		return this._limit;
	}
	get free() {
		return this._limit - this.size;
	}

	"set"(key, val) {
		if (this.has(key)) {
			super.delete(key);
			return super.set(key, val);
		}
		if (this.size === this._limit) {
			this.delete(this.keys().next().value);
		}
		return super.set(key, val);
	}
	/**
	 * Serialize to JSON (via JSON.stringify)
	 * Please not that it is serialized to an array containing key/value pairs.
	 * Please note that therefore keys and values need to be serializable with
	 * JSON.
	 * Please note that the limit is not imcluded!
	 */
	toJSON() {
		return Array.from(this.entries());
	}
};
this.LRUMap = LRUMap;

//hide our internals
//Since require() uses .scriptloader, the loaded require scopes will have
//access to the named stuff within this module scope, but we actually want
//them to have access to certain stuff.
(function setup_scope(exports) {
	function itor(name, cls, iface, init) {
		if (init) {
			XPCOMUtils.defineLazyGetter(Instances, name, function() {
				return ctor(cls, iface, init);
			});
			XPCOMUtils.defineLazyGetter(Instances, "Plain" + name, function() {
				return ctor(cls, iface);
			});
		}
		else {
			XPCOMUtils.defineLazyGetter(Instances, name, function() {
				return ctor(cls, iface);
			});
			XPCOMUtils.defineLazyGetter(Instances, name.toLowerCase(), function() {
				return new this[name]();
			});
		}
	}

	/* let */ Services = exports.Services = Object.create(Services);

	Services.oldio = {
		newChannel: function(uri, charset, base, loadInfo) {
			return Services.oldio.newChannelFromURI(
				Services.io.newURI(uri, charset, base),
				loadInfo);
		},
		newChannelFromURI: function(uri, loadInfo) {
			if (Services.io.newChannelFromURIWithLoadInfo && loadInfo) {
				return Services.io.newChannelFromURIWithLoadInfo(uri, loadInfo || null);
			}
			if (Services.io.newChannelFromURI2) {
				return Services.io.newChannelFromURI2(
					uri,
					null,
					Services.sysprincipal,
					Services.sysprincipal,
					Ci.nsILoadInfo.SEC_NORMAL,
					Ci.nsIContentPolicy.TYPE_OTHER
				);
			}
			return Services.io.newChannelFromURI(uri);
		},
		newProxiedChannel: function(uri, proxyInfo, loadInfo) {
			try {
				if (proxyInfo) {
					let handler = Services.io.getProtocolHandler(uri.scheme);
					if (handler instanceof Ci.nsIProxiedProtocolHandler) {
						if ("newProxiedChannel2" in handler) {
							// XXX need to construct a new loadInfo maybe
							return handler.newProxiedChannel2(uri, proxyInfo, 0, null, loadInfo || null);
						}
						return handler.newProxiedChannel(uri, proxyInfo, 0, null);
					}
				}
			}
			catch (ex) {
				log(LOG_ERROR, "Failed to construct a channel the hard way!");
			}
			return Services.oldio.newChannelFromURI(uri, loadInfo);
		}
	};


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
	dlsg("pps", "@mozilla.org/network/protocol-proxy-service;1", "nsIProtocolProxyService");
	dlsg("sysprincipal", "@mozilla.org/systemprincipal;1", "nsIPrincipal");

	Instances = exports.Instances = {};

	// non-init
	itor("DOMSerializer", "@mozilla.org/xmlextras/xmlserializer;1", "nsIDOMSerializer");
	itor("MimeInputStream", "@mozilla.org/network/mime-input-stream;1", "nsIMIMEInputStream");
	itor("SupportsArray","@mozilla.org/supports-array;1", "nsISupportsArray");
	itor("SupportsBool","@mozilla.org/supports-PRBool;1", "nsISupportsPRBool");
	itor("SupportsInt32","@mozilla.org/supports-PRInt32;1", "nsISupportsPRInt32");
	itor("SupportsInterfacePointer","@mozilla.org/supports-interface-pointer;1", "nsISupportsInterfacePointer");
	itor("SupportsString","@mozilla.org/supports-string;1", "nsISupportsString");
	itor("SupportsUint32","@mozilla.org/supports-PRUint32;1", "nsISupportsPRUint32");
	itor("Transferable", "@mozilla.org/widget/transferable;1", "nsITransferable");
	itor("UniConverter", "@mozilla.org/intl/scriptableunicodeconverter", "nsIScriptableUnicodeConverter");

	// init
	itor("AsyncStreamCopier", "@mozilla.org/network/async-stream-copier;1","nsIAsyncStreamCopier", "init");
	itor("AsyncStreamCopier2", "@mozilla.org/network/async-stream-copier;1","nsIAsyncStreamCopier2", "init");
	itor("BinaryInputStream", "@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream", "setInputStream");
	itor("BinaryOutputStream", "@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream", "setOutputStream");
	itor("BufferedOutputStream", "@mozilla.org/network/buffered-output-stream;1", "nsIBufferedOutputStream", "init");
	itor("ConverterOutputStream", "@mozilla.org/intl/converter-output-stream;1", "nsIConverterOutputStream", "init");
	itor("FileInputStream", "@mozilla.org/network/file-input-stream;1", "nsIFileInputStream", "init");
	itor("FileOutputStream", "@mozilla.org/network/file-output-stream;1", "nsIFileOutputStream", "init");
	itor("FilePicker", "@mozilla.org/filepicker;1", "nsIFilePicker", "init");
	itor("InputStreamPump", "@mozilla.org/network/input-stream-pump;1", "nsIInputStreamPump", "init");
	itor("Hash", "@mozilla.org/security/hash;1", "nsICryptoHash", "init");
	itor("LocalFile", "@mozilla.org/file/local;1", "nsIFile", "initWithPath");
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
	};
	const _registry = new Map();
	let _upgrade = null;
	const shutdown = function(...args) {
		if (args.length && args[0]) {
			if (!canUnload()) {
				log(LOG_INFO, "Not going down right now - vetoed!");
				return;
			}
		}

		if (_upgrade) {
			log(LOG_INFO, "Opting to install pending update");
			_upgrade.install();
			return;
		}

		for (let i = _unloaders.length; ~(--i);) {
			_runUnloader(_unloaders[i]);
		}
		_unloaders.length = 0;
		let re = Cu.reportError.bind(Cu);
		let ns = Cu.nukeSandbox.bind(Cu);
		let nukeDelayed = (p, scope) => {
			p.then(function() {
				ns(scope);
			}, function(ex) {
				re(ex);
				ns(scope);
			});
		};
		for (let r of _registry.keys()) {
			try {
				let scope = _registry.get(r);
				if (scope.asyncShutdown) {
					let p = scope.asyncShutdown();
					if (p && p.then) {
						nukeDelayed(p, scope);
						continue;
					}
				}
				ns(scope);
			}
			catch (ex) {}
		}
		for (let r of _registry.keys()) {
			_registry.delete(r);
		}
		try {
			_registry.clear();
		}
		catch (ex) {}

		// Unload ourself
		Cu.unload(SELF_PATH);
		return;
	};
	exports.unload = function unload(fn, ...args) {
		if (fn === "shutdown") {
			return shutdown(args.unshift());
		}
		if (fn === "eventual-shutdown") {
			_upgrade = args.shift();
			return;
		}

		// add an unloader
		if (typeof(fn) !== "function") {
			throw new Error("unloader is not a function");
		}
		_unloaders.push(fn);
		return function() {
			_runUnloader(fn, arguments);
			_unloaders = _unloaders.filter(c => c !== fn);
		};
	};

	const require_prefixes = new Map();
	require_prefixes.set(undefined, BASE_PATH);
	require_prefixes.set(null, BASE_PATH);
	require_prefixes.set("testsupport", BASE_PATH + "tests/");

	const loadScript = (() => {
		if (Services.scriptloader.loadSubScriptWithOptions) {
			return (module, scope) => {
				return Services.scriptloader.loadSubScriptWithOptions(module, {charset: "utf-8", target: scope});
			};
		}
		return (module, scope) => {
			try {
				return Services.scriptloader.loadSubScript(module, scope, "utf-8");
			}
			catch (ex) {
				return Services.scriptLoader.loadSubScript(module, scope);
			}
		};
	})();

	let requireJoined;
	const require = function require(base, module) {
		let path = module.split("/").filter(e => !!e);
		if (!path || !path.length) {
			throw new Error("Invalid module path");
		}
		if (path[0] === "." || path[0] === "..") {
			path = base.split("/").filter(e => !!e).concat(path);
		}
		for (let i = path.length - 2; i >= 0; --i) {
			if (path[i] === ".") {
				path.splice(i, 1);
				continue;
			}
			if (path[i] !== "..") {
				continue;
			}
			if (i === 0) {
				throw new Error("Invalid traversal");
			}
			path.splice(i - 1, 2);
		}
		let file = path.pop();
		if (file === ".." || file === ".") {
			throw new Error("Invalid traversal");
		}
		base = path.join("/");
		let id = (!!base && [base, file].join("/")) || file;

		let prefix;
		if (path.length) {
			prefix = require_prefixes.get(path[0]);
			if (prefix) {
				path.shift();
			}
		}
		if (!prefix) {
			prefix = require_prefixes.get();
		}
		if (prefix) {
			path.unshift(prefix.replace(/\/$/, ""));
		}
		path.push(file);
		module = path.join("/") + ".js";

		// already loaded?
		let scope = _registry.get(module);
		if (scope) {
			return (scope.module && scope.module.exports) || scope.exports;
		}

		// try to load the module
		scope = Object.create(exports);
		scope.exports = Object.create(null);
		scope.require = require.bind(null, base);
		scope.requireJoined = requireJoined.bind(null, base);
		scope.module = {
			exports: scope.exports,
			loaded: false,
			require: scope.require
			};
		Object.defineProperty(scope.module, "id", {
			value: id,
			enumerable: true
		});
		Object.defineProperty(scope.module, "relid", {
			value: "./" + file,
			enumerable: true
		});
		Object.defineProperty(scope.module, "uri", {
			value: module,
			enumerable: true
		});

		try {
			scope = Cu.Sandbox(Services.sysprincipal, {
				sandboxName: module,
				sandboxPrototype: scope,
				wantXRays: false
			});

			// Add to registry write now to enable resolving cyclic dependencies.
			_registry.set(module, scope);
			try {
				loadScript(module, scope);
				if (!("exports" in scope) || !scope.exports) {
					throw new Error("Invalid exports in module");
				}
			}
			catch (ex) {
				// Don't get half-loaded modules around!
				_registry.delete(module);
				throw new Error(
					"Failed to load module " + id + " from: " + module + "\n" + (ex.message || ex.toString()),
					ex.fileName || ex.filename,
					ex.lineNumber  || ex.linenumber || ex.lineno
					);
			}
		}
		catch (ex) {
			log(LOG_ERROR, "failed to load " + module, ex);
			throw ex;
		}

		scope.module.loaded = true;
		_registry.set(module, scope);

		return (scope.module && scope.module.exports) || scope.exports;
	};

	requireJoined = function requireJoined(base, where, module) {
		module = require(base, module);
		for (let k of Object.getOwnPropertyNames(module)) {
			Object.defineProperty(where, k, Object.getOwnPropertyDescriptor(module, k));
		}
	};

	exports.require = require.bind(null, "");
	exports.requireJoined = requireJoined.bind(null, "");

	exports.requireJSM = function requireJSM(mod) {
		let _m = {};
		Cu.import(mod, _m);
		Object.freeze(_m);
		return _m;
	};

	// init autoloaded modules
	const logging = exports.require("logging");
	for (let k of Object.keys(logging)) {
		exports[k] = logging[k];
		exports.EXPORTED_SYMBOLS.push(k);
	}
	const {getExt, setExt, addObserver} = exports.require("preferences");
	const LogPrefObs = {
		observe: function(s,t,d) {
			logging.setLogLevel(getExt("logging") ? logging.LOG_DEBUG : logging.LOG_NONE);
		}
	};
	addObserver("extensions.dta.logging", LogPrefObs);
	LogPrefObs.observe();
	exports.require("version").getInfo(function setupVersion(v) {
		log(
			LOG_INFO,
			`${v.NAME}/${v.VERSION} on ${v.APP_NAME}/${v.APP_VERSION} (${v.LOCALE}/${v.OS}) ready`
			);
	});
	try {
		exports.require("main").main();
	}
	catch (ex) {
		log(LOG_ERROR, "main failed to run", ex);
	}
})(this);
