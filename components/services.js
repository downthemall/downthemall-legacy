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
 * The Original Code is the DownThemAll! Services component.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
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
 
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const ctor = Components.Constructor;
const Exception = Components.Exception;
const module = Components.utils.import;
const error = Components.utils.reportError;

module("resource://gre/modules/XPCOMUtils.jsm");

const NS_ERROR_NO_INTERFACE = Cr.NS_ERROR_NO_INTERFACE;
const NS_ERROR_FAILURE = Cr.NS_ERROR_FAILURE;
const NS_ERROR_NO_AGGREGATION = Cr.NS_ERROR_NO_AGGREGATION;
const NS_ERROR_INVALID_ARG = Cr.NS_ERROR_INVALID_ARG;

const PREF_SNIFFVIDEOS = 'extensions.dta.listsniffedvideos';
const PREF_FILTERS_BASE = 'extensions.dta.filters.';

const ABOUT_URI = 'http://code.downthemall.net/about/%BASE_VERSION%/?locale=%LOCALE%&app=%APP_ID%&version=%APP_VERSION%';

const LINK_FILTER = Ci.dtaIFilter.LINK_FILTER;
const IMAGE_FILTER = Ci.dtaIFilter.IMAGE_FILTER;
const TOPIC_FILTERSCHANGED = 'DTA:filterschanged';

const nsITimer = Ci.nsITimer;

const Timer = ctor('@mozilla.org/timer;1', 'nsITimer', 'init');
const ScriptableInputStream = new ctor('@mozilla.org/scriptableinputstream;1', 'nsIScriptableInputStream', 'init');
const FileStream = new ctor('@mozilla.org/network/file-output-stream;1', 'nsIFileOutputStream', 'init');
const ScriptError = new ctor('@mozilla.org/scripterror;1', 'nsIScriptError', 'init');

this.__defineGetter__(
	'Preferences',
	function() {
		let prefs = {};
		module('resource://dta/preferences.jsm', prefs);
		delete this.Preferences;
		return (this.Preferences = prefs); 
	}
);

this.__defineGetter__(
	'pbm',
	function() {
		let pbm = {};
		module('resource://dta/pbm.jsm', pbm);
		delete this.pbm;
		return (this.pbm = pbm); 
	}
);


this.__defineGetter__(
	'Observers',
	function() {
		let obs = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
		delete this.Observers;
		return (this.Observers = obs); 
	}
);


function log(str, ex) {
	try {
		let _debugServ = Cc['@downthemall.net/debug-service;1']
			.getService(Ci.dtaIDebugService);
		log = function(str, ex) {
			if (ex) {
				_debugServ.log(str, ex);
			}
			else {
				_debugServ.logString(str);
			}
		}
		log(str, ex);
	}
	catch (oex) {
		error(str + ": " + ex);
	}
}

/**
 * DebugService
 */
function DebugService() {
	this._pb.addObserver('extensions.dta.logging', this, true);
	this._setEnabled(this._pb.getBoolPref('extensions.dta.logging'));
	
	try {
		if (this._file.fileSize > (200 * 1024)) {
			this.remove();
		}
	}
	catch(ex) {
		// No-Op
	}
}

DebugService.prototype = {
	classDescription: "DownThemAll! Debug and Logging Service",
	contractID: "@downthemall.net/debug-service;1",
	classID: Components.ID("0B82FEBB-59A1-41d7-B31D-D5A686E11A69"),
	
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference, Ci.nsIWeakReference, Ci.dtaIDebugService]),
	
	QueryReferent: function(iid) this.QueryInterface(iid),
	GetWeakReference: function() this,
	
	// nsIObserver
	observe: function DS_observe(subject, topic, prefName) {
		this._setEnabled(this._pb.getBoolPref('extensions.dta.logging'));	
	},
	
	get _cs() {
		delete DebugService.prototype._cs;
		return (DebugService.prototype._cs = Cc['@mozilla.org/consoleservice;1'].getService(Ci.nsIConsoleService));
	},
	get _pb() {
		delete DebugService.prototype._pb;
		return (DebugService.prototype._pb = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch2));
	},
	
	get _file() {
		let file = Cc["@mozilla.org/file/directory_service;1"]
			.getService(Ci.nsIProperties)
			.get("ProfD", Ci.nsILocalFile);
		 file.append('dta_log.txt');
		 delete DebugService.prototype._file;
		 return (DebugService.prototype._file = file);
	},
	
	get file() {
		return this._file;
	},
	get enabled() {
		return this._enabled;
	},
	_setEnabled: function DS_setEnabled(nv) {
		this._enabled = nv;
		if (nv) {
			this.logString = this.log = this._log;
		}
		else {
			this.logString = this.log = this._logDisabled;
		}
	},
	_formatTimeDate: function DS_formatTimeDate(value) {
		return String(value).replace(/\b(\d)\b/g, "0$1");
	},
	_log: function DS__log(msg, exception) {
		try {
			if (!msg || (msg == "" && typeof(exception) != "object")) {
				return;
			}
			if (!(msg instanceof String) && typeof(msg) != 'string') {
				for (var i = 0; i < 10 && msg.wrappedJSObject; ++i) {
					msg = msg.wrappedJSObject;
				}
				msg = msg.toSource();
			}
			let time = new Date();
			let text = [];
			text.push(this._formatTimeDate(time.getHours()));
			text.push(':');
			text.push(this._formatTimeDate(time.getMinutes()));
			text.push(':');
			text.push(this._formatTimeDate(time.getSeconds()));
			text.push('::');
			text.push(time.getMilliseconds());
			text.push('\n');

			if (msg != "") {
				text.push(msg.replace(/\n/g, "\n\t") + " ");
			}
			if (exception) {
				text.push("\tError: " + exception);
			}
			text.push('\n');
			let stack = Components.stack;
			if (stack) {
				stack = stack.caller.caller;
			}
			let lineNumber = 0;
			let columnNumber = 0;
			let fileName = null;
			let sourceLine = '';
			
			
			if (exception && exception.location) {
				lineNumber = exception.lineNumber;
				fileName = exception.filename;
				columnNumber = exception.columnNumber;
				stack = exception.location;

				let initialLine = "Source Frame :: " + fileName;
				initialLine += " :: " + exception.location;
				initialLine += " :: line: " + lineNumber;
				text.push('\t>');
				text.push(initialLine);
				text.push('\n');
			}
			else if (exception && exception.stack) {
				lineNumber = exception.lineNumber;
				fileName = exception.fileName;
				columnNumber = 0;
				let initialLine = "Source Frame (error) :: " + fileName;
				initialLine += " :: " + exception.name;
				initialLine += " :: line: " + lineNumber;
				text.push("\t>" + initialLine + "\n");
				
			}
			else if (exception && stack) {
				lineNumber = stack.lineNumber;
				fileName = stack.filename;
				let initialLine = "Source Frame (stack) :: " + fileName;
				initialLine += " :: " + stack.name;
				initialLine += " :: line: " + lineNumber;
				text.push('\t>');
				text.push(initialLine);
				text.push('\n');
			}
			else if (stack) {
				text.push('\t>');
				text.push(stack.toString());
				text.push('\n');
				lineNumber = stack.lineNumber;
				fileName = stack.filename;
			}
			
			if (stack instanceof Ci.nsIStackFrame) {
				let sourceLine = stack.sourceLine;
				let s = stack.caller;
				for (let i = 0; i < 4 && s; ++i) {
					text.push('\t>');
					text.push(s.toString());
					text.push('\n');
					s = s.caller;
				}
				text = text.join('');
				if (stack && exception) {
					this._cs.logMessage(new ScriptError(text, fileName, sourceLine, lineNumber, columnNumber, 0x2, 'component javascript'));
					 
				} 
				else {
					this._cs.logStringMessage(text);
				}
			}
			else {
				text = text.join('');
				this._cs.logStringMessage(text);
			}
			var f = new FileStream(this.file, 0x04 | 0x08 | 0x10, 0664, 0);
			f.write(text, text.length);
			f.close();
		}
		catch(ex) {
			error(ex);
		}	
	
	},
	_logDisabled: function DS__dumpDisabled() {
		// no-op;
	},
	log: this._log,
	logString: this._log,
		
	remove: function DS_remove() {
		try {
			this._file.remove(false);
		}
		catch (ex) {
			throw Cr.NS_ERROR_FAILURE;
		}
	}
};

/**
 * Privacy Controls
 */
function PrivacyControls() {};
PrivacyControls.prototype = {
	classDescription: "DownThemAll! Privacy Control",
	contractID: "@downthemall.net/privacycontrol;1",
	classID: Components.ID("db7a8d60-a4c7-11da-a746-0800200c9a66"),		
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference, Ci.nsIWeakReference]),				
	_xpcom_categories: [{category: 'app-startup', service: true}],		

	init: function() {
		Observers.addObserver(this, 'profile-change-teardown', false);
		Observers.addObserver(this, 'xpcom-shutdown', false);
	},
	dispose: function() {
		// always remove observers ;)
		Observers.removeObserver(this, 'profile-change-teardown');
		Observers.removeObserver(this, 'xpcom-shutdown');
	},
	observe: function(subject, topic, data) {
		switch (topic) {
		case 'app-startup':
			this.init();
			break;
			
		case 'xpcom-shutdown':
			this.dispose();
			break;

		case 'profile-change-teardown':
			this.onShutdown();
			break;

		case 'clean':
			this.clean();
			break;
		}
	},

	clean: function() {
		log('clean()');
		
		// Cleaning prefs
		for each (let e in ['directory', 'filter', 'renaming']) {
			try {
				resetExt.resetExt(e);
			}
			catch (ex) {
				log("Cannot clear pref: " + e, ex);
			}
		}
		
		// Cleaning files
		try {
			let prof = Cc["@mozilla.org/file/directory_service;1"]
				.getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
			for each (let e in ['dta_history.xml', 'dta_log.txt', 'dta_queue.sqlite']) {
				try {
					var file = prof.clone();
					file.append(e);
					if (file.exists()) {
						file.remove(false);
					}
				}
				catch (ex) {
					log('Cannot remove: ' + e, ex);
				}
			}
		}
		catch (oex) {
			log('failed to clean files: ', oex);
		}
	},

	onShutdown : function() {
		let branch = Preferences.getBranch('privacy.');

		// has user pref'ed to sanitize on shutdown?
		if (branch.getBoolPref('sanitize.sanitizeOnShutdown') && branch.getBoolPref('clearOnShutdown.extensions-dta')){
			this.clean();
		}
	}
};

/**
 * MigrationService
 */
function MigrationService() {}
MigrationService.prototype = {
	classDescription: "DownThemAll! Migration Service",
	contractID: "@downthemall.net/migration-service;1",
	classID: Components.ID("F66539C8-2590-4e69-B189-F9F8595A7670"),
	_xpcom_categories: [{category: 'app-startup', service: true}],
	
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference, Ci.nsIWeakReference, Ci.nsIWindowMediatorListener]),
	
	QueryReferent: function(iid) this.QueryInterface(iid),
	GetWeakReference: function() this,
	
	_mediator: {},

	_migrate: function MM_migrate() {
		let DTA = {};
		module('resource://dta/version.jsm', DTA);		
		
		try {
			log("current " + DTA.VERSION);

			let lastVersion = Preferences.getExt('version', '0');
			if (0 == DTA.compareVersion(DTA.BASE_VERSION, lastVersion)) {
				return;
			}
			log("MigrationManager: migration started");
			if (DTA.compareVersion(lastVersion, "1.0.1") < 0) {
				this._execute(['ResetMaxConnections']);
			}			
			
			Preferences.setExt('version', DTA.BASE_VERSION);

			module('resource://dta/mediator.jsm', this._mediator);
			this._mediator.addListener(this);
		}
		catch(ex) {
			log("MigrationManager:", ex);
			try {
				Preferences.resetExt("version");
			}
			catch (ex) {
				// XXX
			}
		}
	},
	_execute: function MM_execute(types) {
		for each (let e in types) {
			try {
				this['_migrate' + e]();
			}
			catch (ex) {
				log('MigrationManager: failed to migrate ' + e, ex);
			}
		}
	},
	
	// 1.0.1: #613 Multiple "slow-down" reports
	_migrateResetMaxConnections: function() {
		log("resetting connection prefs");
		for each (let e in ['network.http.max-connections', 'network.http.max-connections-per-server', 'network.http.max-persistent-connections-per-server']) {
			Preferences.reset(e);
		}
	},
	
	// nsIObserver
	observe: function MM_observe(subject, topic, prefName) {
		if (topic == 'app-startup') {
			try {
				Observers.removeObserver(this, 'app-startup');
			}
			catch (ex) { /* no-op */ }
			Observers.addObserver(this, 'final-ui-startup', false);
		}
		
		else if (topic == "final-ui-startup") {
			try {
				Observers.removeObserver(this, 'final-ui-startup');
			}
			catch (ex) { /* no-op */ }			
			this._migrate();
		}
	},
	onWindowTitleChange: function() {},
	onOpenWindow: function(window) {
		try {
		let dw = window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowInternal);
		let tp = this;
		this._loadFunc = function() {
			dw.removeEventListener('load', tp._loadFunc, false);
			dw.setTimeout(function() { tp.onWindowLoad(dw); }, 600);
		};
		dw.addEventListener('load', this._loadFunc, false);
		}
		catch (ex) {
			log(ex);
		}
	},
	onCloseWindow: function() {},
	onWindowLoad: function(window) {
		log("loaded: " + window.location);
		if (this._loaded) {
			return;
		}
		if (this._mediator.tryOpenUrl(window, 'about:downthemall')) {
			this._loaded = true;
			this._mediator.removeListener(this);
		}
	}
};

/**
 * ContentHandling
 */
function ContentHandling() {}
ContentHandling.prototype = {
	classDescription: 'DownThemAll! Content Handling',
	classID: Components.ID('35eabb45-6bca-408a-b90c-4b22e543caf4'),
	contractID: '@downthemall.net/contenthandling;2',
	
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsIURIContentListener, Ci.dtaIContentHandling]),
	
	_xpcom_categories: [{category: 'app-startup', service: true}],
	
	// ensure that there is only one instance of this service around
	_xpcom_factory: {
		_instance: null,
		createInstance: function(outer, iid) {
			if (outer) {
				throw Cr.NS_ERROR_NO_AGGREGATION;
			}
			if (!this._instance) {
				this._instance = new ContentHandling();
			}
			return this._instance.QueryInterface(iid);
		}
	},
	
	_init: function ct__init() {
		Observers.addObserver(this, 'http-on-modify-request', false);
		Observers.addObserver(this, 'http-on-examine-response', false);
		Observers.addObserver(this, 'http-on-examine-cached-response', false);
		Observers.addObserver(this, 'xpcom-shutdown', false);
		Observers.addObserver(this, 'private-browsing', false);
		this._ps = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch2);
		this._ps.addObserver(PREF_SNIFFVIDEOS, this, false);
		this.sniffVideos = this._ps.getBoolPref(PREF_SNIFFVIDEOS);
	},
	_uninit: function ct__uninit() {
		Observers.removeObserver(this, 'http-on-modify-request');
		Observers.removeObserver(this, 'http-on-examine-response');
		Observers.removeObserver(this, 'http-on-examine-cached-response');
		Observers.removeObserver(this, 'xpcom-shutdown');
		Observers.removeObserver(this, 'private-browsing');
		this._ps.removeObserver('extensions.dta.listsniffedvideos', this);
	},
	observe: function ct_observe(subject, topic, data) {
		if (topic == 'app-startup') {
			this._init();
		}
		else if (topic == 'xpcom-shutdown') {
			this._uninit();
		}
		else if (topic == 'http-on-modify-request') {
			this.observeRequest(subject, topic, data);
		}
		else if (topic == 'http-on-examine-response' || topic == 'http-on-examine-cached-response') {
			this.observeResponse(subject, topic, data);
		}
		else if (topic == 'nsPref:changed') {
			try {
				this.sniffVideos = subject.QueryInterface(Ci.nsIPrefBranch).getBoolPref(PREF_SNIFFVIDEOS);
			}
			catch (ex) {
				log("Failed to get sniffVideos pref", ex);
			}
		}
		else if (topic == 'private-browsing') {
			this._clearPostData();
			this._clearVideos();
		}
	},
	observeRequest: function ct_observeRequest(subject, topic, data) {
		if (
			!(subject instanceof Ci.nsIHttpChannel)
			|| !(subject instanceof Ci.nsIUploadChannel)
		) {
			return;
		}
		var channel = subject.QueryInterface(Ci.nsIHttpChannel);
				
		if (channel.requestMethod != 'POST') {
			return;
		}
				
		var post;
		
		try {
			var us = subject.QueryInterface(Ci.nsIUploadChannel).uploadStream;
			if (!us) {
				return;
			}
			try {
				us.QueryInterface(Ci.nsIMultiplexInputStream);
				log("ignoring multiplex stream");
				return;
			}
			catch (ex) {
				// no op
			}
				
			let ss = us.QueryInterface(Ci.nsISeekableStream);
			if (!ss) {
				return;
			}
			let op = ss.tell();
		
			ss.seek(0, 0);
			
			let is = new ScriptableInputStream(us);
			
			// we'll read max 64k
			let available = Math.min(is.available(), 1 << 16);
			if (available) {
				post = is.read(available);
			}
			ss.seek(0, op);
			
			if (post) {
				this._registerData(channel.URI, post);
			}
		}
		catch (ex) {
			log("cannot get post-data", ex);
		}
 	},
	observeResponse: function ct_observeResponse(subject, topic, data) {
		if (!this.sniffVideos || !(subject instanceof Ci.nsIHttpChannel)) {
			return;
		}
		let channel = subject.QueryInterface(Ci.nsIHttpChannel);
		try {
			if (!channel.requestSucceeded) {
				return;
			}
			let ct = '';
			for each (let x in ['Content-Type', 'Content-Disposition']) {
				try {
					ct += channel.getResponseHeader('Content-Type');
				}
				catch (ex) {
					// no op
				}
			}
			if (
					(/\.(flv|ogg|ogm|ogv|avi|divx|mp4)\b/i.test(channel.URI.spec) && !/\.swf\b/i.test(channel.URI.spec)) 
					|| ct.match(/\b(flv|ogg|ogm|avi|divx|mp4)\b/i)
			) {
				let wp = null;
				if (channel.loadGroup && channel.loadGroup.groupObserver) {
					wp = channel.loadGroup.groupObserver.QueryInterface(Ci.nsIWebProgress);					
				}
				if (!wp) {
					wp = channel.notificationCallbacks.getInterface(Ci.nsIWebProgress);
				}
				 
				if (!wp || !wp.DOMWindow) {
					return 
				}
				let wn = wp.DOMWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIWebNavigation);
				if (!wn || !wn.currentURI) {
					return;
				}
				let parentURI = wn.currentURI;
				if (!parentURI.schemeIs('http') && !parentURI.schemeIs('https') && !parentURI.schemeIs('ftp')) {
					return;
				}
				this._registerVideo(parentURI, channel.URI);
			}
		}
		catch (ex) {
			// no op
		}
	},
	_dataDict: {},
	_dataArray: [],
	_clearPostData: function ct__clearPostData() {
		this._dataDict = {};
		this._dataArray = [];
	},
	_registerData: function ct__registerData(uri, data) {
		uri = uri.spec;

		if (!(uri in this._dataDict)) {
			if (this._dataArray.length > 5) {
				delete this._dataDict[this._dataArray.pop()];
			}
			this._dataArray.push(uri);
		}
		
		this._dataDict[uri] = data;  	
	},
	
	_sniffVideos: false,
	get sniffVideos() {
		return this._sniffVideos;
	},
	set sniffVideos(nv) {
		this._sniffVideos = nv;
		if (!nv) {
			this._clearVideos();
		}
		return nv;
	},
	_vidDict: {},
	_vidArray: [],
	_clearVideos: function ct__clearVideos() {
		this._vidDict = {};
		this._vidArray = [];
	},
	_registerVideo: function ct__registerVideo(uri, vid) {
		uri = uri.spec;
		if (!(uri in this._vidDict)) {
			if (this._vidArray.length > 20) {
				delete this._vidDict[this._vidArray.pop()];
			}
			this._vidArray.push(uri);
			this._vidDict[uri] = {};
		}
		this._vidDict[uri][vid.spec] = vid;
	},
	
	getPostDataFor: function ct_getPostDataFor(uri) {
		if (uri instanceof Ci.nsIURI) {
			uri = uri.spec;
		}
		if (!(uri in this._dataDict)) {
			return '';
		}
		return this._dataDict[uri];
	},
	getSniffedVideosFor: function ct_getSniffedVideosFor(uri) {
		if (uri instanceof Ci.nsIURI) {
			uri = uri.spec;
		}
		let rv = [];
		if (!(uri in this._vidDict)) {
			return rv;
		}
		let vids = this._vidDict[uri];
		for each (let v in vids) {
			log(v.spec);
			rv.push(v.clone());
		}
		return rv;
	}
};

/**
 * AboutModule
 */
function AboutModule() {}
AboutModule.prototype = {
	classDescription: "DownThemAll! about module",
	classID: Components.ID('bbaedbd9-9567-4d11-9255-0bbae236ecab'),
	contractID: '@mozilla.org/network/protocol/about;1?what=downthemall',
	
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),
	
  newChannel : function(aURI) {
		try {
		    let io = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService);
		    let sec = Cc['@mozilla.org/scriptsecuritymanager;1'].getService(Ci.nsIScriptSecurityManager);
		    
		    let version = {};
		    Components.utils.import('resource://dta/version.jsm', version);
		    
		    let ru = ABOUT_URI.replace(
		    	/%(.+?)%/g,
		    	function (m, m1) (m1 in version) ? version[m1] : m
		    );
		    
		    let uri = io.newURI(ru, null, null);
		    let chan = io.newChannelFromURI(uri);
		    chan.originalURI = aURI;
		    chan.owner = sec.getCodebasePrincipal(uri);
		    
		    return chan;
		}
		catch (ex) {
			log(ex);
			throw ex;
		}
	},
	
	getURIFlags: function(aURI) {
	    return Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT;
	}	
};

/**
 * FilterManager
 */
// no not create DTA_Filter yourself, managed by FilterManager
function Filter(name) {
	this._id = name;
}
Filter.prototype = {
	classDescription: "DownThemAll! Filter",
	contractID: "@downthemall.net/filter;1",
	classID: Components.ID("1CF86DC0-33A7-43b3-BDDE-7ADC3B35D114"),		
	QueryInterface: XPCOMUtils.generateQI([Ci.dtaIFilter]),		
	
	_persist: true,
	_sessionActive: null,	
	get persist() {
		return this._persist;
	},
	set persist(nv) {
		this._persist = !!nv;
		if (!this._persist) {
			this._sessionActive = this._active;
		}
	},
	
	// exported
	get id() {
		return this._id.slice(PREF_FILTERS_BASE.length);
	},

	// exported
	get defFilter() {
		return this._defFilter;
	},

	// exported
	get label() {
		return this._label;
	},
	set label(value) {
		if (this._label == value) {
			return;
		}
		this._label = value;
		this._modified = true;
	},

	// exported
	get expression() {
		return this._expr;
	},
	set expression(value) {
		if (this._expr == value) {
			return;
		}
		this._expr = value;
		this._regs = [];
		this._makeRegs(this._expr);
		
		this._modified = true;		
	},
	_makeRegs: function FM__makeRegs(str) {
	
		str = str.replace(/^\s+|\s+$/g, '');
		
		// first of all: check if we are are a regexp.
		if (str.length > 2 && str[0] == '/') {
			try {
				var m = str.match(/^\/(.+?)(?:\/(i?))?$/);
				if (!m) {
					throw new Exception("Invalid RegExp supplied");
				}
				if (!m[1].length) {
					return;
				}
				this._regs.push(new RegExp(m[1], m[2]));
				return;
			}
			catch (ex) {
				// fall-through
			}
		}
	
		var parts = str.split(',');
		// we contain multiple filters
		if (parts.length > 1) {
			for each (var s in parts) { 
				this._makeRegs(s);
			}
			return;
		}

		// we are simple text
		str = str
			.replace(/([/{}()\[\]\\^$.])/g, "\\$1")
			.replace(/\*/g, ".*")
			.replace(/\?/g, '.');
		if (str.length) {				
			this._regs.push(new RegExp(str, 'i'));
		}
	},

	// exported
	get active() {
		return this._persist ? this._active : this._sessionActive;
	},
	set active(value) {
		if (this.active == !!value) {
			return;
		}
		if (this._persist) {
			this._active = !!value;
			this._modified = true;
		}
		else {
			this._sessionActive = !!value;
		}
	},

	// exported
	get type() {
		return this._type;
	},
	set type(t) {
		if (this._type == t) {
			return;
		}
		this._type = t;
		this._modified = true;
	},

	pref: function F_pref(str) {
		return this._id + "." + str;
	},

	match: function F_match(str) {
		if (!str) {
			return;
		}
		return this._regs.some(
			function(reg) {
				return str.search(reg) != -1;
			}
		);
	},

	/**
	 * @throws Exception in case loading failed
	 */
	load: function F_load(localizedLabel) {
		this._localizedLabel = localizedLabel;
		this._label = Preferences.get(this.pref('label'));
		if (!this._label || !this._label.length) {
			throw Exception("Empty filter!");
		}
		// localize the label, but only if user didn't change it.
		if (localizedLabel && !Preferences.hasUserValue(this.pref('label'))) {
			this._label = localizedLabel;
		}
				
		this._active = Preferences.get(this.pref('active'));
		this._type = Preferences.get(this.pref('type'));
		this._defFilter = this._id.search(/deffilter/) != -1;
		
		// may throw
		this.expression = Preferences.get(this.pref('test'));
		
		this._modified = false;
	},

	// exported
	save: function F_save() {
		if (!this._modified) {
			return;
		}
		Preferences.set(this.pref('active'), this._active);
		Preferences.set(this.pref('test'), this._expr);
		Preferences.set(this.pref('type'), this._type);
			
		// save this last as FM will test for it.
		Preferences.set(this.pref('label'), this._label);

		this._modified = false;
	},

	_reset: function F_reset() {
		Preferences.resetBranch(this._id);
	},

	// exported
	restore: function F_restore() {
		if (!this._defFilter) {
			throw new Exception("only default filters can be restored!");
		}
		this._reset();
	},

	// exported
	remove: function F_remove() {
		if (this._defFilter) {
			throw new Exception("default filters cannot be deleted!");
		}
		this._reset();
	},

	toString: function() {
		return this._label + " (" + this._id + ")";
	},

	toSource: function() {
		return this.toString() + ": " + this._regs.toSource();
	}
};

function FilterEnumerator(filters) {
	this._filters = filters;
	this._idx = 0;
}
FilterEnumerator.prototype = {
	QueryInterface: XPCOMUtils.generateQI([Ci.nsISimpleEnumerator]),

	hasMoreElements: function FE_hasMoreElements() {
		return this._idx < this._filters.length;
	},
	getNext: function FE_getNext() {
		if (!this.hasMoreElements()) {
			throw NS_ERROR_FAILURE;
		}
		return this._filters[this._idx++];
	}
};

// XXX: reload() should be called delayed when we observe changes (as many changes might come in)
function FilterManager() {};
FilterManager.prototype = {
	classDescription: "DownThemAll! Filtermanager",
	contractID: "@downthemall.net/filtermanager;2",
	classID: Components.ID("435FC5E5-D4F0-47a1-BDC1-F325B78188F3"),		
	QueryInterface: XPCOMUtils.generateQI([Ci.dtaIFilterManager, Ci.nsIObserver, Ci.nsISupportsWeakReference, Ci.nsIWeakReference]),				
	_xpcom_categories: [{category: 'app-startup', service: true}],

	QueryReferent: function(iid) this.QueryInterface(iid),
	GetWeakReference: function() this,
	
	init: function FM_init() {
		pbm.registerCallbacks(this);

		// load those localized labels for default filters.
		this._localizedLabels = {};
		let b = Cc['@mozilla.org/intl/stringbundle;1']
			.getService(Ci.nsIStringBundleService)
			.createBundle("chrome://dta/locale/filters.properties");
		let e = b.getSimpleEnumeration();
		while (e.hasMoreElements()) {
			let prop = e.getNext().QueryInterface(Ci.nsIPropertyElement);
			this._localizedLabels[prop.key] = prop.value;
		}
		
		// register (the observer) and initialize our timer, so that we'll get a reload event.
		this.reload();
		this.register();
	},
	
	enterPrivateBrowsing: function() {
		for each (let f in this._all) {
			f.persist = false; 
		}
	},
	exitPrivateBrowsing: function() {
		for each (let f in this._all) {
			f.persist = true; 
		}		
	},
		
	_done: true,
	_mustReload: true,
	
	_timer: null,

	_delayedReload: function FM_delayedReload() {
		if (this._mustReload) {
			return;
		}
		this._mustReload = true;
		this._timer = new Timer(this, 100, nsITimer.TYPE_ONE_SHOT);
	},

	get count() {
		return this._count;
	},

	reload: function FM_reload() {
		log("FM: reload requested");
		if (!this._mustReload) {
			return;
		}
		this._mustReload = false;
		

		this._filters = {};
		this._all = [];

		// hmmm. since we use uuids for the filters we've to enumerate the whole branch.
		for each (let pref in Preferences.getChildren(PREF_FILTERS_BASE)) {
			// we test for label (as we get all the other props as well)
			if (pref.search(/\.label$/) == -1) {
				continue;
			}
			// cut of the label part to get the actual name
			let name = pref.slice(0, -6);
			try {
				let filter = new Filter(name);
				// overwrite with localized labels.
				let localizedLabel = null;
				let localizedTag = filter.id;
				if (localizedTag in this._localizedLabels) {
					localizedLabel = this._localizedLabels[localizedTag];
				}
				filter.load(localizedLabel);
				this._filters[filter.id] = filter;
				this._all.push(filter);
			}
			catch (ex) {
				log("Failed to load: " + name + " / ", ex);
			}
		}
		
		this._count = this._all.length;
		
		this._all.sort(
			function(a,b) {
				if (a.defFilter && !b.defFilter) {
					return -1;
				}
				else if (!a.defFilter && b.defFilter) {
					return 1;
				}
				else if (a.defFilter) {
					if (a.id < b.id) {
						return -1;
					}
					return 1;
				}
				var i = a.label.toLowerCase(), ii = b.label.toLowerCase();
				return i < ii ? -1 : (i > ii ? 1 : 0);
			}
		);		
		this._active = this._all.filter(function(f) { return f.active; });
		
		// notify all observers
		log("FM: reload done");
		Observers.notifyObservers(this, TOPIC_FILTERSCHANGED, null);
	},

	enumAll: function FM_enumAll() {
		return new FilterEnumerator(this._all);
	},
	enumActive: function FM_enumActive(type) {
		return new FilterEnumerator(
			this._active.filter(
				function(i) {
					return i.type & type;
				}
			)
		);
	},

	getFilter: function FM_getFilter(id) {
		if (id in this._filters) {
			return this._filters[id];
		}
		throw new Exception("invalid filter specified: " + id);
	},

	matchActive: function FM_matchActive(test, type) {
		return this._active.some(function(i) { return (i.type & type) && i.match(test); });
	},

	create: function FM_create(label, expression, active, type) {

		// we will use unique ids for user-supplied filters.
		// no need to keep track of the actual number of filters or an index.
		let uuid = Cc["@mozilla.org/uuid-generator;1"]
			.getService(Ci.nsIUUIDGenerator)
			.generateUUID();

		//
		let filter = new Filter(PREF_FILTERS_BASE + uuid.toString());
		// I'm a friend, hence I'm allowed to access private members :p
		filter._label = label;
		filter._active = active;
		filter._type = type;
		filter._modified = true;

		// this might throw!
		filter.expression = expression;


		// will call our observer so we re-init... no need to do more work here :p
		filter.save();
		return filter.id;
	},

	remove: function FM_remove(id) {
		if (id in this._filters) {
			this._filters[id].remove();
			return;
		}
		throw new Exception('filter not defined!');
	},

	save: function FM_save() {
		for each (var f in this._all) {
			try {
				f.save();
			}
			catch (ex) {
				log('Failed to save filters', ex);
			}
		}
	},
	
	getTmpFromString: function FM_getTmpFromString(expression) {
		if (!expression.length) {
			throw NS_ERROR_INVALID_ARG;
		}
		var filter = new Filter("temp", null);
		filter._active = true;
		filter._type = LINK_FILTER | IMAGE_FILTER;
		filter._modified = false;
		filter.expression = expression;
		return filter;
	},

	// nsIObserver
	observe: function FM_observe(subject, topic, prefName) {
		if (topic == 'app-startup') {
			Observers.addObserver(this, 'final-ui-startup', true);
		}
		else if (topic == "final-ui-startup") {
			Observers.removeObserver(this, 'final-ui-startup');
			this.init();
		}
		else if (topic == 'timer-callback') {
			this.reload();
		}
		else {
			this._delayedReload();
		}
	},

	// own stuff
	register: function FM_register() {
		try {
			// Put self as observer to desired branch
			Preferences.addObserver(PREF_FILTERS_BASE, this);
		}
		catch (ex) {
			error(ex);
			return false;
		}
		return true;
	}
};

/**
 * Module
 */
function NSGetModule(mgr, spec) XPCOMUtils.generateModule([DebugService, PrivacyControls, MigrationService, ContentHandling, AboutModule, FilterManager]);