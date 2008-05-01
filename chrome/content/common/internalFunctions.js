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
 *   Federico Parodi <f.parodi@tiscali.it>
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

const IOService = Components.classes["@mozilla.org/network/io-service;1"]
	.getService(Components.interfaces.nsIIOService);

const FileFactory = new Components.Constructor(
	'@mozilla.org/file/local;1',
	'nsILocalFile',
	'initWithPath'
);

const SoundFactory = new Components.Constructor(
	'@mozilla.org/sound;1',
	'nsISound',
	'play'
);
	
	
const SYSTEMSLASH = (DTA_getProfileFile('dummy').path.indexOf('/') != -1) ? '/' : '\\';

// shared state defines
const PAUSED =    1<<1;
const RUNNING =   1<<2;
const FINISHING = 1<<3;
const COMPLETE =  1<<4;
const CANCELED =  1<<5;
const QUEUED =    1<<6;
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
	if (data instanceof String || typeof(data) == 'object') {
		try {
			return data.toSource();
		}
		catch (ex) {
			// fall-trough
		}
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
	let elements = [];
	for (let i = 0, e = arguments.length; i < e; ++i) {
		let element = document.getElementById(arguments[i]);
		if (element) {
			elements.push(element);
		}
		else {
			Debug.logString("requested a non-existing element: " + id);
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
	var rv = {};
	merge(rv, obj);
	rv.prototype = this.prototype;
	rv.constructor = this.constructor;
	return rv;
}
merge(
	String.prototype,
	{ 
		trim : function() {
			return this.replace(/^\s+|\s+$/g, '');
		},
		removeBadChars : function() {
			return this
				.replace(/[\n\r\v?:<>*|"]/g, '_')
				.replace(/%(?:25)?20/g, ' ');
		},
		addFinalSlash : function() {
			if (this.length == 0) {
				return SYSTEMSLASH;
			}
			
			if (this[this.length - 1] != SYSTEMSLASH) {
				return this + SYSTEMSLASH;
			}
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
		replaceSlashes: function(replaceWith) {
			return this.replace(/[\\/]/g, replaceWith);
		},
		normalizeSlashes: function() {
			return this.replaceSlashes(SYSTEMSLASH);
		},
		removeLeadingSlash : function() {
			return this.removeLeadingChar(SYSTEMSLASH);
		},
		getUsableFileName : function() {
			let t = this.replace(/\?.*$/, '')
				.normalizeSlashes()
				.trim()
				.removeFinalSlash();
			return t.split(SYSTEMSLASH).pop().removeBadChars().trim();
		},
		getExtension : function() {
			let name = this.getUsableFileName();
			let c = name.lastIndexOf('.');
			if (c == -1) {
				return null;
			}
			return name.slice(c + 1);
		},
		cropCenter : function(newLength) {
			if (this.length > newLength) {
				return this.substring(0, newLength / 2) + "..." + this.substring(this.length - newLength / 2, this.length);
			}
			return this;
		},
		toURI: function(charset, baseURI) {
			return IOService.newURI(this, charset, baseURI);			
		},
		toURL: function(charset, baseURI) {
			return this.toURI(charset, baseURI).QueryInterface(Components.interfaces.nsIURL);
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
	FilePicker: Components.Constructor('@mozilla.org/filepicker;1', 'nsIFilePicker', 'init'),
	askForDir: function (predefined, text) {
		try {
			// nsIFilePicker object
			var nsIFilePicker = Components.interfaces.nsIFilePicker;
			var fp = new Utils.FilePicker(window, text, nsIFilePicker.modeGetFolder);
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
			Debug.log("Utils.askForDir():", ex);
		}
		return false;
	},
	/**
	 * Performs all the needed controls to see if the specified path is valid, is creable and writable and his drive has some free disk space.	
	 * @param path The path to test
	 * @return a nsILocalFile to the specified path if it's valid, false if it wasn't
	 */
	validateDir: function(path) {
		let directory = null;
		if (!(path instanceof Components.interfaces.nsILocalFile)) {
			if (!path || !String(path).trim().length) {
				return false;
			}
			directory = new FileFactory(path);
		}
		else {
			directory = path.clone();
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
				parent = parent.QueryInterface(Components.interfaces.nsILocalFile);
				// we look for a directory that is writable and has some disk-space
				return parent.isDirectory() && parent.isWritable() && parent.diskSpaceAvailable ? directory : false;
			}
		}
		catch(ex) {
			Debug.log('Utils.validateDir()', ex);
		}
		return false;
	},
	/**
	 * Gets the disk-space available for a nsILocalFile.
	 * Here, because diskSpaceAvailable requires valid path and/or path to be a directory
	 * @param file Valid nsILocalFile
	 * @return the disk-space available to the caller
	 * @author Nils
	 */
	getFreeDisk: function(file) {
		while (file) {
			if (file.exists() && file.isDirectory()) {
				return file.diskSpaceAvailable;
			}
			file = file.parent;
		}
		return 0;
	},
	/**
	 * Play a sound file (if prefs allow to do so)
	 * @param name Name of the sound (corresponding to the pref name and the file name of desired sound)
	 */
	playSound: function(name) {
		try {
			if (Preferences.getDTA("sounds." + name, false)) {
				new SoundFactory(("chrome://dta/skin/sounds/" + name + ".wav").toURI());
			}
		}
		catch(ex) {
			Debug.log("Playing " + name + " sound failed", ex);
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
	
		
		var units = [['sizeTB', 3], ['sizeGB', 2], ['sizeMB', 2], ['sizeKB', 1], ['sizeB', 0]];
		var unit = units.pop();
		
		while (aNumber > 875 && units.length) {
			aNumber /= 1024;
			unit = units.pop();
		}
		
		return _(unit[0], [aNumber.toFixed(unit[1])]);
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

function _getIcon(url, size) {
	if (/mac/i.test(navigator.platform)) {
		const _recognizedMac = /\.(?:gz|zip|gif|jpe?g|jpe|mp3|pdf|avi|mpe?g)$/i;
		_getIcon = function _getIconMac(url, size) {
			let uri = url.toURI();
			if (_recognizedMac.test(uri.path)) {
				return "moz-icon://" + url + "?size=" + size;
			}
			return "moz-icon://file.html?size=" + size;
		};
	}
	else {
		_getIcon = function _getIconOther(url, size) {
			return "moz-icon://" + url + "?size=" + size;
		};
	}
	return _getIcon(url, size);
};

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
		Debug.log("updateIcon: failed to grab icon", ex);
	}
	return "moz-icon://foo.html?size=" + size;
}

var makeObserver = DTA_makeObserver;

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
	init: function() {
		this._bundles = document.getElementsByTagName('stringbundle');
	},
	getString: function(id) {
		for each (var bundle in this._bundles) {
			try {
				return bundle.getString(id);
			}
			catch (ex) {
				// no-op
			}
		}
		throw new Components.Exception('BUNDLE STRING NOT FOUND (' + id + ')');
	},
	getFormattedString: function(id, params) {
		for each (var bundle in this._bundles) {
			try {
				return bundle.getFormattedString(id, params);
			}
			catch (ex) {
				// no-op
			}
		}
		throw new Components.Exception('BUNDLE STRING NOT FOUND (' + id + ')');	 
	}
};
/**
 * Get a (formatted) locale property string.
 * @param stringId Id of desired string corresponding to the .properties file(s)
 * @param ... Optional. Format parameters
 * @return String for given Name
 * @throws Exception if stringID is not found or before the dialog was initialized
 * @author Nils
 */
function _() {
	var bundles = new StringBundles();
	_ = function() {
		if (arguments.length == 1) {
			return bundles.getString(arguments[0]);
		}
		return bundles.getFormattedString.apply(bundles, arguments);
	}
	return _.apply(this, arguments);
}

/**
 * XP compatible reveal/launch
 * @author Nils (derived from DownloadManager code)
 */
var OpenExternal = {
	_proto: Components.classes['@mozilla.org/uriloader/external-protocol-service;1']
		.getService(Components.interfaces.nsIExternalProtocolService),
	_prepare: function(file) {
		if (typeof(file) == 'string' || file instanceof String) {
			return new FileFactory(file);
		}
		if (file instanceof Components.interfaces.nsIFile) {
			return file.QueryInterface(Components.interfaces.nsILocalFile);
		}
		if (file instanceof Components.interfaces.nsILocalFile) {
			return file;
		}
		throw new Components.Exception('OpenExternal: feed me with nsILocalFile or String');
	},
	_nixLaunch: function(file) {
		this._proto.loadUrl(IOService.newFileURI(file));	 
	},
	/**
	 * Launch/Execute a file
	 * @param nsILocalFile/String pointing to the desired file
	 */
	launch: function(file) {
		file = this._prepare(file);
		if (!file.exists()) {
			throw new Components.Exception("OpenExternal: file not found!");
		}
		
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
				throw new Components.Exception("File does not exist");
			}
			else {
				file.reveal();
			}
		}
		catch (ex) {
			// try to open the directory instead
			// (either because the file does not exist anymore
			// or because the platform does not implement reveal);
			this.launch(file.parent);
		}
	}
};

/**
 * Range generator (python style). Difference: step direction is initialized accordingly if corresponding parameter is omitted.
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
	stop += -Math.abs(step)/step;
	stop += step - ((stop - start) % step);
	for (; start != stop; start += step) {
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
	var uuidgen = Components.classes["@mozilla.org/uuid-generator;1"]
		.getService(Components.interfaces.nsIUUIDGenerator);
	newUUIDString = function() {
		return uuidgen.generateUUID().toString();
	}
	return newUUIDString();
}

function Timer(func, interval, persist, now) {
  this._id = newUUIDString();
	if (typeof(func) != 'function') {
		func = new Function(func);
	}
	this._func = func;
  this._interval = interval;
  this._persist = persist;
  
  TimerManager._push(this);
  if (now) {
  	this.exec();
  }
}
Timer.prototype = {
	_install: function TI__install() {
	  var tp = this; 
		this._tid = window.setTimeout(
	    function() {
	      if (tp._persist) {
	        tp._install();
	      }
	      else {
	        TimerManager.kill(tp);
	      }
	      tp.exec();
	    },
	    this._interval
	  );
	},
	exec: function TI_exec() {
		this._func.call(window);
	},
	kill: function TI_kill() {
		TimerManager.kill(this);
	},
	toString: function TI_toString() {
		return this._id;
	}
}
var TimerManager = {
	_timers: {},
	_push: function TM_push(timer) {
		this.kill(timer);
		this._timers[timer] = timer;
		timer._install();
	},
	kill: function TM_kill(timer) {
		if (timer in this._timers) {
			window.clearTimeout(timer._tid);
		}
		delete this._timers[timer];
	},
	killAll: function TM_killAll() {
		for (id in this._timers) {
			Debug.logString("killing: " + id);
			window.clearTimeout(this._timers[id]._tid);
		}
		this._timers = {};
	}
};