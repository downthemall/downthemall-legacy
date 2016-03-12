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
 * The Original Code is DownThemAll.
 *
 * The Initial Developers of the Original Code are
 * Federico Parodi and Stefano Verna
 * Portions created by the Initial Developer are Copyright (C) 2004
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Federico Parodi <jimmy2k@gmail.com>
 *   Stefano Verna <stefano.verna@gmail.com>
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

/* dTa-only code! - DO NOT include in overlays or such! */

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;
var ctor = Components.Constructor;
var Exception = Components.Exception;

var FileFactory = new ctor('@mozilla.org/file/local;1', 'nsILocalFile', 'initWithPath');
var SoundFactory = new ctor('@mozilla.org/sound;1', 'nsISound', 'play');
var CryptoHash = new ctor("@mozilla.org/security/hash;1", "nsICryptoHash");
	
// shared state defines

Cu.import("resource://dta/constants.jsm", this);

var DTA = {
	showPreferences: function(pane) DTA.Mediator.showPreferences(window, pane)
};
Cu.import("resource://dta/api.jsm", DTA);

function openUrl(url, ref) DTA.Mediator.openUrl(window, url, ref);

var Debug = DTA.Debug;
var Preferences = DTA.Preferences;

Cu.import("resource://dta/support/icons.jsm");

/**
 * Get DOM Element(s) by Id. Missing ids are silently ignored!
 * 
 * @param ids
 *          One of more Ids
 * @return Either the element when there was just one parameter, or an array of
 *         elements.
 */
function $() {
	if (arguments.length == 1) {
		return document.getElementById(arguments[0]);
	}
	let elements = [];
	for (let i = 0, e = arguments.length; i < e; ++i) {
		let element = document.getElementById(arguments[i]);
		if (element) {
			elements.push(element);
		}
		else {
			Debug.log("requested a non-existing element: " + arguments[i]);
		}
	}
	return elements;
}

var Utils = {
	/**
	 * Opens up a directory picker and returns the user selected path.
	 * 
	 * @param predefined
	 *          The starting path to display when dialog opens up
	 * @text text The description text to be displayed
	 * @return A string containing the user selected path, or false if user
	 *         cancels the dialog.
	 */
	FilePicker: Components.Constructor('@mozilla.org/filepicker;1', 'nsIFilePicker', 'init'),
	askForDir: function (predefined, text) {
		try {
			// nsIFilePicker object
			predefined = predefined ? predefined.trim() : '';
			let nsIFilePicker = Ci.nsIFilePicker;
			let fp = new Utils.FilePicker(window, text, nsIFilePicker.modeGetFolder);
			fp.appendFilters(nsIFilePicker.filterAll);
		
			// locate current directory
			let dest = this.validateDir(predefined);
			if (dest) {
				fp.displayDirectory = dest;
			}
		
			// open file picker
			let res = fp.show();
	
			if (res == nsIFilePicker.returnOK) {
				return fp.file.path.addFinalSlash();
			}
		}
		catch (ex) {
			Debug.log("Utils.askForDir():", ex);
		}
		return false;
	},
	/**
	 * Performs all the needed controls to see if the specified path is valid, is
	 * creable and writable and his drive has some free disk space.
	 * 
	 * @param path
	 *          The path to test
	 * @return a nsILocalFile to the specified path if it's valid, false if it
	 *         wasn't
	 */
	validateDir: function(path) {
		let directory = null;
		try {
			if (!(path instanceof Ci.nsILocalFile)) {
				if (!path || !String(path).trim().length) {
					return false;
				}
				directory = new FileFactory(path);
			}
			else {
				directory = path.clone();
			}
		}
		catch (ex) {
			Debug.log("Invalid path supplied", ex);
		}
		if (!directory) {
			return false;
		}
		try {
			// look for the first directory that exists.
			let parent = directory.clone();
			while (parent && !parent.exists()) {
				parent = parent.parent;
			}
			if (parent) {
				// from nsIFile
				parent = parent.QueryInterface(Ci.nsILocalFile);
				// we look for a directory that is writable and has some disk-space
				if (parent.isDirectory() && parent.isReadable() && parent.isWritable()) {
					try {
						return parent.diskSpaceAvailable ? directory : false;
					}
					catch (ex) {
						// Solaris compat: #889
						return directory;
					}
				}
			}
		}
		catch(ex) {
			Debug.log('Checking permissions threw', ex);
		}
		return false;
	},
	/**
	 * Gets the disk-space available for a nsILocalFile. Here, because
	 * diskSpaceAvailable requires valid path and/or path to be a directory
	 * 
	 * @param file
	 *          Valid nsILocalFile
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
			var xulRuntime = Components.classes["@mozilla.org/xre/app-info;1"]
				.getService(Ci.nsIXULRuntime);
			if (/linux|sun|bsd|aix|hp|dragonfly|irix/i.test(xulRuntime.OS) && /64/.test(xulRuntime.XPCOMABI)) {
				throw new Components.Exception("*nix 64 - freeze problems");
			}
			
			if (Preferences.getExt("sounds." + name, false)) {
				new SoundFactory(("chrome://dta/skin/sounds/" + name + ".wav").toURI());
			}
		}
		catch(ex) {
			Debug.log("Playing " + name + " sound failed", ex);
		}
	},

	formatKBytes: function U_formatKBytes(aNumber, decimalPlace) {
		aNumber = Number(aNumber) / 1024;
		
		if (!isFinite(aNumber)) {
			return 'NaN';
		}
		return _('sizeKB', [aNumber.toFixed(arguments.length > 1 ? decimalPlace : 1)]);
	},

	formatConflictName: function U_formatConflictName(basename, conflicts) {
		if (!conflicts) {
			return basename;
		}
		let ext = '', pos = basename.lastIndexOf('.');
		if (pos != -1) {
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
			val = Number(val);
			if (!isFinite(val)) {
				return 'NaN';
			}
			let unit = sunits[0];
			for (let i = 1; val > s && i < nunits; ++i) {
				val /= 1024;
				unit = sunits[i];
			}
			decimalPlace = arguments.length > 1 ? decimalPlace : unit[1];
			return _(unit[0], [val.toFixed(decimalPlace)]);			
		}
	}
	Utils.formatBytes = createFormatter([['sizeB', 0], ['sizeKB', 1], ['sizeMB', 2], ['sizeGB', 2], ['sizeTB', 3]], 875);
	Utils.formatSpeed = createFormatter([['sizeBs', 0], ['sizeKBs', 1], ['sizeMBs', 2], ['sizeGBs', 3]], 1023);
})();

Components.utils.import('resource://dta/utils.jsm', Utils);
var SYSTEMSLASH = Utils.SYSTEMSLASH;


//XXX Copy from utils.jsm
//XXX Cannot use directly; yields NS_ERROR_INVALID_VALUE then
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
		Debug.log(aName);
		Debug.log(ex);
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
				Debug.log(ex);
				Debug.log(contract);
				Debug.log(iface);
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
 * returns a new UUID in string representation
 * @return String UUID
 */
setNewGetter(this, "newUUIDString", function() {
	let uuidgen = Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator);
	return function() {
		return uuidgen.generateUUID().toString();
	};
});

ServiceGetter(this, "IOService", "@mozilla.org/network/io-service;1", "nsIIOService2");

Utils.extendString(String);

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
setNewGetter(this, "_", function() {
	let bundles = new Utils.StringBundles(document);
	return function() {
		if (arguments.length == 1) {
			return bundles.getString(arguments[0]);
		}
		return bundles.getFormattedString.apply(bundles, arguments);
	} 
});

InstanceGetter(this, "converter", "@mozilla.org/intl/scriptableunicodeconverter", "nsIScriptableUnicodeConverter");

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
var HASH_HEX = 0x0;
var HASH_BIN = 0x1;
var HASH_B64 = 0x2;
function hash(value, algorithm, encoding, datalen) {
	var ch = new CryptoHash();
	if (!algorithm) {
		algorithm = ch.SHA1;
	}
	if (!encoding) {
		encoding = HASH_HEX;
	}
	if (typeof(algorithm) == 'string' || algorithm instanceof String) {
		ch.initWithString(algorithm);
	} 
	else {
		ch.init(algorithm);
	}
	if (value instanceof Ci.nsIInputStream) {
		datalen = Number(datalen);
		ch.updateFromStream(value, datalen > 0 ? datalen : 0xffffffff);
	}
	else {
		converter.charset = 'utf8';		
		value = converter.convertToByteArray(Utils.atos(value), {});
		ch.update(value, value.length);
	}
	var rv = ch.finish(encoding == HASH_B64);
	if (encoding == HASH_HEX) {
		rv = Utils.hexdigest(rv);
	}
	return rv;
}

(function() {
	let _ic = {};
	Cu.import("resource://dta/support/iconcheat.jsm", _ic);
	_ic.loadWindow(window);
})();

var getDefaultDownloadsDirectory = (function() {
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
