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
const Exception = Components.Exception;
const module = Components.utils.import;
const error = Components.utils.reportError;

module("resource://dta/glue.jsm");

const HEADER_CT = ['Content-Type', 'Content-Disposition'];

const REGEXP_MEDIA = /\.(flv|ogg|ogm|ogv|avi|divx|mp4v?|webm)\b/i;
const REGEXP_SWF = /\.swf\b/i;
const REGEXP_CT = /\b(flv|ogg|ogm|avi|divx|mp4v|webm)\b/i;
const REGEXP_STARTPARAM = /start=\d+&?/;

function LimitedDict(limit) {
	this._limit = limit;
	this.clear();
}
LimitedDict.prototype = {
	clear: function() {
		this._dict = ('create' in Object) ? Object.create(null) : {};
		this._arr = [];
	},
	getKey: function(key) this._dict[key] || null,
	setKey: function(key, value) {
		if (key in this._dict) {
			this._dict[key] = value;
			return;
		}

		if (this._arr.length == this._limit) {
			delete this._dict[this._arr.shift()];
		}
		this._arr.push(this._dict[key] = value);
	}
};

/**
 * ContentHandling
 */
const REDIRECTS_IID = Components.ID("366982b8-9db9-4383-aae7-dbc2f40ba6f6");
const REDIRECTS_CON = "@downthemall.net/content/redirects;1";

function ContentHandlingImpl() {
	this._init();
}
ContentHandlingImpl.prototype = {
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsIURIContentListener, Ci.nsIFactory, Ci.nsIChannelEventSink]),

	_init: function ct__init() {
		Services.obs.addObserver(this, 'xpcom-shutdown', false);
		Services.obs.addObserver(this, 'private-browsing', false);
		Services.obs.addObserver(this, 'http-on-modify-request', false);

		Services.prefs.addObserver(PREF_SNIFFVIDEOS, this, false);

		Components.manager.nsIComponentRegistrar.registerFactory(
			REDIRECTS_IID,
			REDIRECTS_CON,
			REDIRECTS_CON,
			this
			);
		Services.catman.addCategoryEntry(
			"net-channel-event-sinks",
			REDIRECTS_CON,
			REDIRECTS_CON,
			false,
			false
			);

		this.clear();

		this.sniffVideos = Services.prefs.getBoolPref(PREF_SNIFFVIDEOS);
		if (this.sniffVideos) {
			this.registerHttpObservers();
		}
	},

	// nsIFactory
	createInstance: function(aOuter, iid) {
		if (aOuter) {
			throw Components.results.NS_ERROR_NO_AGGREGATION;
		}
		return this.QueryInterface(iid);
	},
	lockFactory: function eventsink_lockf(lock) {
		throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
	},

	_uninit: function ct__uninit() {
		Services.prefs.removeObserver('extensions.dta.listsniffedvideos', this);
		if (this.sniffVideos) {
			this.sniffVideos = false;
			this.unregisterHttpObservers();
		}

		Services.catman.deleteCategoryEntry("net-channel-event-sinks", REDIRECTS_CON, true);
		Components.manager.nsIComponentRegistrar.unregisterFactory(REDIRECTS_IID, this);

		Services.obs.removeObserver(this, 'xpcom-shutdown');
		Services.obs.removeObserver(this, 'private-browsing');
		Services.obs.removeObserver(this, 'http-on-modify-request');
	},
	registerHttpObservers: function ct_registerHttpObservers() {
		Services.obs.addObserver(this, 'http-on-examine-response', false);
		Services.obs.addObserver(this, 'http-on-examine-cached-response', false);
	},
	unregisterHttpObservers: function ct_unregisterHttpObservers() {
		Services.obs.removeObserver(this, 'http-on-examine-response');
		Services.obs.removeObserver(this, 'http-on-examine-cached-response');
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
				let newValue = Services.prefs.getBoolPref(PREF_SNIFFVIDEOS);
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
			this.clear();
			break;
		}
	},
	observeRequest: function ct_observeRequest(channel, topic, data) {
		if (
			!(channel instanceof Ci.nsIHttpChannel)
			|| !(channel instanceof Ci.nsIUploadChannel)
		) {
			return;
		}

		if (channel.requestMethod != 'POST') {
			return;
		}

		let post;

		try {
			let us = channel.uploadStream;
			if (!us) {
				return;
			}
			if (us instanceof Ci.nsIMultiplexInputStream) {
				return;
			}
			if (!(us instanceof Ci.nsISeekableStream)) {
				return;
			}

			let op = us.tell();
			us.seek(0, 0);

			let is = new Instances.ScriptableInputStream(us);

			// we'll read max 64k
			let available = Math.min(is.available(), 1 << 16);
			if (available) {
				post = is.read(available);
			}
			us.seek(0, op);

			if (post) {
				this._data.setKey(channel.URI.spec, post);
			}
		}
		catch (ex) {
			// no op
		}
	},
	observeResponse: function ct_observeResponse(channel, topic, data) {
		if (!this.sniffVideos || !(channel instanceof Ci.nsIHttpChannel)) {
			return;
		}
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

	_sniffVideos: false,
	get sniffVideos() {
		return this._sniffVideos;
	},
	set sniffVideos(nv) {
		this._sniffVideos = nv;
		if (!nv) {
			this._videos.clear();
		}
		return nv;
	},
	_registerVideo: function ct__registerVideo(uri, vid) {
		// sanitize vid and remove the start param
		vid = vid.clone();
		if (vid instanceof Ci.nsIURL) {
			vid.query = vid.query.replace(REGEXP_STARTPARAM, "");
		}

		uri = uri.spec;
		let nv = this._videos.getKey(uri) || [];
		nv.push(vid.clone());
		this._videos.setKey(uri, nv);
	},

	getPostDataFor: function ct_getPostDataFor(uri) {
		if (uri instanceof Ci.nsIURI) {
			uri = uri.spec;
		}
		return this._data.getKey(uri) || "";
	},
	getSniffedVideosFor: function ct_getSniffedVideosFor(uri) {
		if (uri instanceof Ci.nsIURI) {
			uri = uri.spec;
		}
		return (this._videos.getKey(uri) || []).map(function(a) a.clone());
	},

	// nsIChannelEventSink
	asyncOnChannelRedirect: function(oldChannel, newChannel, flags, callback) {
		try {
			this.onChannelRedirect(oldChannel, newChannel, flags);
		}
		catch (ex) {
			error(ex);
		}
		callback.onRedirectVerifyCallback(0);
	},
	onChannelRedirect: function CH_onChannelRedirect(oldChannel, newChannel, flags) {
		let oldURI = oldChannel.URI.spec;
		let newURI = newChannel.URI.spec;
		oldURI = this._revRedirects.getKey(oldURI) || oldURI;
		this._redirects.setKey(oldURI, newURI);
		this._revRedirects.setKey(newURI, oldURI);
	},
	getRedirect: function(uri) {
		let rv = this._revRedirects.getKey(uri.spec);
		if (!rv) {
			return uri;
		}
		try {
			return Services.io.newURI(rv, null, null);
		}
		catch (ex) {
			return uri;
		}
	},
	clear: function CH_clear() {
		this._data = new LimitedDict(5);
		this._videos = new LimitedDict(20);
		this._redirects = new LimitedDict(20);
		this._revRedirects = new LimitedDict(100);
	}
};

const ContentHandling = new ContentHandlingImpl();
