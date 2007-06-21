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
 *   Federico Parodi
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

var Debug = DTA_debug;
var Preferences = DTA_preferences;

const SYSTEMSLASH = (DTA_profileFile.get('dummy').path.indexOf('/') != -1) ? '/' : '\\';

// shared state defines
const QUEUED =    0;
const PAUSED =    1<<1;
const RUNNING =   1<<2;
const FINISHING = 1<<3;
const COMPLETE =  1<<4;
const CANCELED =  1<<5;
/**
 * cast non-strings to string
 * @author Nils
 * @param Arbitrary data
 * @return a string
 */
function _atos(data) {
	if (typeof(data) == 'string') {
		return data;
	}
	if (data instanceof String) {
		// unbox
		return String(data);
	}
	
	if (typeof(data) == 'object') {
		return data.toSource();
	}
	
	return String(data);
}

/**
 * Get DOM Element(s) by Id. Missing ids are silently ignored!
 * @param ids One of more Ids
 * @return Either the element when there was just one parameter, or an array of elements.
 */
function $() {
	if (arguments.length == 1) {
		return document.getElementById(arguments[0]);
	}
	var elements = [];
	for (var i = 0, e = arguments.length; i < e; ++i) {
		var id = arguments[i];
		var element = document.getElementById(id);
		if (element) {
			elements.push(element);
		}
		else {
			Debug.dump("requested a non-existing element: " + id);
		}
	}
	return elements;
}

function merge(me, that) {
	for (let c in that) {
		me[c] = that[c];
	}
}

	// not instanceof save, you know ;)
function clone(obj) {
	{
		var rv = {};
		merge(rv, obj);
		rv.prototype = this.prototype;
    rv.constructor = this.constructor;
		return rv;
	}
}
merge(
	String.prototype,
	{ 
		trim : function() {
			return this.replace(/^[\s\t]+|[\s\t]+$/gi, "");
		},
		removeBadChars : function() {
			return this
				.replace(/[\?\:<>\*\|"]/g, "_")
				.replace(/%(?:25)?20/g, " ");
		},
		addFinalSlash : function() {
			if (this.length == 0) return new String(SYSTEMSLASH);
			
			if (this[this.length - 1] != SYSTEMSLASH)
				return this + SYSTEMSLASH;
			else
				return this;
		},
		removeFinalChar : function(c) {
			if (this.length == 0) {
				return this;
			}
			if (this[this.length - 1] == c) {
				return this.substring(0, this.length - 1);
			}
			return this;
		},
		removeLeadingChar : function(c) {
			if (this.length == 0) {
				return this;
			}
			if (this[0] == c) {
				return this.slice(1);
			}
			return this;
		},
		removeFinalSlash : function() {
			return this.removeFinalChar(SYSTEMSLASH);
		},
		removeLeadingSlash : function() {
			return this.removeLeadingChar(SYSTEMSLASH);
		},
		removeFinalBackSlash : function() {
			return this.removeFinalChar("/");
		},
		removeLeadingBackSlash : function() {
			return this.removeLeadingChar("/");
		},
		getUsableFileName : function() {
			var t = this.replace(/\?.*$/g, '').trim().removeFinalBackSlash().split("/");
			return t[t.length-1].removeBadChars().replace(/[\\/]/g, "").trim();
		},
		getExtension : function() {
			var name = this.getUsableFileName();
			var c = name.lastIndexOf('.');
			if (c == -1) {
				return null;
			}
			return name.slice(c+1);
		},
		cropCenter : function(newLength) {
			if (this.length > newLength) {
				return this.substring(0, newLength / 2) + "..." + this.substring(this.length - newLength / 2, this.length);
			}
			return this;
		}
	}
);

var Utils = {
	/**
	 * Opens up a directory picker and returns the user selected path.
	 * @param predefined The starting path to display when dialog opens up
	 * @text text The description text to be displayed
	 * @return A string containing the user selected path, or false if user cancels the dialog.
	 */
	askForDir: function (predefined, text) {
		try {
			// nsIFilePicker object
			var nsIFilePicker = Components.interfaces.nsIFilePicker;
			var fp = Components.classes['@mozilla.org/filepicker;1'].createInstance(nsIFilePicker);
			fp.init(window, text, nsIFilePicker.modeGetFolder);
			fp.appendFilters(nsIFilePicker.filterAll);
		
			// locate current directory
			var dest = this.validateDir(predefined);
			if (dest) {
				fp.displayDirectory = dest;
			}
		
			// open file picker
			var res = fp.show();
	
			if (res == nsIFilePicker.returnOK) {
				return fp.file.path.addFinalSlash();
			}
		}
		catch (ex) {
			Debug.dump("Utils.askForDir():", ex);
		}
		return false;
	},
	/**
	 * Performs all the needed controls to see if the specified path is valid, is creable and writable and his drive has some free disk space.	
	 * @param path The path to test
	 * @return a nsILocalFile to the specified path if it's valid, false if it wasn't
	 */
	validateDir: function(path) {
		var directory = null;
		if (!(path instanceof Components.interfaces.nsILocalFile)) {
			if (!path || !String(path).trim().length) {
				return false;
			}
			var directory = Components.classes["@mozilla.org/file/local;1"].
			createInstance(Components.interfaces.nsILocalFile);
			try {
				directory.initWithPath(path);
			}
			catch (ex) {
				//
			}
		}
		else {
			directory = path.clone();
		}
		if (directory) {
			try {
				// look for the first directory that exists.
				var parent = directory.clone();
				while (parent && !parent.exists()) {
					parent = parent.parent;
				}
				if (parent) {
					// from nsIFile
					parent = parent.QueryInterface(Components.interfaces.nsILocalFile);
					// we look for a directory that is writeable and has some diskspace
					return parent.isDirectory() && parent.isWritable() && parent.diskSpaceAvailable ? directory : false;
				}
			}
			catch(ex) {
				Debug.dump('Utils.validateDir()', ex);
			}
		}
		return false;
	},
	/**
	 * Play a sound file (if prefs allow to do so)
	 * @param name Name of the sound (correpsonding to the pref name and the file name of desired sound)
	 */
	playSound: function(name) {
		try {
			if (Preferences.getDTA("sounds." + name, false)) {
				var sound = Components.classes["@mozilla.org/sound;1"]
					.createInstance(Ci.nsISound);
				var uri = Cc['@mozilla.org/network/standard-url;1']
					.createInstance(Ci.nsIURI);
				uri.spec = "chrome://dta/skin/sounds/" + name + ".wav";
				sound.play(uri); 
			}
		}
		catch(ex) {
			Debug.dump("Playing " + name + " sound failed", ex);
		}
	},
	/**
	 * returns a numeric timestamp
	 * @param date Optional. DateString to get stamp for. NOW if ommitted
	 * @return Numeric timestamp
	 * @author Nils
	*/
	getTimestamp: function(str) {
		if (!str) {
			return Date.now();
		}
		if (typeof(str) != 'string' && !(str instanceof String)) {
			throw new Error("not a string");
		}
		var rv = Date.parse(str);
		if (!isFinite(rv)) {
			throw new Error("invalid date");
		}
		return rv;
	},

	/**
	 * returns a formated representation of a (file) size
	 * @param aNumber The number to format
	 * @author Nils
	 */
	formatBytes: function U_formatBytes(aNumber) {
		aNumber = Number(aNumber);
	
		if (aNumber < 1024) {
			return aNumber.toFixed(0) + " b";
		}
		
		var units = ['TB','GB','MB','KB'];
		var unit;
		
		while (aNumber > 875 && units.length) {
			aNumber /= 1024;
			unit = units.pop();
		}
		
		return aNumber.toFixed(2) + " " + unit;
	},
	
	/**
	 * returns a pretty number containing at least specified number of digits
	 * @param aNumber the number to format
	 * @param aDigists Optional. Number of digits the result must at least have
	 * @author Nils
	 */
	formatNumber: function U_formatNumber(rv, digits) {
		rv = _atos(rv);
		if (typeof(digits) != 'number') {
			digits = 3;
		}
		while (rv.length < digits) {
			rv = '0' + rv;
		}
		return rv;
	},
	/**
	 * formats a time-delta. At least minutes and seconds are given back
	 */
	formatTimeDelta: function U_formatTimeDelta(aDelta) {
		var h = Math.floor(aDelta / 3600);
		var m = Math.floor((aDelta % 3600) / 60);
		var s = Math.floor(aDelta % 60);
		if (h) {
			return this.formatNumber(h, 2) + ":" + this.formatNumber(m, 2) + ":" + this.formatNumber(s, 2);
		}
		return this.formatNumber(m, 2) + ":" + this.formatNumber(s, 2);
	}
};

var _getIcon = function() {
	if (navigator.platform.search(/mac/i) != -1) {
		const _getIcon_recognizedMac = /\.(?:gz|zip|gif|jpe?g|jpe|mp3|pdf|avi|mpe?g)$/i;
		return function (url, size) {
			var uri = Components.classes["@mozilla.org/network/standard-url;1"]
				.createInstance(Components.interfaces.nsIURI);
			uri.spec = url;
			if (uri.path.search(_getIcon_recognizedMac) != -1) {
				return "moz-icon://" + url + "?size=" + size;
			}
			return "moz-icon://foo.html?size=" + size;
		};
	}
	return function _getIconOther(url, size) {
			return "moz-icon://" + url + "?size=" + size; 
	};
};
_getIcon = _getIcon();

/**
 * Get the icon URI corresponding to an URI (special mac handling)
 * @author Nils
 * @author Stefano
 * @param link Some sort of DTA_URL, nsIURI or string to get the icon for
 * @param metalink Is it a metalink?
 * @param size The desired iconsize;
 * @return String containing the icon URI
 */
function getIcon(link, metalink, size) {
	if (metalink) {
		return "chrome://dta/skin/icons/metalink.png";
	}
	if (typeof(size) != 'number') {
		size = 16;
	}
	try {
		var url;
		if (link instanceof DTA_URL) {
			url = link.url;
		}
		else if (link instanceof Components.interfaces.nsIURI) {
			url = link.spec;
		}
		else if (link && link.url) {
			url = link.url;
		}
		else {
			url = _atos(link);
		}
		return _getIcon(url, size);
	}
	catch (ex) {
		Debug.dump("updateIcon: failed to grab icon", ex);
	}
	return "moz-icon://foo.html?size=" + size;
}

/**
 * Tiny helper to "convert" given object into a weak observer. Object must still implement .observe()
 * @author Nils
 * @param obj Object to convert
 */
function makeObserver(obj) {
	// nsiSupports
	obj.__QueryInterface = obj.QueryInterface;
	obj.QueryInterface = function(iid) {
		if (
			iid.equals(Components.interfaces.nsISupports)
			|| iid.equals(Components.interfaces.nsISupportsWeakReference)
			|| iid.equals(Components.interfaces.nsIWeakReference)
			|| iid.equals(Components.interfaces.nsiObserver)
		) {
			return this;
		}
		if (this.__QueryInterface) {
			return this.__QueryInterface(iid);
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	};
	// nsiWeakReference
	obj.QueryReferent = function(iid) {
		return this;
	};
	// nsiSupportsWeakReference
	obj.GetWeakReference = function() {
		return this;
	};	
}

/**
 * Encapulates all stringbundles of the current document and provides unified access
 * @author Nils
 * @see _
 */
function StringBundles() {
	this.init();
}
StringBundles.prototype = {
	_bundles: [],
	_length: 0,
	init: function() {
		this._bundles = document.getElementsByTagName('stringbundle');
		this._length = this._bundles.length;
	},
	getString: function(id) {
		for (var i = 0, e = this._length; i < e; ++i) {
			try {
				return this._bundles[i].getString(id);
			}
			catch (ex) {
				// no-op
			}
		}
		throw new Components.Exception('BUNDLE STRING NOT FOUND (' + id + ')');
	},
	getFormattedString: function(id, params) {
		for (var i = 0, e = this._length; i < e; ++i) {
			try {
				return this._bundles[i].getFormattedString(id, params);
			}
			catch (ex) {
				// no-op
			}
		}
		throw new Components.Exception('BUNDLE STRING NOT FOUND (' + id + ')');	 
	}
};
/**
 * Get a (formatted) locale property string. Initialize with make_() once DOM available. Will use all Document-wide Stringbundles.
 * @param stringId Id of desired string corresponding to the .properties file(s)
 * @param ... Optional. Format parameters
 * @return String for given Name
 * @throws Exception If stringID is not found or before make_() was called.
 * @author Nils
 * @see make_
 */
var _;

/**
 * Initialize the _() l10n helper. Accounts all stringbundles in current document.
 * @author Nils
 * @see _
 * @see StringBundles
 */
function make_() {
	var bundles = new StringBundles();
	_ = function() {
		if (arguments.length == 1) {
			return bundles.getString(arguments[0]);
		}
		return bundles.getFormattedString.apply(bundles, arguments);
	}
}

/**
 * Constructor helper for nsILocalFile
 */
const FileFactory = new Components.Constructor(
	"@mozilla.org/file/local;1",
	"nsILocalFile",
	"initWithPath"
);

/**
 * XP compatible reveal/launch
 * @author Nils (derived from DownloadManager code)
 */
var OpenExternal = {
	_io: Components.classes['@mozilla.org/network/io-service;1']
		.getService(Components.interfaces.nsIIOService),
	_proto: Components.classes['@mozilla.org/uriloader/external-protocol-service;1']
		.getService(Components.interfaces.nsIExternalProtocolService),
	_prepare: function(file) {
		if (file instanceof Components.interfaces.nsILocalFile) {
			return file;
		}
		else if (typeof(file) == 'string') {
			return new FileFactory(file);
		}
		throw new Components.Exception('OpenExternal: feed me with nsILocalFile or String');
	},
	_nixLaunch: function(file) {
		this._proto.loadUrl(this._io.newFileURI(file));	 
	},
	/**
	 * Launch/Execute a file
	 * @param nsILocalFile/String pointing to the desired file
	 */
	launch: function(file) {
		file = this._prepare(file);
		try {
			file.launch();
		}
		catch (ex) {
			// *nix will throw as not implemented
			this._nixLaunch(file);
		}
	},
	/**
	 * Reveal a file, which will open the directory and furthermore select the file on some platforms.
	 * @param nsILocalFile/String pointing to the desired file
	 */
	reveal: function(file) {
		file = this._prepare(file);
		
		try {
			if (!file.exists()) {
				file.parent.QueryInterface(Components.interfaces.nsILocalFile).launch();
			}
			else {
				file.reveal();
			}
		}
		catch (ex) {
			if (file.parent.exists()) {
				this._nixLaunch(file.parent);
			}
		}
	}
};

/**
 * Range generator (python style). Difference: step direction is inialized accordingly if corresponding parameter is omitted.
 * @param start Optional. Start value (default: 0)
 * @param stop Stop value (exclusive)
 * @param step Optional. Step value (default: 1/-1)
 * @author Nils
 */
function range() {
	if (arguments.length == 0) {
		throw Components.results.NS_ERROR_INVALID_ARG;
	}
	var start = 0, stop = Number(arguments[0]), step;
	if (arguments.length >= 2) {
		start = stop;
		stop = Number(arguments[1]);
	}
	if (arguments.length >= 3) {
		step = Number(arguments[2]);
	}
	else {
		step = stop - start > 0 ? 1 : -1; 
	}
	if (!isFinite(start) || !isFinite(stop) || !isFinite(step) || step == 0) {
		throw Components.results.NS_ERROR_INVALID_ARG;
	}
	if ((stop - start) / step < 0) {
		// negative range
		return;
	}
	stop += (stop - start) % step;
	for (;start != stop; start += step) {
		yield start;
	}
}

/**
 * Convert string-castable data int a hexdigest string
 * @param data String-castable data to hash
 * @return The hex digest of given data
 * @author Nils (derived from dmo example)
 */
function hexdigest(data) {
	data = _atos(data);
	// range is required as we extended String
	return [("0" + data.charCodeAt(i).toString(16)).slice(-2) for (i in range(data.length))].join("");	
}

/**
 * Convert a value into a hash
 * @param data Data to hash. Either an nsInputStream or String-castable.
 * @param algorithm Optional. Either a number or a string referring to an nsICryptoHash function. (default: sha1)
 * @param encoding Optional. One of: HASH_HEX (0), HASH_BIN(1), HASH_B64 (2) (default: HASH_HEX)
 * @param datalen Optional, only for streams. Length of data to hash (default: hash whole stream)
 * @return A string representing the hash a in given encoding.
 * @author Nils
 */
const HASH_HEX = 0x0;
const HASH_BIN = 0x1;
const HASH_B64 = 0x2;
function hash(value, algorithm, encoding, datalen) {
	var ch = Components.classes["@mozilla.org/security/hash;1"]
		.createInstance(Components.interfaces.nsICryptoHash);
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
	if (value instanceof Components.interfaces.nsIInputStream) {
		datalen = Number(datalen);
		ch.updateFromStream(value, datalen > 0 ? datalen : 0xffffffff);
	}
	else {
		var converter =
			Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].
			createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
		converter.charset = 'utf8';
		
		value = converter.convertToByteArray(_atos(value), {});
		ch.update(value, value.length);
	}
	var rv = ch.finish(encoding == HASH_B64);
	if (encoding == HASH_HEX) {
		rv = hexdigest(rv);
	}
	return rv;
}

/**
 * returns a new UUID in string representation
 * @return String UUID
 * @author Nils
 */
function newUUIDString() {
	return Components.classes["@mozilla.org/uuid-generator;1"]
		.getService(Components.interfaces.nsIUUIDGenerator)
		.generateUUID()
		.toString();
}
