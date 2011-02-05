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

const ABOUT_URI = 'http://about.downthemall.net/%BASE_VERSION%/?locale=%LOCALE%&app=%APP_ID%&version=%APP_VERSION%&os=%OS%';

const LINK_FILTER = Ci.dtaIFilter.LINK_FILTER;
const IMAGE_FILTER = Ci.dtaIFilter.IMAGE_FILTER;
const TOPIC_FILTERSCHANGED = 'DTA:filterschanged';

const nsITimer = Ci.nsITimer;

const Timer = ctor('@mozilla.org/timer;1', 'nsITimer', 'init');
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
	'pbm',
	function() {
		let pbm = {};
		module('resource://dta/support/pbm.jsm', pbm);
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
		let _tp = this;
		
		module("resource://dta/version.jsm");
		Version.getInfo(function(v) {
			try {
				let lastVersion = Preferences.getExt('version', '0');
				if (0 == v.compareVersion(v.VERSION, lastVersion)) {
					return;
				}
				log("MigrationManager: migration started");
				if (v.compareVersion(lastVersion, "1.0.1") < 0) {
					_tp._migrateExecute(['ResetMaxConnections']);
				}
				if (v.compareVersion(lastVersion, "2.0.1") < 0) {
					_tp._migrateExecute(['MaybeFixHistory']);
				}	

				Preferences.setExt('version', v.VERSION);

				if (0 >= v.compareVersion(v.BASE_VERSION, lastVersion)) {
					return;
				}
				
				v.showAbout = true;
				Observers.notifyObservers(null, v.TOPIC_SHOWABOUT, null);
				
				let _ic = {};
				// Need to extract icons
				module('resource://dta/support/iconcheat.jsm');				
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
		});
	},
	_migrateExecute: function MM_execute(types) {
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
	// 2.0.1: A lot of users have histories set to 0 from a previous version
	// and wonder why dTa does not store histories any longer
	// Do a one-time reset, to solve stuff for most of the users
	// Users who actually want to set it to zero (the very minority) are free to
	// do so afterwards
	_migrateMaybeFixHistory: function() {
		if (Preferences.getExt('history', 5) < 1) {
			log("resetting history pref");
			Preferences.resetExt('history');
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
	classID: Components.ID("{1CF86DC0-33A7-43b3-BDDE-7ADC3B35D114}"),		
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
	classID: Components.ID("{435FC5E5-D4F0-47a1-BDC1-F325B78188F3}"),		
	QueryInterface: XPCOMUtils.generateQI([Ci.dtaIFilterManager, Ci.nsIObserver, Ci.nsISupportsWeakReference, Ci.nsIWeakReference]),				
	_xpcom_categories: [{category: 'profile-after-change'}],

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
		this._reload();
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
	_mustReload: false,
	
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
		this._reload();
		log("FM: reload done");		
	},
	_reload: function FM__reload() {
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
		switch (topic){
			case 'profile-after-change':
				Observers.addObserver(this, 'final-ui-startup', true);
				break;
			case 'final-ui-startup':
				Observers.removeObserver(this, 'final-ui-startup');
				this.init();
				break;
			case 'timer-callback':
				this.reload();
				break;
			default:
				this._delayedReload();
				break;
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


if (XPCOMUtils.generateNSGetFactory) {
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([Stuff, ContentHandling, AboutModule, FilterManager]);
}
else {
    function NSGetModule() XPCOMUtils.generateModule([Stuff, ContentHandling, AboutModule, FilterManager]);
}