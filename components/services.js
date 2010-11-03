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

const ABOUT_URI = 'https://about.downthemall.net/%BASE_VERSION%/?locale=%LOCALE%&app=%APP_ID%&version=%APP_VERSION%&os=%OS%';

const ScriptableInputStream = new ctor('@mozilla.org/scriptableinputstream;1', 'nsIScriptableInputStream', 'init');

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
	'Observers',
	function() {
		let obs = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
		delete this.Observers;
		return (this.Observers = obs); 
	}
);


function log(str, ex) {
	try {
		let _u = {};
		module('resource://dta/utils.jsm', _u);
		log = function() _u.Debug.log.apply(_u.Debug, arguments);
		log(str, ex);
	}
	catch (oex) {
		error(str + ": " + ex);
	}
}

/**
 * Stuff
 */
function Stuff() {}
Stuff.prototype = {
	classDescription: "DownThemAll! stuff",
	contractID: "@downthemall.net/stuff;1",
	classID: Components.ID("{27a344f4-7c1b-43f3-af7f-bb9dd65114bb}"),		
	_xpcom_categories: [{category: 'profile-after-change'}],

	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),
	
	observe: function(aSubject, aTopic, aData) {
		error(aTopic);
		switch (aTopic) {
		case 'profile-after-change':
			Observers.addObserver(this, 'final-ui-startup', false);
			Observers.addObserver(this, 'profile-change-teardown', false);
			break;
		case 'final-ui-startup':
			Observers.removeObserver(this, 'final-ui-startup');
			this._migrate();
			break;
		case 'profile-change-teardown':
			Observers.removeObserver(this, 'profile-change-teardown');
			this.onShutdown();
			break;
		case 'clean':
			this.clean();
			break;
		}
	},
	_migrate: function MM_migrate() {
		try {
			let _mm = {};
			module("resource://dta/support/migration.jsm", _mm);
			_mm.migrate();
		}
		catch (ex) {
			log("m", ex);
		}
	},
	clean: function() {
		log('clean()');
		
		// Cleaning prefs
		for each (let e in ['directory', 'filter', 'renaming']) {
			try {
				Preferences.resetExt(e);
			}
			catch (ex) {
				log("Cannot clear pref: " + e, ex);
			}
		}
		
		// Cleaning files
		try {
			let prof = Cc["@mozilla.org/file/directory_service;1"]
				.getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
			for each (let e in ['dta_history.xml']) {
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
		
		// Diagnostic log
		try {
			let _d = {};
			module('resource://dta/debug.jsm', _d);
			_d.Debug.clear();
		}
		catch (ex) {
			log("Cannot clear diagnostic log", ex);
		}
		
		try {
			let mod = {};
			module('resource://dta/manager/queuestore.jsm', mod);
			mod.QueueStore.clear();
		}
		catch (ex) {
			log("Cannot clear queue", ex);
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
 * ContentHandling
 */
function ContentHandling() {}
ContentHandling.prototype = {
	classDescription: 'DownThemAll! Content Handling',
	classID: Components.ID('{35eabb45-6bca-408a-b90c-4b22e543caf4}'),
	contractID: '@downthemall.net/contenthandling;2',
	
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsIURIContentListener, Ci.dtaIContentHandling]),
	
	_xpcom_categories: [{category: 'profile-after-change'}],
	
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
		switch(topic) {
		case 'profile-after-change':
			this._init();
			break;
		case 'xpcom-shutdown':
			this._uninit();
			break;
		case 'http-on-modify-request':
			this.observeRequest(subject, topic, data);
			break;
		case 'http-on-examine-response':
		case 'http-on-examine-cached-response':
			this.observeResponse(subject, topic, data);
			break;
		case 'nsPref:changed':
			try {
				this.sniffVideos = subject.QueryInterface(Ci.nsIPrefBranch).getBoolPref(PREF_SNIFFVIDEOS);
			}
			catch (ex) {
				log("Failed to get sniffVideos pref", ex);
			}
			break;
		case 'private-browsing':
			this._clearPostData();
			this._clearVideos();
			break;
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
					(/\.(flv|ogg|ogm|ogv|avi|divx|mp4v?|webm)\b/i.test(channel.URI.spec) && !/\.swf\b/i.test(channel.URI.spec)) 
					|| ct.match(/\b(flv|ogg|ogm|avi|divx|mp4v|webm)\b/i)
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
function AboutModule() {
}
AboutModule.prototype = {
	classDescription: "DownThemAll! about module",
	classID: Components.ID('{bbaedbd9-9567-4d11-9255-0bbae236ecab}'),
	contractID: '@mozilla.org/network/protocol/about;1?what=downthemall',
	
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),
	
  newChannel : function(aURI) {
		try {
		    let io = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService);
		    let sec = Cc['@mozilla.org/scriptsecuritymanager;1'].getService(Ci.nsIScriptSecurityManager);

	    	module('resource://dta/version.jsm');
	    	if (!Version.ready) {
	    		throw new Exception("Cannot build about:downthemall, version.jsm not ready");
	    	}

		    let ru = ABOUT_URI.replace(
		    	/%(.+?)%/g,
		    	function (m, m1) (m1 in Version) ? Version[m1] : m
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
	
	getURIFlags: function(aURI) Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT
};

if (XPCOMUtils.generateNSGetFactory) {
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([Stuff, ContentHandling, AboutModule]);
}
else {
    function NSGetModule() XPCOMUtils.generateModule([Stuff, ContentHandling, AboutModule]);
}