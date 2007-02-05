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
 * The Original Code is downTHEMall.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *   Federico Parodi
 *   Stefano Verna
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
/*
 * File relicensed under MPL-Tri, as it contained mostly my code, even before "forking" and I never signed over the copyright nor did I grant for GPL-only.
 */
 
function DTA_include(uri) {
	Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
		.getService(Components.interfaces.mozIJSSubScriptLoader)
		.loadSubScript(uri);
}
DTA_include("chrome://dta/content/common/regconvert.js");

var DTA_FilterManager = Components.classes['@tn123.ath.cx/dtamod/filtermanager;1']
	.getService(Components.interfaces.dtaIFilterManager);
 
function DTA_showPreferences() {
	window.openDialog(
		'chrome://dta/content/preferences/newPref.xul',
		'dtaPrefs',
		'chrome,titlebar,toolbar,centerscreen,close'
	);
}
 
 // Preferences
var DTA_preferences = {
	_pref: Components.classes['@mozilla.org/preferences-service;1']
		.getService(Components.interfaces.nsIPrefBranch),
	_conv: {
		'boolean': 'BoolPref',
		'string': 'CharPref',
		'number': 'IntPref',
		'undefined': 'CharPref'
	},
	get: function DP_get(key, def) {
		if (!this._conv[typeof(def)]) {
			def = def.toSource();
		}
		try {
			return this._pref['get' + this._conv[typeof(def)]](key);
		} catch (ex) {
			//Components.utils.reportError('DTAP: key miss: ' + key + ' / set' + this._conv[typeof(def)]);
			//this._pref['set' + this._conv[typeof(def)]](key, def);
			return def;
		}
	},
	getDTA: function DP_getDTA(key, def) {
		return this.get('extensions.dta.' + key, def);
	},
	set: function(key, value) {
		if (!this._conv[typeof(value)]) {
			value = value.toSource();
		}
		this._pref['set' + this._conv[typeof(value)]](key, value);
	},
	setDTA: function DP_setDTA(key, value) {
		return this.set('extensions.dta.' + key, value);
	},
	getMultiByte: function DP_getMultiByte(key, def) {
		try {
			var rv = this._prefs.getComplexValue(
				key,
				Components.interfaces.nsISupportsString
			);
			return rv.data;
		}
		catch (ex) {
			return def;
		}
	},
	getMultiByteDTA: function DP_getMultiByteDTA(key, def) {
		return this.getMultiByte('extensions.dta.' + key, def);
	},
	setMultiByte: function DP_setMultiByte(key, value) {
		var str = CC["@mozilla.org/supports-string;1"]
			.createInstance(Components.interfaces.nsISupportsString);
		str.data = value;
		this._prefs.setComplexValue(
			key,
			Components.interfaces.nsISupportsString,
			str
		);
	},
	setMultiByteDTA: function DP_setMultiByteDTA(key, value) {
		this.setMultiByte('extensions.dta.' + key, value);
	},
	reset: function DP_reset(key) {
		return this._pref.clearUserPref(key);
	},
	resetDTA: function DP_resetDTA(key) {
		return this.reset('extensions.dta.' + key);
	},
	resetBranch: function DP_resetBranch(key) {
		// BEWARE: not yet implemented in XPCOM 1.8/trunk.
		var branch = 'extensions.dta.' + key;
		var c = {value: 0};
		var prefs = this._prefs.getChildList(branch, c);
		for (var i = 0; i < c.value; ++i) {
			this.resetDTA(branch + prefs[i]);
		}
	},
	resetAll: function DP_reset() {
		this.resetBranch('');
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
		this._dumpEnabled = DTA_preferences.getDTA("logging", false);
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
			if (!this._dumpEnabled || (message=="" && typeof(e)!="object")) {
				return;
			}
			
			message = String(message);
			
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
			if (e instanceof Components.Exception) {
				text += (e.message + " (" + e.fileName +" line " + e.lineNumber + ")");
			}
			else if (e instanceof String) {
				text += e;
			}
			else if (e) {
				text += e.toSource();
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
	},
	dumpObj: function(obj) {
		for (i in obj) {
			Components.utils.reportError(i + ": " + (obj[i] ? obj[i].toSource() : obj[i]));
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
	set url(nv) {
		this._url = this.str(nv);
		this.usable = '';
		this.decode();
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
	
function DTA_AdditionalMatcher(str, regex) {
	this._str = str;
	this._regex = regex;
	this._filters = [];
	this.init();
};
DTA_AdditionalMatcher.prototype = {
	init: function() {
		if (this._regex) {
			try {
				this._filters.push(DTA_regToRegExp(this._str));
			}
			catch (ex) {
			}
		}
		else {
			var filters = this._str.split(',');
			for (var i = 0; i < filters.length; ++i) {
				var filter = filters[i].replace(/^[\s\t]+|[\s\t]+$/gi, '');
				if (!filter.length) {
					continue;
				}
				this._filters.push(DTA_strToRegExp(filter));
			}
		}
	},
	match: function(url) {
		return this._filters.some(
			function(e) {
				return url.search(e) != -1;
			}
		);
	}
}
	
var DTA_AddingFunctions = {
	ios: Components.classes["@mozilla.org/network/io-service;1"]
		.getService(Components.interfaces.nsIIOService),
	
	isLinkOpenable : function(url) {
		if (url instanceof DTA_URL) {
			url = url.url;
		}
		try {
			var scheme = this.ios.extractScheme(url);
			return ['http', 'https', 'ftp'].some(function(e) { return e = scheme; });
		}
		catch (ex) {
		}
		return false;
	},
	
	saveSingleLink : function(turbo, url, referrer, description, mask) {
		if (turbo) {
			var el = {
				'url': url,
				'refPage': referrer,
				'description': description,
				'ultDescription': ''
			};
			this.turboSendToDown([el]);
			return;
		}
		
		// else open addurl.xul
		var win = window.openDialog(
			"chrome://dta/content/dta/addurl.xul",
			"_blank",
			"chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no",
			{'url': url, 'description': description, 'referrer': referrer, 'mask': mask}
		);
	},
	
	getDropDownValue : function(name) {
		var values = eval(DTA_preferences.getDTA(name, '[]'));
		return values.length ? values[0] : null;
	},
	
	turboSendToDown : function(urlsArray) {

		var dir = this.getDropDownValue('directory');
		var mask = this.getDropDownValue('renaming');

		if (!mask || !dir) {
			throw new Components.Exception("missing required information");
		}
		
		var num = DTA_preferences.getDTA("counter", 0);
		if (++num > 999) {
			num = 1;
		}
		DTA_preferences.setDTA("counter", num);

		for (var i = 0; i < urlsArray.length; i++) {
			urlsArray[i].mask = mask;
			urlsArray[i].dirSave = dir;
			urlsArray[i].numIstance = num;
		}
		
		this.sendToDown(!DTA_preferences.get("extensions.dta.lastWasQueued", false), urlsArray);
	},

	saveLinkArray : function(turbo, urls, images) {

		if (urls.length == 0 && images.length == 0) {
			throw new Components.Exception("no links");
		}
			
		if (turbo) {
			
			DTA_debug.dump("saveLinkArray(): DtaOneClick filtering started");
				
			var arrayObject;
			var type;
			if (DTA_preferences.getDTA("seltab", 0)) {
				arrayObject = images;
				type = 2;
			}
			else {
				arrayObject = urls;
				type = 1;
			}
			var links = [];
	
			var additional = new DTA_AdditionalMatcher(
				this.getDropDownValue('filter'),
				DTA_preferences.getDTA('filterRegex', false)
			);

			for (i in arrayObject) {
				if (i == "length" || typeof(arrayObject[i]) != "object") {
					continue;
				}
				var matched = DTA_FilterManager.matchActive(i, type);
				if (!matched) {
					matched = additional.match(i);
				}
					
				if (!matched) {
					continue;
				}

				links.push({
					url : arrayObject[i].url,
					description : arrayObject[i].description,
					ultDescription : arrayObject[i].ultDescription,
					refPage : arrayObject[i].refPage
				});
			}
				
			DTA_debug.dump("saveLinkArray(): DtaOneClick has filtered " + links.length + " URLs");
				
			if (links.length == 0) {
					throw new Components.Exception('no links remaining');
			}
			this.turboSendToDown(links);
			return;
		}
			
		window.openDialog(
			"chrome://dta/content/dta/select.xul",
			"_blank",
			"chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no",
			urls,
			images
		);
	},
	
	openManager : function (quite) {
		try {
			var win = DTA_Mediator.get("chrome://dta/content/dta/manager.xul");
			if (win) {
				if (!quite) {
					win.focus();
				}
				return win;
			}
			window.openDialog(
				"chrome://dta/content/dta/manager.xul",
				"_blank",
				"chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no"
			);
			return DTA_Mediator.get("chrome://dta/content/dta/manager.xul");
		} catch(ex) {
			DTA_debug.dump("openManager():", ex);
		}
		return null;
	},
	
	sendToDown : function(notQueue, links) {
		var win = DTA_Mediator.get("chrome://dta/content/dta/manager.xul");
		if (win) {
			win.self.startnewDownloads(notQueue, links);
			return;
		}
		win = window.openDialog(
			"chrome://dta/content/dta/manager.xul",
			"_blank",
			"chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no",
			notQueue, links
		);
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
		if (!url) {
			return null;
		}
		if (url instanceof DTA_URL) {
			url = url.url;
		}
		if (url instanceof Components.interfaces.nsIURI) {
			url = url.spec;
		}
		var enumerator = this._m.getEnumerator(null);
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			if (win.location == url) {
				return win;
			}
		}	
		return null;
	},
	openTab: function WM_openTab(url, ref) {
		if (!url) {
			return;
		}
		var win = this.getMostRecent();
		if (!win) {
			window.open();
			win = this.getMostRecent();
		}
		if (url instanceof DTA_URL) {
			url = url.url;
		}		
		if (ref instanceof DTA_URL) {
			ref = ref.url;
		}
		if (ref && !(ref instanceof Components.interfaces.nsIURI)) {
			try {
				ref = DTA_AddingFunctions.ios.newURI(ref, null, null);
			} catch (ex) {
				DTA_debug.dump(ref, ex);
				ref = null;
			}
		}
		win.delayedOpenTab(url, ref);
	}
};

// DropdownObject
function DTA_DropDown(name, input, dropDown, predefined) {
	this.name = name;
	this.input = input;
	this.dropDown = dropDown;
	this.predefined = (predefined instanceof Array) ? predefined : [];
	
	this.reload();
}

DTA_DropDown.prototype = {
	reload: function dd_reload() {
		try {
			this.load();
		} catch (ex) {
			DTA_debug.dump('ddl:', ex);
			// no-op: might want to load this without attaching to an element.
		}
	},
	load: function dd_load() {
		var values = eval(DTA_preferences.getDTA(this.name, this.predefined));
		var max = DTA_preferences.getDTA("history", 5);
		
		var drop = document.getElementById(this.dropDown);
		var input = document.getElementById(this.input);
		
		while (drop.hasChildNodes()) {
			drop.removeChild(drop.lastChild);
		}
		
		for (var i =  0; i < values.length && i < max; ++i) {
			var node = document.createElement('menuitem');
			node.setAttribute('label', values[i]);
			drop.appendChild(node);
		}
		if (values.length) {
			input.value = values[0];
		}
	},
	get current() {
		var node = document.getElementById(this.input);
		return node ? node.value : '';
	},
	set current(value) {
		var node = document.getElementById(this.input);
		if ('value' in node) {
			node.value = value;
			this.save();
		}
	},
	save: function dd_save() {
		var n = this.current;
		if (!n.length) {
			return;
		}

		var inValues = eval(DTA_preferences.getDTA(this.name, this.predefined));
		var max = DTA_preferences.getDTA("history", 5);
		
		var outValues = [n];
		
		for (var i = 0; i < inValues.length && i < max - 1 && outValues.length < max; ++i) {
			if (n != inValues[i] && inValues[i].length) {
				outValues.push(inValues[i]);
			}
		}
		DTA_preferences.setDTA(this.name, outValues);
	},
	clear: function dd_save() {
		Preferences.resetDTA(this.name);
	}
}