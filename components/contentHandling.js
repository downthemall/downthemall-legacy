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
 * The Original Code is DownThemAll! Content Handling components
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2008
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
const error = Components.utils.reportError;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const NS_ERROR_NO_INTERFACE = Cr.NS_ERROR_NO_INTERFACE;
const NS_ERROR_FAILURE = Cr.NS_ERROR_FAILURE;
const NS_ERROR_NO_AGGREGATION = Cr.NS_ERROR_NO_AGGREGATION;
const NS_ERROR_INVALID_ARG = Cr.NS_ERROR_INVALID_ARG;

const PREF_SNIFFVIDEOS = 'extensions.dta.listsniffedvideos';

const ScriptableInputStream = new Components.Constructor('@mozilla.org/scriptableinputstream;1', 'nsIScriptableInputStream', 'init');

function debug(str, ex) {
	try {
		let ds = Cc['@downthemall.net/debug-service;1'].getService(Ci.dtaIDebugService);
		(debug = function _debugimpl(str, ex) {
			if (ex) {
				ds.log(str, ex);
			}
			else {
				ds.logString(str);
			}
		})(str, ex);
	}
	catch (iex) {
		error(str + ": " + ex);
	}
}


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
		let obs = Cc['@mozilla.org/observer-service;1'].getService(Ci.nsIObserverService);
		obs.addObserver(this, 'http-on-modify-request', false);
		obs.addObserver(this, 'http-on-examine-response', false);
		obs.addObserver(this, 'http-on-examine-cached-response', false);
		obs.addObserver(this, 'xpcom-shutdown', false);
		obs.addObserver(this, 'private-browsing', false);
		this._ps = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch2);
		this._ps.addObserver(PREF_SNIFFVIDEOS, this, false);
		this.sniffVideos = this._ps.getBoolPref(PREF_SNIFFVIDEOS);
	},
	_uninit: function ct__uninit() {
		let obs = Cc['@mozilla.org/observer-service;1'].getService(Ci.nsIObserverService);
		obs.removeObserver(this, 'http-on-modify-request');
		obs.removeObserver(this, 'http-on-examine-response');
		obs.removeObserver(this, 'http-on-examine-cached-response');
		obs.removeObserver(this, 'xpcom-shutdown');
		obs.removeObserver(this, 'private-browsing');
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
			debug("help");
			try {
				this.sniffVideos = subject.QueryInterface(Ci.nsIPrefBranch).getBoolPref(PREF_SNIFFVIDEOS);
			}
			catch (ex) {
				debug(ex);
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
				debug("ignoring multiplex stream");
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
			debug("cannot get post-data", ex);
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
			debug(v.spec);
			rv.push(v.clone());
		}
		return rv;
	}
};

// entrypoint
function NSGetModule(aCompMgr, aFileSpec) XPCOMUtils.generateModule([ContentHandling]);