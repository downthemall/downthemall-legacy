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
 *   Federico Parodi <f.parodi@tiscali.it>
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
 * 
 * @param uri
 *          Relative URI to the dta content path
 * @param many
 *          Optional. If set, then include that file more than once
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

var DTA_FilterManager = Components.classes['@downthemall.net/filtermanager;2']
	.getService(Components.interfaces.dtaIFilterManager);

function DTA_showPreferences() {
	var instantApply = DTA_preferences.get("browser.preferences.instantApply", false);
	window.openDialog(
		'chrome://dta/content/preferences/prefs.xul',
		'dtaPrefs',
		'chrome,titlebar,toolbar,resizable,centerscreen'+ (instantApply ? ',dialog=no' : '')
	);
}


var DTA_preferences = {};
Components.utils.import('resource://dta/preferences.jsm', DTA_preferences);

function DTA_getProfileFile(fileName) {
	var _profile = Components.classes["@mozilla.org/file/directory_service;1"]
		.getService(Components.interfaces.nsIProperties)
		.get("ProfD", Components.interfaces.nsIFile);
	DTA_getProfileFile = function(fileName) {
		var file = _profile.clone();
		file.append(fileName);
		return file;
	};
	return DTA_getProfileFile(fileName);
}

var DTA_debug = Components.classes['@downthemall.net/debug-service;1']
	.getService(Components.interfaces.dtaIDebugService);

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
			}
			catch (ex) {
				DTA_debug.log("DTA_URLhelpers: failed to decode: " + text, ex);
			}
		}
		return rv;
	}
};

function DTA_URL(url, preference) {
	this.preference = preference ? preference : 100;

	try {
		if (url instanceof Components.interfaces.nsIURI) {
			url = url.QueryInterface(Components.interfaces.nsIURL);
		}
		if (!(url instanceof Components.interfaces.nsIURL)) {
			throw new Components.Exception("you must pass an nsIURL");
		}

		this._url = url.clone();
	
		let hash = DTA_getLinkPrintHash(this._url);
		this._url.ref = '';		
		if (hash) {
			this.hash = hash;
		}
		this._usable = DTA_URLhelpers.decodeCharset(this._url.spec, this._url.originCharset);
	}
	catch (ex) {
		DTA_debug.log("failed to set URL", ex);
		throw ex;
	}
};
DTA_URL.prototype = {
	get url() {
		return this._url;
	},
	get usable() {
		return this._usable;
	},
	toSource: function DU_toSource() {
		return {
			url: this._url.spec,
			charset: this._url.originCharset,
			preference: this.preference
		}
	}
};

function DTA_DropProcessor(func) {
	this.func = func;
};
DTA_DropProcessor.prototype = {
	getSupportedFlavours: function() {
		var flavours = new FlavourSet();
		flavours.appendFlavour("text/x-moz-url");
		return flavours;
	},
	onDragOver: function(evt,flavour,session) {},
	onDrop: function (evt,dropdata,session) {
		if (!dropdata) {
			return;
		}
		try {
			var url = transferUtils.retrieveURLFromData(dropdata.data, dropdata.flavour.contentType);
			if (!DTA_AddingFunctions.isLinkOpenable(url)) {
				throw new Components.Exception("Link cannot be opened!");
			}
			url = this.ios.newURI(url, null, null);
		}
		catch (ex) {
			DTA_debug.log("Failed to process drop", ex);
			return;
		}
		var doc = document.commandDispatcher.focusedWindow.document;
		
		let ml = DTA_getLinkPrintMetalink(url);
		url = new DTA_URL(ml ? ml : url);
		
		let ref = DTA_AddingFunctions.getRef(doc);
		this.func(url, ref);
	}
};

var DTA_DropTDTA = new DTA_DropProcessor(function(url, ref) { DTA_AddingFunctions.saveSingleLink(true, url, ref); });
var DTA_DropDTA = new DTA_DropProcessor(function(url, ref) { DTA_AddingFunctions.saveSingleLink(false, url, ref); });

var DTA_AddingFunctions = {
	ios: Components.classes["@mozilla.org/network/io-service;1"]
		.getService(Components.interfaces.nsIIOService),

	isLinkOpenable : function(url) {
		if (url instanceof DTA_URL) {
			url = url.url.spec;
		}
		else if (url instanceof Components.interfaces.nsIURL) {
			url = url.spec;
		}
		try {
			var scheme = this.ios.extractScheme(url);
			return ['http', 'https', 'ftp'].indexOf(scheme) != -1;
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
		return this.ios.newURI(rel, doc.characterSet, this.ios.newURI(base, doc.characterSet, null));
	},
	
	getRef: function(doc) {
		var ref = doc.URL;
		if (!this.isLinkOpenable(ref)) {
			var b = doc.getElementsByTagName('base');
			for (var i = 0; i < b.length; ++i) {
				if (!b[i].hasAttribute('href')) {
					continue;
				}
				try {
					ref = this.composeURL(doc, b[i].getAttribute('href')).spec;
				}
				catch (ex) {
					continue;
				}
				break;
			}
		}
		return this.isLinkOpenable(ref) ? ref: '';
	},	

	saveSingleLink : function(turbo, url, referrer, description, postData) {
		var item = {
			'url': url,
			'referrer': referrer,
			'description': description
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
		var values = eval(DTA_preferences.getExt(name, '[]'));
		return values.length ? values[0] : '';
	},

	turboSendToDown : function(urlsArray) {

		var dir = this.getDropDownValue('directory');
		var mask = this.getDropDownValue('renaming');

		if (!mask || !dir) {
			throw new Components.Exception("missing required information");
		}

		var num = DTA_preferences.getExt("counter", 0);
		if (++num > 999) {
			num = 1;
		}
		DTA_preferences.setExt("counter", num);

		for (var i = 0; i < urlsArray.length; i++) {
			urlsArray[i].mask = mask;
			urlsArray[i].dirSave = dir;
			urlsArray[i].numIstance = num;
		}

		this.sendToDown(!DTA_preferences.getExt("lastqueued", false), urlsArray);
	},

	saveLinkArray : function(turbo, urls, images) {

		if (urls.length == 0 && images.length == 0) {
			throw new Components.Exception("no links");
		}

		if (turbo) {

			DTA_debug.logString("saveLinkArray(): DtaOneClick filtering started");

			var links;
			var type;
			if (DTA_preferences.getExt("seltab", 0)) {
				links = images;
				type = 2;
			}
			else {
				links = urls;
				type = 1;
			}

			var fast = null;
			try {
				fast = DTA_FilterManager.getTmpFromString(this.getDropDownValue('filter'));
			}
			catch (ex) {
				// fall-through
			}
			links = links.filter(
				function(link) {
					if (fast && (fast.match(link.url.usable) || fast.match(link.description))) {
						return true;
					}
					return DTA_FilterManager.matchActive(link.url.usable, type);
				}
			);

			DTA_debug.logString("saveLinkArray(): DtaOneClick has filtered " + links.length + " URLs");

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
			var win = DTA_Mediator.getByUrl("chrome://dta/content/dta/manager.xul");
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
			return DTA_Mediator.getByUrl("chrome://dta/content/dta/manager.xul");
		} catch(ex) {
			DTA_debug.log("openManager():", ex);
		}
		return null;
	},

	sendToDown : function(start, links) {
		var win = DTA_Mediator.getByUrl("chrome://dta/content/dta/manager.xul");
		if (win) {
			win.self.startDownloads(start, links);
			return;
		}
		win = window.openDialog(
			"chrome://dta/content/dta/manager.xul",
			"_blank",
			"chrome, centerscreen, resizable=yes, dialog=no, all, modal=no, dependent=no",
			start,
			links
		);
	}
}
var DTA_Mediator = {
	_m: Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator),
	_ios: Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService),
	

	getMostRecent: function(name)	{
		var names = ['navigator:browser', 'mail:messageWindow', 'mail:3pane'];
		if (name) {
			names.unshift(name);
		}
		var rv = null;
		names.some(
			function(name) {
				rv = this._m.getMostRecentWindow(name);
				return rv;
			},
			this
		);
		return rv;
	},
	getByUrl: function(url) {
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
	getAllByType: function(type) {
		var rv = [];
		var enumerator = this._m.getEnumerator(type);
		while (enumerator.hasMoreElements()) {
			rv.push(enumerator.getNext());
		}
		return rv;
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
		if (!url instanceof Components.interfaces.nsIURI) {
			throw new Error("Cannot open non nsIURI");
		}
		if (ref && !(ref instanceof Components.interfaces.nsIURI)) {
			try {
				ref = DTA_AddingFunctions.ios.newURI(ref, null, null);
			}
			catch (ex) {
				DTA_debug.log(ref, ex);
				ref = null;
			}
		}
		try {
			if ('delayedOpenTab' in win) {
				win.delayedOpenTab(url, ref);
				return;
			}
			win.getBrowser().addTab(url, ref);
		}		
		// thunderbird?
		catch (ex) {
			try {
				var ps = Components.classes['@mozilla.org/uriloader/external-protocol-service;1']
					.getService(Components.interfaces.nsIExternalProtocolService);
				ps.loadUrl(url);
			}
			catch (ex) {
				DTA_debug.log("cannot open link", ex);
			}			
		}
	},
	removeTab: function WM_removeTab(url) {
		function chk(browser, url) {
			if (browser.currentURI.spec == url) {
				return true;
			}
			var frames = browser.contentWindow.frames;
			if (frames && frames.length) {
				for (var i = 0; i < frames.length; i++) {
					if (frames[i].location && frames[i].location == url) {
						return true;
					}
				}
			}
			return false;
		};		
		
		var enumerator = this._m.getEnumerator("navigator:browser");
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			var browser = win.getBrowser();
			for (var i = browser.browsers.length - 1; i >= 0; --i) {
				if (chk(browser.getBrowserAtIndex(i), url)) {
					browser.removeTab(browser.mTabContainer.childNodes[i]);
					return;
				}
			}
		}
	}
};

/**
 * Checks if a provided strip has the correct hash format Supported are: md5,
 * sha1, sha256, sha384, sha512
 * 
 * @param hash
 *          Hash to check
 * @return hash type or null
 */
const DTA_SUPPORTED_HASHES = {
	'MD5': 32,
	'SHA1': 40,
	'SHA256': 64,
	'SHA384': 96,
	'SHA512':  128
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
DTA_Hash.prototype = {
	toString: function() {
		return this.type + " [" + this.sum + "]";
	}
};

/**
 * Get a link-fingerprint hash from an url (or just the hash component)
 * 
 * @param url.
 *          Either String or nsIURI
 * @return Valid hash string or null
 */
function DTA_getLinkPrintHash(url) {
	if (!(url instanceof Components.interfaces.nsIURL)) {
		return null;
	}
	var lp = url.ref.match(/^hash\((md5|sha(?:1|256|384|512)):([\da-f]+)\)$/i); 
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
 * 
 * @param url.
 *          Either String or nsIURI
 * @param charset.
 *          Optional. Charset of the orgin link and link to be created
 * @return Valid hash string or null
 */
function DTA_getLinkPrintMetalink(url) {
	if (!(url instanceof Components.interfaces.nsIURL)) {
		return null;
	}
	let lp = url.ref.match(/^!metalink3!(.+)$/);
	if (lp) {
		let rv = lp[1];
		try {
			rv = DTA_AddingFunctions.ios.newURI(rv, url.originCharset, url);
			if (DTA_AddingFunctions.isLinkOpenable(rv.spec)) {
				return rv;
			}
		}
		catch (ex) {
			alert(ex);
			// not a valid link, ignore it.
		}
	}
	return null;
}

/**
 * Tiny helper to "convert" given object into a weak observer. Object must still
 * implement .observe()
 * 
 * @author Nils
 * @param obj
 *          Object to convert
 */
function DTA_makeObserver(obj) {
	// nsiSupports
	let __QueryInterface = obj.QueryInterface;
	obj.QueryInterface = function(iid) {
		try {
			if (
				iid.equals(Components.interfaces.nsISupports)
				|| iid.equals(Components.interfaces.nsISupportsWeakReference)
				|| iid.equals(Components.interfaces.nsIWeakReference)
				|| iid.equals(Components.interfaces.nsIObserver)
			) {
				return obj;
			}
			if (__QueryInterface) {
				debug("calling original: " + iid);
				return __QueryInterface.call(this, iid);
			}
			throw Components.results.NS_ERROR_NO_INTERFACE;
		}
		catch (ex) {
			debug("requested interface not available: " + iid);
			throw ex;
		}
	};
	// nsiWeakReference
	obj.QueryReferent = function(iid) {
		return obj.QueryInterface(iid);
	};
	// nsiSupportsWeakReference
	obj.GetWeakReference = function() {
		return obj;
	};	
}