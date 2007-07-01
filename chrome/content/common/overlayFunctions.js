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
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *   Federico Parodi
 *   Stefano Verna <stefano.verna@gmail.com>
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

/**
 * include other chrome js files
 * @param uri Relative URI to the dta content path
 * @param many Optional. If set, then include that file more than once 
 */
var DTA_include = function() {
	var _loaded = {};
	return function(uri, many) {
		if (!many && uri in _loaded) {
			return true;
		}
		try {
			Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
				.getService(Components.interfaces.mozIJSSubScriptLoader)
				.loadSubScript("chrome://dta/content/" + uri);			
			_loaded[uri] = true;
			return true;
		}
		catch (ex) {
			Components.utils.reportError(ex);
		}
		return false;
	}
}();

DTA_include("common/regconvert.js");

var DTA_FilterManager = Components.classes['@downthemall.net/filtermanager;1']
	.getService(Components.interfaces.dtaIFilterManager);

function DTA_showPreferences() {
	var instantApply = DTA_preferences.get("browser.preferences.instantApply", false);
	window.openDialog(
		'chrome://dta/content/preferences/prefs.xul',
		'dtaPrefs',
		'chrome,titlebar,toolbar,resizable,centerscreen'+ (instantApply ? ',dialog=no' : '')
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
			var rv = this._pref.getComplexValue(
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
		var str = Components.classes["@mozilla.org/supports-string;1"]
			.createInstance(Components.interfaces.nsISupportsString);
		str.data = value;
		this._pref.setComplexValue(
			key,
			Components.interfaces.nsISupportsString,
			str
		);
	},
	setMultiByteDTA: function DP_setMultiByteDTA(key, value) {
		this.setMultiByte('extensions.dta.' + key, value);
	},
	reset: function DP_reset(key) {
		try {
			return this._pref.clearUserPref(key);
		} catch (ex) {
			return false;
		}
	},
	resetDTA: function DP_resetDTA(key) {
		if (key.search(/^extensions\.dta\./) != 0) {
			key = 'extensions.dta.' + key;
		}
		return this.reset(key);
	},
	resetBranch: function DP_resetBranch(key) {
		// BEWARE: not yet implemented in XPCOM 1.8/trunk.
		var branch = 'extensions.dta.' + key;
		var c = {value: 0};
		var prefs = this._pref.getChildList(branch, c);
		for (var i = 0; i < c.value; ++i) {
			this.resetDTA(prefs[i]);
		}
	},
	resetAll: function DP_reset() {
		this.resetBranch('');
	},
	addObserver: function DP_addObserver(branch, obj) {
		this._pref
			.QueryInterface(Components.interfaces.nsIPrefBranch2)
			.addObserver(branch, obj, true);
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
	load : function() {
		this._dumpEnabled = DTA_preferences.getDTA("logging", false);
		if (!this._dumpEnabled) {
			this.dump = this._dumpStub;
			return;
		}
		this.dump = this._dump;
		this._consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		this._logPointer = DTA_profileFile.get('dta_log.txt');
		try {
			if (this._logPointer.fileSize > (200 * 1024))
				this._logPointer.remove(false);
		} catch(e) {}
	},
	formatTimeDate: function DD_formatTimeDate(value) {
		return String(value).replace(/\b(\d)\b/g, "0$1");
	},
	_dump : function(message, e) {
		try {
			if (message == "" && typeof(e) != "object") {
				return;
			}

			message = String(message);

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
				if (!e.message)
					text += e;
				else
					text += e.message + " (nsResult=" + e.result + ")";
			} else if (e instanceof Error) {
				if (!e.message)
					text += e;
				else
					text += e.message + " (" + e.fileName +" line " + e.lineNumber + ")";
			}
			else if (e instanceof String || typeof(e) == "string") {
				text += e;
			}
			else if (e instanceof Number || typeof(e) == "number") {
				text += "ResCode: " + e;
			}
			else if (e) {
				text += e.toSource();
			}
			text += "\x0D\x0A";

			if (Components.stack) {
				var stack = Components.stack.caller;
				for (var i = 0; i < 4 && stack; ++i) {
					text += stack.toString() + "\x0D\x0A";
					stack = stack.caller;
				}
			}

			this._consoleService.logStringMessage(text);

			var fo = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
			fo.init(this._logPointer, 0x04 | 0x08 | 0x10, 0664, 0);
			fo.write(text, text.length);
			fo.close();
		} catch(ex) {
			Components.utils.reportError(ex);
		}
	},
	_dumpStub: function() {},
	dumpObj: function(obj) {
		for (i in obj) {
			Components.utils.reportError(i + ": " + (obj[i] ? obj[i].toSource() : obj[i]));
		}
	}
};
DTA_debug.load();

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

function DTA_DropProcessor(func) {
	this.func = func;
};
DTA_DropProcessor.prototype = {
	getSupportedFlavours: function() {
		var flavours = new FlavourSet ();
		flavours.appendFlavour("text/x-moz-url");
		return flavours;
	},
	onDragOver: function(evt,flavour,session) {
	},
	onDrop: function (evt,dropdata,session) {
		if (!dropdata) {
			return;
		}
		var url = transferUtils.retrieveURLFromData(dropdata.data, dropdata.flavour.contentType);
		var doc = document.commandDispatcher.focusedWindow.document;
		url = new DTA_URL(url, doc.characterSet);
		var ref = doc.URL;
		if (!ref) {
			ref = DTA_Mediator.getMostRecentURL();
		}
		this.func(url, ref);
	}
};

var DTA_DropTDTA = new DTA_DropProcessor(function(url, ref) { DTA_AddingFunctions.saveSingleLink(true, url, ref); });
var DTA_DropDTA = new DTA_DropProcessor(function(url, ref) { DTA_AddingFunctions.saveSingleLink(false, url, ref); });

function DTA_AdditionalMatcher(str, regex) {
	this._str = str;
	this._regex = regex;
	this._filters = [];
	this.init();
};
DTA_AdditionalMatcher.prototype = {
	init: function() {
		if (!this._str) {
			return;
		}
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
			return ['http', 'https', 'ftp'].some(function(e) { return e == scheme; });
		}
		catch (ex) {
			// no op!
		}
		return false;
	},
	
	composeURL: function UM_compose(doc, rel) {
		// find <base href>
		var base = doc.location.href;
		var bases = doc.getElementsByTagName('base');
		for (var i = 0; i < bases.length; ++i) {
			if (bases[i].hasAttribute('href')) {
				base = bases[i].getAttribute('href');
				break;
			}
		}
		return this.ios.newURI(rel, doc.characterSet, this.ios.newURI(base, doc.characterSet, null)).spec;
	},

	saveSingleLink : function(turbo, url, referrer, description) {
		var hash = null;		
		var ml = DTA_getLinkPrintMetalink(url.url);
		if (ml) {
			url.url = ml;
		}
		else {
			hash = DTA_getLinkPrintHash(url.url);
		}
		url.url = url.url.replace(/#.*$/, '');
		
		var item = {
			'url': url,
			'referrer': referrer,
			'description': description,
			'hash': hash
		};

		if (turbo) {
			this.turboSendToDown([item]);
			return;
		}

		// else open addurl.xul
		var win = window.openDialog(
			"chrome://dta/content/dta/addurl.xul",
			"_blank",
			"chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no",
			item
		);
	},

	getDropDownValue : function(name) {
		var values = eval(DTA_preferences.getMultiByteDTA(name, '[]'));
		return values.length ? values[0] : '';
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

		this.sendToDown(!DTA_preferences.getDTA("lastqueued", false), urlsArray);
	},

	saveLinkArray : function(turbo, urls, images) {

		if (urls.length == 0 && images.length == 0) {
			throw new Components.Exception("no links");
		}

		if (turbo) {

			DTA_debug.dump("saveLinkArray(): DtaOneClick filtering started");

			var links;
			var type;
			if (DTA_preferences.getDTA("seltab", 0)) {
				links = images;
				type = 2;
			}
			else {
				links = urls;
				type = 1;
			}

			var additional = new DTA_AdditionalMatcher(
				this.getDropDownValue('filter'),
				DTA_preferences.getDTA('filterRegex', false)
			);
			links = links.filter(
				function(link) {
					if (additional.match(link.url.url)) {
						return true;
					}
					if (DTA_FilterManager.matchActive(link.url.url, type)) {
						return true;
					}
					return false;
				}
			);

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
	},
	removeTab: function WM_removeTab(url) {

		var useRM = false;
		try {
			var ver = Components.classes["@mozilla.org/xre/app-info;1"]
				.getService(Components.interfaces.nsIXULAppInfo)
				.platformVersion;
			var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
				.getService(Components.interfaces.nsIVersionComparator);
			useRM = versionChecker.compare(ver, "1.8") < 0;
		} catch (ex) {
			// nothing to do here.
			// seems to be an old version of Gecko/XRE.
		}
		var enumerator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator)
			.getEnumerator("navigator:browser");

		var chk = function(tab, url) {
			if (tab.currentURI.spec == url || tab.contentWindow.location == url) {
				return tab;
			}
			var frames = tab.contentWindow.frames;
			if (frames && frames.length) {
				for (var i = 0; i < frames.length; i++) {
					if (frames[i].location && frames[i].location == url) {
						return tab;
					}
				}
			}
			return null;
		};

		// Check each browser instance for our URL
		var numBrowsers = 0, numTabs = 0;
		var tab = null, browser = null;

		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			browser = win.getBrowser();

			++numBrowsers;
			numTabs = browser.browsers.length;

			// likely its the selected tab.
			if ((tab = chk(browser.selectedBrowser, url)) != null) {
				break;
			}
			// Check each tab of this browser instance
			for (var i = 0; i < numTabs && !tab; ++i) {
				tab = chk(browser.getBrowserAtIndex(i), url);
			}
			if (tab) {
				break;
			}
		}

		// nothing found :p
		if (!tab)	{
			return;
		}

		// newer gecko or more than one tab in window
		if (useRM || numTabs > 1) {
			browser.removeTab(tab);
		}
		// last tab, more windows, old gecko => close
		else if (numBrowsers > 1 || enumerator.hasMoreElements()) {
			win.close();
		}
		// old gecko, last tab, last window
		else {
			// this is the 1.8.0 way
			browser.addTab('about:blank');
			browser.removeTab(tab);
		}
	}
};

/**
 * Checks if a provided strip has the correct hash format
 * Supported are: md5, sha1, sha256, sha384, sha512
 * @param hash Hash to check
 * @return hash type or null
 */
const DTA_SUPPORTED_HASHES = {
	'MD5': 32,
	'SHA1': 40,
	'SHA256': 64
	/* Currently broken: https://bugzilla.mozilla.org/show_bug.cgi?id=383390
	'sha384': 96,
	'sha512':  128 */
};
function DTA_Hash(hash, type) {
	if (typeof(hash) != 'string' && !(hash instanceof String)) {
		throw new Components.Exception("hash is invalid");
	}
	if (typeof(type) != 'string' && (!type instanceof String)) {
		throw new Components.Exception("hashtype is invalid");
	}
	
	type = type.toUpperCase().replace(/[\s-]/g, '');
	if (!(type in DTA_SUPPORTED_HASHES)) {
		throw new Components.Exception("hashtype is invalid");
	}
	this.type = type;
	this.sum = hash.toLowerCase().replace(/\s/g, '');
	if (DTA_SUPPORTED_HASHES[this.type] != this.sum.length || isNaN(parseInt(this.sum, 16))) {
		throw new Components.Exception("hash is invalid");
	}
}

/**
 * Get a link-fingerprint hash from an url (or just the hash component)
 * @param url. Either String or nsIURI
 * @return Valid hash string or null
 */
function DTA_getLinkPrintHash(url) {
	if (url instanceof Components.interfaces.nsIURI) {
		url = url.spec;
	}
	else if (typeof(url) != 'string' && !(url instanceof String)) {
		return null;
	}
	
	var lp = url.match(/#!(md5|sha(?:1|256|384|512))!([\da-f]+)$/i);
	if (lp) {
		try {
			return new DTA_Hash(lp[2], lp[1]);
		}
		catch (ex) {
			// pass down
		}
	}
	return null;
}

/**
 * Get a link-fingerprint metalink from an url (or just the hash component
 * @param url. Either String or nsIURI
 * @param charset. Optional. Charset of the orgin link and link to be created
 * @return Valid hash string or null
 */
function DTA_getLinkPrintMetalink(url, charset) {
	if (url instanceof Components.interfaces.nsIURL) {
		url = url.ref;
	}
	else if (url instanceof Components.interfaces.nsIURI) {
		url = url.spec;
	}
	else if (typeof(url) != 'string' && !(url instanceof String)) {
		return null;
	}
	
	var lp = url.match(/#!metalink3!((?:https?|ftp):.+)$/);
	if (lp) {
		var rv = lp[1];
		try {
			return DTA_AddingFunctions.ios.newURI(rv, charset, null).spec;
		}
		catch (ex) {
			// not a valid link, ignore it.
		}
	}
	return null;
}

/**
 * wrapper around confirmEx
 * @param title. Dialog title
 * @param text. Dialog text
 * @param button0. Either null (omit), one of DTA_confirm.X or a string
 * @param button1. s.a.
 * @param button2. s.a.
 * @param default. Index of the Default button
 * @param check. either null, a boolean, or string specifying the prefs id.
 * @param checkText. The text for the checkbox
 * @return Either the button# or {button: #, checked: bool} if check was a boolean
 * @author Nils
 */
function DTA_confirm(aTitle, aText, aButton0, aButton1, aButton2, aDefault, aCheck, aCheckText) {
	var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
		.getService(Components.interfaces.nsIPromptService);
	var flags = 0;
	[aButton0, aButton1, aButton2].forEach(
		function(button, idx) {
			if (typeof(button) == "number") {
				flags += prompts['BUTTON_POS_' + idx] * button;
				button = null;
			}
			else if (typeof(button) == "string" || button instanceof String) {
				flags |= prompts['BUTTON_POS_' + idx] * prompts.BUTTON_TITLE_IS_STRING;
			}
			else {
				button = 0;
			}
		},
		this
	);
	if (aDefault == 1) {
		flags += prompts.BUTTON_POS_1_DEFAULT;
	}
	else if (aDefault == 2) {
		flags += prompts.BUTTON_POS_2_DEFAULT;
	}
	var check = {};
	if (aCheckText) {
		if (typeof(aCheck) == 'boolean') {
			var rv = {};
			check.value = aCheck;
		}
		else if (typeof(aCheck) == 'string' || aCheck instanceof String) {
			check.value = DTA_preferences.getDTA(aCheck, false);
		}
	}
	var cr = prompts.confirmEx(
		window,
		aTitle,
		aText,
		flags,
		aButton0,
		aButton1,
		aButton2,
		aCheckText,
		check
	);
	if (rv) {
		rv.checked = check.value;
		rv.button = cr;
		return rv;
	}
	return cr;
}
DTA_confirm.init = function() {
	for (x in Components.interfaces.nsIPromptService) {
		var r = new String(x).match(/BUTTON_TITLE_(\w+)$/);
		if (r) {
			DTA_confirm[r[1]] = Components.interfaces.nsIPromptService[x];
		}
	}
}
DTA_confirm.init();
function DTA_confirmOC(title, text) {
	return DTA_confirm(title, text, DTA_confirm.OK, DTA_confirm.CANCEL);
}
function DTA_confirmYN(title, text) {
	return DTA_confirm(title, text, DTA_confirm.YES, DTA_confirm.NO);
}
function DTA_alert(aTitle, aText) {
	Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
		.getService(Components.interfaces.nsIPromptService)
		.alert(window, aTitle, aText);
}

/**
 * Tiny helper to "convert" given object into a weak observer. Object must still implement .observe()
 * @author Nils
 * @param obj Object to convert
 */
function DTA_makeObserver(obj) {
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