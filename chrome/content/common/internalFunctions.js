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

// Debug
var Debug = DTA_debug;
var Preferences = DTA_preferences;

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
    var element = arguments[i];
    if (typeof element == 'string')
      element = document.getElementById(element);

    if (arguments.length == 1)
      return element;

    elements.push(element);
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
		return this.replace(/[\?\:<>\*\|"]/g, "_").replace(/%20/g, " ").replace(/%2520/g, " "); //"
	},
	findSystemSlash : function() {
		var path=(DTA_profileFile.get("dummy")).path;
		if (path.search(/\\/) != -1) return "\\"; else return "/";
	},
	findForbiddenSlash : function() {
		if (this.findSystemSlash() == "/")
			return "\\";
		else
			return "/";
	},
	addFinalSlash : function() {
		if (this.length == 0) return this.findSystemSlash();
		
		if (this[this.length - 1] != this.findSystemSlash())
			return this + this.findSystemSlash();
		else
			return this;
	},
	removeFinalChar : function(c) {
		if (this.length == 0) return this;
		if (this.length == 1) return (this==c)?"":this;
		
		if (this[this.length - 1]==c) {
			return this.substring(0, this.length - 1);
		} else
			return this;
	},
	removeLeadingChar : function(c) {
		if (this.length == 0) return this;
		if (this.length == 1) return (this==c)?"":this;
		
		if (this[0] == c) {
			return this.substring(1, this.length);
		} else
			return this;
	},
	removeFinalSlash : function() {
		return this.removeFinalChar(this.findSystemSlash());
	},
	removeLeadingSlash : function() {
		return this.removeLeadingChar(this.findSystemSlash());
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
		var c = name.split(".");
		if (c.length == 1) 
			return null;
		else
			return c[c.length - 1];
	},
	formatTimeDate : function() {
		return this.replace(/\b(\d)\b/g, "0$1");
	},
	cropCenter : function(newLength) {
		if (this.length > newLength) {
			return this.substring(0, newLength/2) + "..." + this.substring(this.length - newLength/2, this.length);
		}	else
			return this;
	}
}
);

function filePicker() {}
filePicker.prototype = {

	getFolder : function (predefined, text) {try {
		// nsIFilePicker object
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes['@mozilla.org/filepicker;1'].createInstance(nsIFilePicker);
		fp.init(window, text, nsIFilePicker.modeGetFolder);
		fp.appendFilters(nsIFilePicker.filterAll);
		
		// locate current directory
		var dest;
		if ((dest = this.createValidDestination(predefined)))
			fp.displayDirectory = dest;
		
		// open file picker
		var res = fp.show();
	
		if (res == nsIFilePicker.returnOK)
			return fp.file.path.addFinalSlash();
		
	} catch (e) {Debug.dump("filePicker.getFolder():", e);}
	return false;
	},
	
	createValidDestination : function(path) {
		if (!path || !String(path).trim().length) {
			return false;
		}
		var directory = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
		try {
			directory.initWithPath(path);
			if (directory.exists()) {
				return directory;
			}
		} catch(ex) {
			return false;
		}
		try {
			if (!directory.diskSpaceAvailable) {
				return false;
			}
		} catch (ex) {
			return false;
		}
		
		var f = (new String()).findSystemSlash();
		if (f=="/") {
			if ((/[\?\+&=:<>\*\|"\\]/gi).test(path)) {
				return false;
			}
		} else {
			if ((/[\?\+&=:<>\*\|"\/]/gi).test(path.substring(3, path.length))) 
			{
				return false;
			}
		}
		return directory;
	}
};
function getIcon(link, metalink, size) {
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
		if (metalink) {
			return "chrome://dta/skin/icons/metalink.png";
		}
		else {
			if (typeof(size) != 'number') {
				size = 16;
			}
			return "moz-icon://" + url + '?size=' + size;
		}
	}
	catch (ex) {
		Debug.dump(link);
		Debug.dump("updateIcon: failed to grab icon", ex);
	}
	return "chrome://dta/skin/icons/other.png"
}