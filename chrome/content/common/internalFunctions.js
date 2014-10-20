/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* dTa-only code! - DO NOT include in overlays or such! */
"use strict";
/* jshint browser:true */
/* global _ */
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const ctor = Components.Constructor;
const Exception = Components.Exception;

// shared state defines

Cu.import("chrome://dta-modules/content/glue.jsm", this);
(function() {
	for (let [k,v] in new Iterator(require("constants"))) {
		Object.defineProperty(this, k, {value: v, enumerable:true});
	}
}).call(this);
const Preferences = require("preferences");
const Mediator = require("support/mediator");
const {FilterManager} = require("support/filtermanager");
const {toURI, toURL} = require("support/stringfuncs");
const {unloadWindow} = require("support/overlays");
const DTA = require("api");

function showPreferences(pane, command) Mediator.showPreferences(window, pane, command);
function openUrl(url, ref) Mediator.openUrl(window, url, ref);


const {
	getIcon: getIcon,
	getLargeIcon: _getLargeIcon,
	getFavIcon: _getFavIcon
} = require("support/icons");
const getLargeIcon = (function() {
	const hidpi = window.matchMedia && window.matchMedia("(min-resolution: 2dppx)").matches;
	return function getLargeIcon(f,ml) _getLargeIcon(f,ml, hidpi);
})();
const getFavIcon = (function() {
	const RE_HTML = /html?$|aspx?$|php\d?$|py$|\/[^.]*$/i;
	return function getFavIcon(uri, cb, tp) {
		if (!RE_HTML.test(uri.path)) {
			cb.call(tp, getIcon(uri), false);
			return;
		}
		_getFavIcon(uri, cb, tp);
	};
})();

/**
 * Get DOM Element(s) by Id. Missing ids are silently ignored!
 *
 * @param ids
 *          One of more Ids
 * @return Either the element when there was just one parameter, or an array of
 *         elements.
 */
function $() {
	if (arguments.length === 1) {
		return document.getElementById(arguments[0]);
	}
	let elements = [];
	for (let i = 0, e = arguments.length; i < e; ++i) {
		let element = document.getElementById(arguments[i]);
		if (element) {
			elements.push(element);
		}
		else {
			log(LOG_ERROR, "requested a non-existing element: " + arguments[i]);
		}
	}
	return elements;
}

function $$(query, el) {
	let rv = document.querySelectorAll(query, el || document);
	if (rv.length === 1) {
		return rv[0];
	}
	return Array.map(rv, function(e) e);
}

function $e(name, attrs, ns) {
	let rv;
	if (ns) {
		rv = document.createElementNS(ns, name);
	}
	else {
		rv = document.createElement(name);
	}
	for (let a in (attrs || {})) {
		rv.setAttribute(a, attrs[a]);
	}
	return rv;
}


var Utils = {
	/**
	 * Opens up a directory picker and returns the user selected path.
	 *
	 * @param predefined
	 *          The starting path to display when dialog opens up
	 * @param text The description text to be displayed
	 * @param cb Callback to asynchronously called. The cb is called with a string
	 *           containing the user-selected path - or false if user cancels the
	 *           dialog - as the sole argument
	 */
	askForDir: function(predefined, text, cb) {
		function processResponse(res) {
			if (res === Ci.nsIFilePicker.returnOK) {
				cb(Utils.addFinalSlash(this.file.path));
			}
			else {
				cb(false);
			}
		}
		try {
			predefined = predefined ? predefined.trim() : '';
			let fp = new Instances.FilePicker(window, text, Ci.nsIFilePicker.modeGetFolder);
			fp.appendFilters(Ci.nsIFilePicker.filterAll);

			// locate current directory
			let dest = this.validateDir(predefined);
			if (dest) {
				fp.displayDirectory = dest;
			}

			if ("open" in fp) {
				fp.open({done: processResponse.bind(fp)});
				return;
			}

			// open file picker
			processResponse.call(fp, fp.show());
			return;
		}
		catch (ex) {
			log(LOG_ERROR, "Utils.askForDir():", ex);
		}
		cb(false);
	},
	/**
	 * Performs all the needed controls to see if the specified path is valid, is
	 * creable and writable and his drive has some free disk space.
	 *
	 * @param path The path to test
	 * @return a nsIFile to the specified path if it's valid, false if it
	 *         wasn't
	 */
	validateDir: function(path) {
		let directory = null;
		try {
			if (!(path instanceof Ci.nsIFile)) {
				if (!path || !String(path).trim().length) {
					return false;
				}
				directory = new Instances.LocalFile(path);
			}
			else {
				directory = path.clone();
			}
		}
		catch (ex) {
			log(LOG_ERROR, "Invalid path supplied", ex);
		}
		if (!directory) {
			return false;
		}
		try {
			// look for the first directory that exists.
			let pn = directory.clone();
			while (pn && !pn.exists()) {
				pn = pn.parent;
			}
			if (pn) {
				// from nsIFile
				pn = pn.QueryInterface(Ci.nsIFile);
				// we look for a directory that is writable and has some disk-space
				if (pn.isDirectory() && pn.isReadable() && pn.isWritable()) {
					try {
						return pn.diskSpaceAvailable ? directory : false;
					}
					catch (ex) {
						// Solaris compat: #889
						return directory;
					}
				}
			}
		}
		catch(ex) {
			log(LOG_ERROR, 'Checking permissions threw', ex);
		}
		return false;
	},
	/**
	 * Gets the disk-space available for a nsIFile. Here, because
	 * diskSpaceAvailable requires valid path and/or path to be a directory
	 *
	 * @param file
	 *          Valid nsIFile
	 * @return the disk-space available to the caller
	 * @author Nils
	 */
	getFreeDisk: function(file) {
		while (file) {
			if (file.exists() && file.isDirectory()) {
				try {
					return file.diskSpaceAvailable;
				}
				catch (ex) {
					// Solaris compat: #889
					// As we cannot get a correct value simply return max int64_t
					return 9223372036854775807;
				}
			}
			file = file.parent;
		}
		return 0;
	},
	/**
	 * Play a sound file (if prefs allow to do so)
	 *
	 * @param name
	 *          Name of the sound (corresponding to the pref name and the file
	 *          name of desired sound)
	 */
	playSound: function(name) {

		try {
			if (/linux|sun|bsd|aix|hp|dragonfly|irix|unix/i.test(Services.appinfo.OS) &&
					/64/.test(Services.appinfo.XPCOMABI)) {
				throw new Components.Exception("*nix 64 - freeze problems");
			}

			if (Preferences.getExt("sounds." + name, false)) {
				new Instances.Sound(toURI("chrome://dta/skin/sounds/" + name + ".wav"));
			}
		}
		catch(ex) {
			log(LOG_ERROR, "Playing " + name + " sound failed", ex);
		}
	},

	formatKBytes: function(aNumber, decimalPlace) {
		aNumber = aNumber / 1024;

		if (!isFinite(aNumber)) {
			return 'NaN';
		}
		return _('sizeKB', [aNumber.toFixed(arguments.length > 1 ? decimalPlace : 1)]);
	},

	formatConflictName: function(basename, conflicts) {
		if (!conflicts) {
			return basename;
		}
		let ext = '', pos = basename.lastIndexOf('.');
		if (~pos) {
			ext = basename.slice(pos);
			basename = basename.slice(0, pos);
		}
		return basename + '_' + Utils.formatNumber(conflicts) + ext;
	}
};

(function() {
	function createFormatter(units, scale) {
		const sunits = units;
		const nunits = sunits.length;
		const s = scale;
		return function(val, decimalPlace) {
			var rv = val;
			if (!isFinite(rv)) {
				return 'NaN';
			}
			let i = 0;
			while (rv > s && ++i < nunits) {
				rv /= 1024;
			}
			const unit = sunits[i];
			decimalPlace = arguments.length > 1 ? decimalPlace : unit[1];
			return _(unit[0], [rv.toFixed(decimalPlace)]);
		};
	}
	Utils.formatBytes = createFormatter(
		[['sizeB', 0], ['sizeKB', 1], ['sizeMB', 2], ['sizeGB', 2], ['sizeTB', 3]],
		875);
	Utils.formatSpeed = createFormatter(
		[['sizeBs', 0], ['sizeKBs', 1], ['sizeMBs', 2], ['sizeGBs', 3]],
		1023);
})();

requireJoined(Utils, "utils");
requireJoined(Utils, "support/stringfuncs");

/**
 * Get a (formatted) locale property string.
 *
 * @param stringId
 *          Id of desired string corresponding to the .properties file(s)
 * @param ...
 *          Optional. Format parameters
 * @return String for given Name
 * @throws Exception
 *           if stringID is not found or before the dialog was initialized
 * @author Nils
 */
XPCOMUtils.defineLazyGetter(window, "_", function() {
	let bundles = new Utils.StringBundles(document);
	return function() {
		if (arguments.length === 1) {
			return bundles.getString(arguments[0]);
		}
		return bundles.getFormattedString.apply(bundles, arguments);
	};
});

/**
 * Convert a value into a hash
 *
 * @param data
 *          Data to hash. Either an nsInputStream or String-castable.
 * @param algorithm
 *          Optional. Either a number or a string referring to an nsICryptoHash
 *          function. (default: sha1)
 * @param encoding
 *          Optional. One of: HASH_HEX (0), HASH_BIN(1), HASH_B64 (2) (default:
 *          HASH_HEX)
 * @param datalen
 *          Optional, only for streams. Length of data to hash (default: hash
 *          whole stream)
 * @return A string representing the hash a in given encoding.
 * @author Nils
 */
const HASH_HEX = 0x0;
const HASH_BIN = 0x1;
const HASH_B64 = 0x2;
function hash(value, algorithm, encoding, datalen) {
	var ch = new Instances.PlainHash();
	if (!algorithm) {
		algorithm = ch.SHA1;
	}
	if (!encoding) {
		encoding = HASH_HEX;
	}
	if (typeof(algorithm) === 'string' || algorithm instanceof String) {
		ch.initWithString(algorithm);
	}
	else {
		ch.init(algorithm);
	}
	if (value instanceof Ci.nsIInputStream) {
		ch.updateFromStream(value, datalen > 0 ? datalen : 0xffffffff);
	}
	else {
		Instances.uniconverter.charset = 'utf8';
		value = Instances.uniconverter.convertToByteArray(value, {});
		ch.update(value, value.length);
	}
	var rv = ch.finish(encoding === HASH_B64);
	if (encoding === HASH_HEX) {
		rv = Utils.hexdigest(rv);
	}
	return rv;
}
Object.freeze(Utils);

const mapInSitu = Utils.mapInSitu;
const filterInSitu = Utils.filterInSitu;
const mapFilterInSitu = Utils.mapFilterInSitu;
const filterMapInSitu = Utils.filterMapInSitu;

require("support/iconcheat").loadWindow(window);

const getDefaultDownloadsDirectory = (function() {
	function oldFallback(callback) {
		let dlm = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
		var dir;
		try {
			dir = dlm.userDownloadsDirectory;
		}
		catch (ex) {
			dir = dlm.defaultDownloadsDirectory;
		}
		callback(dir.path);
	}

	try {
		let Downloads = Cu.import("resource://gre/modules/Downloads.jsm", {}).Downloads;
		if (!Downloads.getPreferredDownloadsDirectory) {
			throw new Error("not supported");
		}
		return function newDownloads(callback) {
			var p = Downloads.getPreferredDownloadsDirectory();
			if (!p) {
				oldFallback(callback);
				return;
			}
			p.then(function success(r) {
				callback(r);
			}, function fail(e) {
				oldFallback(callback);
			});
		};
	}
	catch (ex) {
		return oldFallback;
	}
})();

Object.defineProperty(window, "setTimeoutOnlyFun", {
	value: function setTimeoutFun(cb, delay, p1, p2, p3) {
		try {
			if (typeof(cb) !== "function") {
					throw new Error("do not call me with a string! ");
			}
			return window.setTimeout.call(window, cb, delay, p1, p2, p3);
		}
		catch (ex) {
			log(LOG_ERROR, "failed to create timeout", ex);
			throw ex;
		}
	},
	writable: false,
	configurable: false,
	enumerable: true
});
