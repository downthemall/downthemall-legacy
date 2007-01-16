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

function DTA_showPreferences() {
	window.openDialog(
		'chrome://dta/content/preferences/newPref.xul',
		'_blank',
		'chrome, titlebar=yes, toolbar=yes, close=yes, centerscreen=yes, resizable=yes, dialog=no, dependent=no, modal=no'
	);
}
 
 // Preferences
var DTA_preferences = {
	_pref: Components.classes['@mozilla.org/preferences-service;1']
		.getService(Components.interfaces.nsIPrefBranch),
	_conv: {
		'boolean': 'BoolPref',
		'string': 'CharPref',
		'number': 'IntPref'
	},
	get: function DP_get(key, def) {
		if (!this._conv[typeof(def)]) {
			def = String(def);
		}
		try {
			return this._pref['get' + this._conv[typeof(def)]](key);
		} catch (ex) {
			Components.utils.reportError('set' + this._conv[typeof(def)]);
			this._pref['set' + this._conv[typeof(def)]](key, def);
			return def;
		}
	},
	getDTA: function DP_getDTA(key, def) {
		return this._get('extensions.dta' + key, def);
	},
	set : function(key, value) {
		if (!this._conv[typeof(value)]) {
			value = String(value);
		}
		this._pref['set' + this._conv[typeof(value)]](key, value);
	},
	removeBranch: function(pref) {
		try {
			this._pref.deleteBranch(pref);
		} catch(e) {}
	}
};

var DTA_profileFile = {
	_ds : Components.classes["@mozilla.org/file/directory_service;1"]
		.getService(Components.interfaces.nsIProperties),
		
	get: function PF_get(fileName)	{
		var file = this._ds.get("ProfD", Components.interfaces.nsIFile)
		file.append(fileName);
		return file;
	}
};
var DTA_debug = {
	_dumpEnabled : false,
	_consoleService : null,
	_logPointer : null,
	_loaded : false,
	_load : function() {
		this._dumpEnabled = DTA_preferences.get("extensions.dta.directory.visibledump", false);
		this._consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		this._logPointer = DTA_profileFile.get('dta_log.txt');
		try {
			if (this._logPointer.fileSize > (200 * 1024)) 
				this._logPointer.remove(false);
		} catch(e) {}
		this._loaded = true;
	},
	formatTimeDate: function DD_formatTimeDate(value) {
		return String(value).replace(/\b(\d)\b/g, "0$1");
	},
	dump : function(message, e) {
		if (!this._loaded) {
			this._load();
		}
		try {
			if (!this._dumpEnabled || (message=="" && typeof(e)!="object")) return;
			var fo = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
			var time = new Date();
			var text = this.formatTimeDate(time.getHours())
				+ ":" + this.formatTimeDate(time.getMinutes())
				+ ":" + this.formatTimeDate(time.getSeconds())
				+ ":" + time.getMilliseconds()
				+ "\x0D\x0A\t";
			
			if (message != "") {
				text += message.replace(/\n/g, "\x0D\x0A\t") + " ";
			}
			if (typeof(e) == "object") {
				text += (e.message + " (" + e.fileName +" line " + e.lineNumber + ")");
			}
			text += "\x0D\x0A";
			
			if (Components.stack)
			{
				var stack = Components.stack.caller;
				for (var i = 0; i < 4 && stack; ++i) {
					text += stack.toString() + "\x0D\x0A";
					stack = stack.caller;
				}
			}
			
			this._consoleService.logStringMessage(text);
			
			fo.init(this._logPointer, 0x04 | 0x08 | 0x10, 0664, 0); 
			fo.write(text, text.length);
			fo.close();
		} catch(ex) {
			Components.utils.reportError(ex);
		}
	}
};

var DTA_URLhelpers = {
	textToSubURI : Components.classes["@mozilla.org/intl/texttosuburi;1"]
		.getService(Components.interfaces.nsITextToSubURI),
		
	decodeCharset: function(text, charset) {
		var rv = text;
		try {
			if (!charset.length) {
				throw 'no charset';
			}
			rv = this.textToSubURI.UnEscapeAndConvert(charset, text);
		} catch (ex) {
			try {
				rv = decodeURIComponent(text);
			} catch (ex) {
				DTA_debug.dump("DTA_URLhelpers: failed to decode: " + text, ex);
			}
		}
		return rv;
	}
};

function DTA_URL(url, charset, usable, preference) {
	this.charset = this.str(charset);
	this.usable = this.str(usable);
	this._url = this.str(url);
	this.preference = preference ? preference : 100;

	this.decode();
};
DTA_URL.prototype = {
	str: function(value) {
		return value ? String(value) : '';
	},
	// only a getter here. :p
	get url() {
		return this._url;
	},
	decode: function DU_decode() {
		if (!this.usable.length)
		{
			this.usable = DTA_URLhelpers.decodeCharset(this._url, this.charset);
		}
	},
	save: function DU_save(element) {
		element.setAttribute("url", this._url);
		element.setAttribute("charset", this.charset);
		element.setAttribute("usableURL", this.usable);
	}
};

var dragObserverTdTa = {
	getSupportedFlavours: function () {
		var flavours = new FlavourSet ();
		flavours.appendFlavour("text/x-moz-url");
		return flavours;
	},
	onDragOver: function(evt,flavour,session) {},
	onDrop: function (evt,dropdata,session) {
		if (dropdata != "") {
			var url = transferUtils.retrieveURLFromData(dropdata.data, dropdata.flavour.contentType);
			DTA_AddingFunctions.saveSingleLink(
				true,
				url,
				document.commandDispatcher.focusedWindow.document.URL
					? document.commandDispatcher.focusedWindow.document.URL
					: DTA_Mediator.getMostRecentURL(),
				""
				);
		}
	}
};
var dragObserverdTa = {
	getSupportedFlavours: function () {
		var flavours = new FlavourSet ();
    	flavours.appendFlavour("text/x-moz-url");
		return flavours;
	},
	onDragOver: function(evt,flavour,session) {},
	onDrop: function (evt,dropdata,session) {
		if (dropdata != "") {
			var url = transferUtils.retrieveURLFromData(dropdata.data, dropdata.flavour.contentType);
			DTA_AddingFunctions.saveSingleLink(
				false,
				url, document.commandDispatcher.focusedWindow.document.URL
					? document.commandDispatcher.focusedWindow.document.URL
					: DTA_Mediator.getMostRecentURL(),
				""
			);
		}
	}
};
// turbo: 4 stati:
// 0: dta normale
// 1: tdta
// 2: dta di un singolo link
// 3: tdta di un singolo link
// sends valid links to dialog win
	
var DTA_AddingFunctions = {
	isLinkOpenable : function(url) {
		var t = (url.url) ? url.url : url;
		return t.match(/^(http|ftp|https):\/\/.+/i);
	},
	
	saveSingleLink : function(turbo, url, referrer, description, mask) {
	try {
	
		if (!this.isLinkOpenable(url)) {
			if (document.getElementById("context-dta")) {
				alert(document.getElementById("context-dta").attributes.error2.value);
			}
			return;
		}
		
		if (turbo) {
			var el = {
				'url': url,
				'refPage': referrer,
				'description': description,
				'ultDescription': ''
			};
			
			// if i could start with oneclick return
			if (this.turboSendToDown([el])) {
				return;
			}
		}
		
		// else open addurl.xul
		window.openDialog(
			"chrome://dta/content/dta/addurl.xul","_blank","chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no",
			{ 'url': url, 'description': description, 'refPage': referrer, 'mask': mask }
		);
	} catch(e) {
		Components.utils.reportError(e);
		DTA_debug.dump("saveSingleLink(): ", e);
	}
	},
	
	getCurrentDropdownValue : function(name) {
		return nsPreferences.getLocalizedUnicharPref("extensions.dta.dropdown."+name+"-current", "");
	},
	
	turboSendToDown : function(urlsArray) {
		try {
			// XXX: error to localize
			if (this.getCurrentDropdownValue('renaming').length==0 || this.getCurrentDropdownValue('directory').length==0) {
				alert("You have not set a valid renaming mask or a valid destination directory.");
				DTA_debug.dump("User has not set a valid renaming mask or a valid destination directory.");
				return false;
			}
			
			var num = DTA_preferences.get("extensions.dta.numistance", 1);
			num = (num<999)?(++num):1;
			DTA_preferences.set("extensions.dta.numistance", num);
	
			for (var i=0; i<urlsArray.length; i++) {
				urlsArray[i].mask = this.getCurrentDropdownValue('renaming');
				urlsArray[i].dirSave = this.getCurrentDropdownValue('directory');
				urlsArray[i].numIstance = num;
			}
			
			this.sendToDown(!DTA_preferences.get("extensions.dta.lastWasQueued", false), urlsArray);
			return true;
		} catch(e) {
			DTA_debug.dump("turboSendToDown(): ", e);
			return false;
		}
	},

	createFilters : function(type) {
		
		var convertToRegExp = function(f) {
		
			// f is a String object.
			
			// removes leading and final white chars
			f.replace(/^\s*|\s*$/gi,"");
			
			// if it's regexp
			if (f.substring(0,1) == "/" && f.substring(f.length - 1, f.length) == "/") {
				return (f.length==2)?[]:[new RegExp(f.substring(1, f.length - 1), "i")];
			} 
			// uses wildcards.. needs to be converted into regexp
			else {
				f = f.replace(/\./gi, "\\.")
				.replace(/\*/gi, "(.)*")
				.replace(/\$/gi, "\\$")
				.replace(/\^/gi, "\\^")
				.replace(/\+/gi, "\\+")
				.replace(/\?/gi, ".")
				.replace(/\|/gi, "\\|")
				.replace(/\[/gi, "\\[");
				
				var filters = [];
				var a = f.split(",");
				for (var i=0; i<a.length; i++)
					if (a[i].replace(/^\s*|\s*$/gi,"") != "") 
			 			filters.push(new RegExp(a[i].replace(/^\s*|\s*$/gi, "")));
			 			
			 	return filters;
			}
		};
		
		var checkedFilters = [];
		var filtertxt = this.getCurrentDropdownValue('filter');
		if (filtertxt.length > 0) checkedFilters = checkedFilters.concat(convertToRegExp(filtertxt));
		
		var nfilters = DTA_preferences.get("extensions.dta.context.numfilters", 0);
		
		for (var t=0; t<nfilters; t++) {
			if (DTA_preferences.get("extensions.dta.context.filter" + t + ".is"+type+"Filter", false)
					&&
					DTA_preferences.get("extensions.dta.context.filter" + t + ".checked", false)
			) {
				 checkedFilters = checkedFilters.concat(convertToRegExp(nsPreferences.getLocalizedUnicharPref("extensions.dta.context.filter" + t + ".filter")));
			}
		}
		
		return checkedFilters;
	},
	saveLinkArray : function(turbo, urls, images) {
	try {
	
		if (urls.length==0 && images.length==0) {
			// localization hack
			alert(document.getElementById("context-dta").attributes.error1.value);
		}
		
		if (turbo) {
			DTA_debug.dump("saveLinkArray(): DtaOneClick filtering started");
			
			var arrayObject = (DTA_preferences.get("extensions.dta.context.seltab", 0)==0)?urls:images;
			var links = [];
			var filters = this.createFilters((arrayObject==urls)?"Link":"Image");
			
			for (i in arrayObject) {
				if (i == "length" || typeof(arrayObject[i])!="object") continue;
				
				var positiveToFilters = false;
				for (var j = 0; j<filters.length && !positiveToFilters; j++)
					if (
						i.match(filters[j]) 
						|| 
						(arrayObject[i].description && arrayObject[i].description.match(filters[j])) 
						|| 
						(arrayObject[i].ultDescription && arrayObject[i].ultDescription.match(filters[j]))
					) positiveToFilters = true;
				
				if (!positiveToFilters) continue;
				
				links.push({
					url : arrayObject[i].url,
					description : arrayObject[i].description,
					ultDescription : arrayObject[i].ultDescription,
					refPage : arrayObject[i].refPage
				});
			}
			
			DTA_debug.dump("saveLinkArray(): DtaOneClick has filtered " + links.length + " URLs");
			
			// if i cannot start with oneclick open select.xul
			if (links.length == 0) {
				alert(document.getElementById("context-dta").attributes.error1.value);
			} else if (this.turboSendToDown(links)) {
				return;
			} else {
				DTA_debug.dump("saveLinkArray(): turboSendToDown() returned false.. i'm opening Select window");
			}
		}
		
		window.openDialog("chrome://dta/content/dta/select.xul","_blank","chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no", urls, images);
	
	} catch(e) {
		DTA_debug.dump("saveLinkArray(): ", e);
	}
	},
	
	openManager : function () {try {
	
		var win = DTA_Mediator.get("chrome://dta/content/dta/manager.xul");
		if (win) {
			win.focus();
			return;
		}
		window.openDialog("chrome://dta/content/dta/manager.xul", "", "chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no");
	
	} catch(e) {
		Components.utils.reportError(e);
		DTA_debug.dump("openManager():", e);
	}
	},
	
	_pref : Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefBranch),
	// XXX: write this
	getPreference : function (stringa, predefinito) {
		try {
			if (typeof(predefinito) == "boolean")
				var scelta = this._pref.getBoolPref(stringa);
			else if (typeof(predefinito) == "string")
				var scelta = this._pref.getCharPref(stringa);
			else if (typeof(predefinito) == "number")
				var scelta = this._pref.getIntPref(stringa);
			return scelta;
		} catch (e) {
			if (typeof(predefinito) == "boolean")
				var scelta = this._pref.setBoolPref(stringa, predefinito);
			else if (typeof(predefinito) == "string")
				var scelta = this._pref.setCharPref(stringa, predefinito);
			else
				var scelta = this._pref.setIntPref(stringa, predefinito);
			return predefinito;
		}
	},
	
	sendToDown : function(notQueue, links) {
		var win = DTA_Mediator.get("chrome://dta/content/dta/manager.xul");
		if (win) {
			win.self.startnewDownloads(notQueue, links);
			return;
		}
		window.openDialog("chrome://dta/content/dta/manager.xul", "", "chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no", notQueue, links);
	}
}
var DTA_Mediator = {
	_m: Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator),
	getMostRecent: function(name)	{
		var rv = this._m.getMostRecentWindow(name ? name : "navigator:browser");
		return rv ? rv : null;
	},
	getMostRecentURL: function() {
		var rv = this.getMostRecent();
		return rv ? rv.content.document.location : "";
	},
	'get': function(url) {
		var enumerator = this._m.getEnumerator(null);
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			if (win.location == url) {
				return win;
			}
		}	
		return null;
	},
	openTab: function WM_openTab(url) {
		var win = this.getMostRecent();
		if (win)
		{
			// Use an existing browser window
			win.delayedOpenTab(url);
			return;
		}
		// No browser windows are open, so open a new one.
		window.open(url);
	}
};
