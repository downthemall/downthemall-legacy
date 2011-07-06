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
 * The Original Code is the DownThemAll! ContentHandling module.
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

const EXPORTED_SYMBOLS = ['ContentHandling'];

const PREF_SNIFFVIDEOS = 'extensions.dta.listsniffedvideos';

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const ctor = Components.Constructor;
const Exception = Components.Exception;
const module = Components.utils.import;
const error = Components.utils.reportError;

module("resource://gre/modules/XPCOMUtils.jsm");

const ScriptableInputStream = new ctor('@mozilla.org/scriptableinputstream;1', 'nsIScriptableInputStream', 'init');

const Observers = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
const Prefs = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch2);

const HEADER_CT = ['Content-Type', 'Content-Disposition'];

const REGEXP_MEDIA = /\.(flv|ogg|ogm|ogv|avi|divx|mp4v?|webm)\b/i;
const REGEXP_SWF = /\.swf\b/i;
const REGEXP_CT = /\b(flv|ogg|ogm|avi|divx|mp4v|webm)\b/i;
const REGEXP_STARTPARAM = /start=\d+&?/;

/**
 * ContentHandling
 */
function ContentHandlingImpl() {
	this._init();
}
ContentHandlingImpl.prototype = {
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsIURIContentListener]),

	_init: function ct__init() {
		Observers.addObserver(this, 'xpcom-shutdown', false);
		Observers.addObserver(this, 'private-browsing', false);
		Prefs.addObserver(PREF_SNIFFVIDEOS, this, false);
		this.sniffVideos = Prefs.getBoolPref(PREF_SNIFFVIDEOS);
		if (this.sniffVideos) {
			this.registerHttpObservers();
		}
	},
	_uinit: function ct__uninit() {
		Prefs.removeObserver('extensions.dta.listsniffedvideos', this);
		if (this.sniffVideos) {
			this.sniffVideos = false;
			this.unregisterHttpObservers();
		}
		Observers.removeObserver(this, 'xpcom-shutdown');
		Observers.removeObserver(this, 'private-browsing');
	},
	registerHttpObservers: function ct_registerHttpObservers() {
		Observers.addObserver(this, 'http-on-modify-request', false);
		Observers.addObserver(this, 'http-on-examine-response', false);
		Observers.addObserver(this, 'http-on-examine-cached-response', false);
	},
	unregisterHttpObservers: function ct_unregisterHttpObservers() {
		Observers.removeObserver(this, 'http-on-modify-request');
		Observers.removeObserver(this, 'http-on-examine-response');
		Observers.removeObserver(this, 'http-on-examine-cached-response');
	},
	observe: function ct_observe(subject, topic, data) {
		switch(topic) {
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
				let newValue = Prefs.getBoolPref(PREF_SNIFFVIDEOS);
				let differs = newValue == this.sniffVideos;
				this.sniffVideos = newValue;
				if (differs) {
					if (newValue) {
						this.registerHttpObservers();
					}
					else {
						this.unregisterHttpObservers();
					}
				}
			}
			catch (ex) {
				error(ex);
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

		let post;

		try {
			let us = subject.QueryInterface(Ci.nsIUploadChannel).uploadStream;
			if (!us) {
				return;
			}
			try {
				us.QueryInterface(Ci.nsIMultiplexInputStream);
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
			error(ex);
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
			for (let i = 0; i < HEADER_CT.length; ++i) {
				try {
					ct += channel.getResponseHeader(HEADER_CT[i]);
				}
				catch (ex) {
					// no op
				}
			}
			let spec = channel.URI.spec;
			if ((REGEXP_MEDIA.test(spec) && !REGEXP_SWF.test(spec))
				|| REGEXP_CT.test(ct)) {

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
				delete this._dataDict[this._dataArray.shift()];
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
		// sanitize vid and remove the start param
		vid = vid.clone();
		if (vid instanceof Ci.nsIURL) {
			vid.query = vid.query.replace(REGEXP_STARTPARAM, "");
		}

		uri = uri.spec;
		if (!(uri in this._vidDict)) {
			if (this._vidArray.length > 20) {
				delete this._vidDict[this._vidArray.shift()];
			}
			this._vidArray.push(uri);
			let nv = this._vidDict[uri] = {};
			nv[vid.spec] = vid;
		}
		else {
			this._vidDict[uri][vid.spec] = vid;
		}
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
			rv.push(v.clone());
		}
		return rv;
	}
};

const ContentHandling = new ContentHandlingImpl();
