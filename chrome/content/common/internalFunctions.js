/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
 *
 * Contributers:
 *   Nils Maier <MaierMan@web.de>
 *
 * ***** END LICENSE BLOCK ***** */

// DTA only code - do not include in overlays or such

var Debug = DTA_debug;
var Preferences = DTA_preferences;

const SYSTEMSLASH = (DTA_profileFile.get('dummy').path.indexOf('/') != -1) ? '/' : '\\';


// From prototype.js :)
function objectExtend(destination, source) {
  for (property in source) {
    destination[property] = source[property];
  }
  return destination;
}

function $() {
  var elements = new Array();

  for (var i = 0; i < arguments.length; i++) {
    var id = arguments[i];
    if (typeof id != 'string') {
			continue;
		}			
    var element = document.getElementById(id);
    if (arguments.length == 1) {
      return element;
		}
		if (element) {
			elements.push(element);
		}
		else {
			Debug.dump("requested a non-existing element: " + id);
		}
  }

  return elements;
}

function formatBytes(aNumber) {
	aNumber = Number(aNumber);

	if (aNumber < 1024)	{
		return aNumber.toFixed(0) + " b";
 	}
 	
	var units = ['TB','GB','MB','KB'];
	var unit;
	
	while (aNumber > 875 && units.length) {
 		aNumber /= 1024;
		unit = units.pop();
 	}
 	
 	return aNumber.toFixed(2) + " " + unit;

}

objectExtend(String.prototype, 
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
	removeArguments : function() {
		return this.replace(/[\?#].*$/g, "");
	},
	getUsableFileName : function() {
		var t = this.trim().removeArguments().removeFinalBackSlash().split("/");
		return t[t.length-1].removeBadChars().replace(/[\\/]/g, "").trim();
	},
	getExtension : function() {
		var name = this.getUsableFileName();
		var c = name.lastIndexOf('.');
		if (c == -1) {
			return null;
		}
		return name.slice[c];
	},
	formatTimeDate : function() {
		return this.replace(/\b(\d)\b/g, "0$1");
	},
	cropCenter : function(newLength) {
		if (this.length > newLength) {
			return this.substring(0, newLength / 2) + "..." + this.substring(this.length - newLength / 2, this.length);
		}
		return this;
	}
}
);

function filePicker() {}
filePicker.prototype = {

	getFolder: function (predefined, text) {
		try {
			// nsIFilePicker object
			var nsIFilePicker = Components.interfaces.nsIFilePicker;
			var fp = Components.classes['@mozilla.org/filepicker;1'].createInstance(nsIFilePicker);
			fp.init(window, text, nsIFilePicker.modeGetFolder);
			fp.appendFilters(nsIFilePicker.filterAll);
		
			// locate current directory
			var dest;
			if ((dest = this.checkDirectory(predefined))) {
				fp.displayDirectory = dest;
			}
		
			// open file picker
			var res = fp.show();
	
			if (res == nsIFilePicker.returnOK) {
				return fp.file.path.addFinalSlash();
			}
		}
		catch (ex) {
			Debug.dump("filePicker.getFolder():", ex);
		}
		return false;
	},
	
	checkDirectory: function(path) {
		if (!path || !String(path).trim().length) {
			return false;
		}
		
		var directory = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
		try {
			directory.initWithPath(path);
			
			// look for the first directory that exists.
			var parent = directory.clone();
			while (parent && !parent.exists()) {
				Debug.dump("parent: " + parent.path);
				parent = parent.parent;
			}
			Debug.dump("parent: " + parent.path);
			if (parent) {
				// from nsIFile
				parent = parent.QueryInterface(Components.interfaces.nsILocalFile);
				// we look for a directory that is writeable and has some diskspace
				return parent.isDirectory() && parent.isWritable() && parent.diskSpaceAvailable ? directory : false;
			}
		}
		catch(ex) {
			Debug.dump('createValidDestination', ex);
		}
		return false;
	}
};

function getIconOther(url, size) {
	return "moz-icon://" + url + "?size=" + size; 
}

var recognizedMacMozIconExtensions = /\.(?:gz|zip|gif|jpe?g|jpe|mp3|pdf|avi|mpe?g)$/i;
function getIconMac(url, size) {
		var uri = Components.classes["@mozilla.org/network/standard-url;1"]
			.createInstance(Components.interfaces.nsIURI);
		uri.spec = url;
		if (uri.path.search(recognizedMacMozIconExtensions) != -1) {
			return "moz-icon://" + url + "?size=" + size;
		}
		return "moz-icon://foo.html?size=" + size;
}

var _getIcon;
if (navigator.platform.search(/mac/i) != -1) {
	_getIcon = getIconMac;
}
else {
	_getIcon = getIconOther;
}

function getIcon(link, metalink, size) {
	if (metalink) {
		return "chrome://dta/skin/icons/metalink.png";
	}
	if (typeof(size) != 'number') {
		size = 16;
	}
	try {
		var url;
		if (typeof(link) == 'string') {
			url = link;
		}
		else if (link instanceof DTA_URL) {
			url = link.url;
		}
		else if (link instanceof Components.interfaces.nsIURI) {
			url = link.spec;
		}
		else if ('url' in link) {
			url = link.url;
		}
		return _getIcon(url, size);
	}
	catch (ex) {
		Debug.dump("updateIcon: failed to grab icon", ex);
	}
	return "moz-icon://foo.html?size=" + size;
}

function playSound(name) {
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
}