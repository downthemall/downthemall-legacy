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
 * The Original Code is DownThemAll! Decompressor module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007-2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *	 Nils Maier <MaierMan@web.de>
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

const EXPORTED_SYMBOLS = ['Connection', 'GlobalBucket'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const ctor = Components.Constructor;
const Exception = Components.Exception;

const NS_ERROR_MODULE_NETWORK = 0x804B0000;
const NS_ERROR_BINDING_ABORTED = NS_ERROR_MODULE_NETWORK + 2;
const NS_ERROR_UNKNOWN_HOST = NS_ERROR_MODULE_NETWORK + 30;
const NS_ERROR_CONNECTION_REFUSED = NS_ERROR_MODULE_NETWORK + 13;
const NS_ERROR_NET_TIMEOUT = NS_ERROR_MODULE_NETWORK + 14;
const NS_ERROR_NET_RESET = NS_ERROR_MODULE_NETWORK + 20;
const NS_ERROR_FTP_CWD = NS_ERROR_MODULE_NETWORK + 22;

let DTA = {}, RequestManipulation = {};
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

Cu.import('resource://dta/api.jsm', DTA);
Cu.import('resource://dta/constants.jsm');
Cu.import('resource://dta/utils.jsm');
Cu.import('resource://dta/manager/requestmanipulation.jsm', RequestManipulation);
Cu.import('resource://dta/support/bytebucket.jsm');

const StringInputStream = ctor('@mozilla.org/io/string-input-stream;1', 'nsIStringInputStream', 'setData');

const Preferences = DTA.Preferences;

extendString(String);

ServiceGetter(this, "IOService", "@mozilla.org/network/io-service;1", "nsIIOService2");

(function() {
	let strings = {};
	for (let s in new SimpleIterator(Cc["@mozilla.org/intl/stringbundle;1"]
		.getService(Ci.nsIStringBundleService)
		.createBundle('chrome://dta/locale/manager.properties')
		.getSimpleEnumeration(), Ci.nsIPropertyElement)) {
		strings[s.key] = s.value;
	}
	let bundles = new StringBundles(strings);
	this['_'] = function() (arguments.length == 1) ? bundles.getString(arguments[0]) : bundles.getFormattedString.apply(bundles, arguments);
})();


function Connection(d, c, isInfoGetter) {

	this.d = d;
	this.c = c;
	this.isInfoGetter = isInfoGetter;
	this.url = d.urlManager.getURL();

	let url = this.url.url;
	RequestManipulation.modifyURL(url);

	let referrer = d.referrer;
	Debug.log("starting: " + url.spec);

	this._chan = IOService.newChannelFromURI(url);
	let r = Ci.nsIRequest;
	let loadFlags = r.LOAD_NORMAL
	if (!Preferences.getExt('useCache', false)) {
		loadFlags = loadFlags | r.LOAD_BYPASS_CACHE;
	}
	else {
		Debug.log("using cache");
	}
	this._chan.loadFlags = loadFlags;
	this._chan.notificationCallbacks = this;

	if (this._chan instanceof Ci.nsIHttpChannel) {
		try {
			Debug.log("http");
			if (referrer instanceof Ci.nsIURI) {
				this._chan.referrer = referrer;
			}
			if (d.postData) {
				let uc = this._chan.QueryInterface(Ci.nsIUploadChannel);
				uc.setUploadStream(new StringInputStream(d.postData, d.postData.length), null, -1);
				this._chan.requestMethod = 'POST';
			}
		}
		catch (ex) {
			Debug.log("error setting up http channel", ex);
			// no-op
		}
	}
	else if (this._chan instanceof Ci.nsIFTPChannel) {
		try {
			if (c.start + c.written > 0) {
					let resumable = this._chan.QueryInterface(Ci.nsIResumableChannel);
					resumable.resumeAt(c.start + c.written, '');
			}
		}
		catch (ex) {
			Debug.log('error setting up ftp channel', ex);
		}
	}
	this.prepareChannel(this._chan);

	this.c.running = true;
	this._chan.asyncOpen(this, null);
	Debug.log(this.c + "is now open");
}

Connection.prototype = {
	_interfaces: [
		Ci.nsIInterfaceRequestor,
		Ci.nsIStreamListener,
		Ci.nsIRequestObserver,
		Ci.nsIProgressEventSink,
		Ci.nsIChannelEventSink,
		Ci.nsIFTPEventSink,
		Ci.nsISupports,
		Ci.nsISupportsWeakReference,
		Ci.nsIWeakReference,
		Ci.nsIClassInfo,
		Ci.nsICancelable,
	],

	cantCount: false,

	prepareChannel: function(chan) {
		try {
			if (chan instanceof Ci.nsISupportsPriority) {
				if (this.d.forced) {
					chan.adjustPriority(Ci.nsISupportsPriority.PRIORITY_HIGHEST);
				}
				else {
					chan.adjustPriority(Ci.nsISupportsPriority.PRIORITY_LOW);
				}
			}

			if (chan instanceof Ci.nsIEncodedChannel) {
				// Cannot hash when conversation is active
				chan.applyConversion = false;
			}

			if (chan instanceof Ci.nsIHttpChannel) {
				let c = this.c;

				// Cannot hash when compressed
				chan.setRequestHeader("Accept-Encoding", "", false);

				if (this.isInfoGetter) {
					if (!this.d.fromMetalink) {
						chan.setRequestHeader('Accept', 'application/metalink4+xml;q=0.9,application/metalink+xml;q=0.8', true);
					}
					chan.setRequestHeader('Want-Digest', DTA.WANT_DIGEST_STRING, false);
				}

				if (Preferences.getExt('nokeepalive', true)) {
					chan.setRequestHeader('Keep-Alive', '', false);
					chan.setRequestHeader('Connection', 'close', false);
				}

				if (c.start + c.written > 0) {
					chan.setRequestHeader('Range', 'bytes=' + (c.start + c.written) + "-", false);
					Debug.log("setting range");
				}

				RequestManipulation.modifyHttp(chan);

				try {
					// Users want this so they can have no-third-party when browsing regularly,
					// but still download from sites authenticating using cookies
					if (chan instanceof Ci.nsIHttpChannelInternal) {
						chan.forceAllowThirdPartyCookie = true;
					}
				}
				catch (ex) { /* no op */ }
			}
		}
		catch (ex) {
			Debug.log("Failed to prepare channel", ex);
		}
	},

	QueryInterface: function DL_QI(iid) {
		for each (let i in this._interfaces) {
			if (iid.equals(i)) {
				return this;
			}
		}
		throw Cr.NS_ERROR_NO_INTERFACE;
	},
	// nsISupportsWeakReference
	GetWeakReference: function DL_GWR() this,
	// nsIWeakReference
	QueryReferent: function DL_QR(uuid) this.QueryInterface(uuid),

	// nsICancelable
	cancel: function DL_cancel(aReason) {
		try {
			if (this._closed) {
				return;
			}
			Debug.log("cancel");
			if (!aReason) {
				aReason = NS_ERROR_BINDING_ABORTED;
			}
			this._chan.cancel(aReason);
			this._closed = true;
		}
		catch (ex) {
			Debug.log("cancel", ex);
		}
	},
	// nsIInterfaceRequestor
	getInterface: function DL_getInterface(iid) {
		if (iid.equals(Ci.nsIAuthPrompt)) {
			return this.d.AuthPrompts.authPrompter;
		}
		if (iid.equals(Ci.nsIPrompt)) {
			return this.d.AuthPrompts.prompter;
		}
		if ('nsIAuthPrompt2' in Ci && iid.equals(Ci.nsIAuthPrompt2)) {
			return this.d.AuthPrompts.authPrompter.QueryInterface(Ci.nsIAuthPrompt2);
		}
		return this.QueryInterface(iid);
	},

	// nsIClassInfo
	getInterfaces: function(aCount) {
		aCount.value = this._interfaces.length;
		return this._interfaces;
	},

	getHelperForLanguage: function(aLanguage) null,
	contractID: null,
	classDescription: "DownThemAll! connection",
	classID: null,
	implementationLanguage: Ci.nsIProgrammingLanguage.JAVASCRIPT,
	flags: Ci.nsIClassInfo.MAIN_THREAD_ONLY,

	// nsIChannelEventSink
	asyncOnChannelRedirect: function(oldChannel, newChannel, flags, callback) {
		this.onChannelRedirect(oldChannel, newChannel, flags);
		callback.onRedirectVerifyCallback(0);
	},
	onChannelRedirect: function DL_onChannelRedirect(oldChannel, newChannel, flags) {
		let c = this.c;
		try {
			if (!(oldChannel instanceof Ci.nsIChannel) || !(newChannel instanceof Ci.nsIChannel)) {
				throw new Exception("redirect: requests not channels");
			}

			this.prepareChannel(newChannel);

			// When we get redirected from, say, http to ftp, we need to explicitly
			// call resumeAt() as this won't be propagated from the old channel.
			if (c.start + c.written > 0 && !(newChannel instanceof Ci.nsIHttpChannel)) {
				let resumable = newChannel.QueryInterface(Ci.nsIResumableChannel);
				resumable.resumeAt(c.start + c.written, '');
				Debug.log("redirect: set resumeAt on " + newChannel.URI.spec + "/" + newChannel.originalURI.spec + " at " + (c.start + c.written));
			}
		}
		catch (ex) {
			Debug.log("redirect: cannot resumeAt", ex);
			if (!this.handleError()) {
				d.fail(_('servererror'), _('ftperrortext'), _('servererror'));
				return;
			}
		}

		this._chan = newChannel;

		if (!this.isInfoGetter) {
			return;
		}
		try {
			let newurl = new DTA.URL(newChannel.URI.QueryInterface(Ci.nsIURL), this.url.preference);
			this.d.fileName = newurl.usable.getUsableFileName();
			if (oldChannel instanceof Ci.nsIHttpChannel && oldChannel.responseStatus == 302) {
				return;
			}
			this.d.urlManager.replace(this.url, newurl);
			this.url = newurl;
		}
		catch (ex) {
			Debug.log("Failed to reset data on channel redirect", ex);
		}
	},

	verifyChunksStarted: function() {
		// XXX always check, not just .isInfoGetter?
		if (!this.isInfoGetter || this.d.chunks.every(function(c) !c.running || !!c.sessionBytes)) {
			// All running chunks received something at this point
			return false;
		}
		// Other downloads didn't start; assume the worst
		Debug.logString("Need to recombine chunks; not all started");
		this.d.dumpScoreboard();

		// recombine affected chunks
		let chunks = this.d.chunks;
		for (let c, i = chunks.length - 1; i > 1 && (c = chunks[i]); --i) {
			if (!c.running || !!c.sessionBytes) {
				// Only check running chunks without bytes received
				Debug.logString("skipping: " + i + " / " + c);
				continue;
			}
			Debug.logString("Respinning by merging: " + i + " / " + c);

			// Merge with previous chunk
			chunks[i-1].end = c.end;
			c.cancel();
			chunks.splice(i, 1);

			// We do not want to run into yet another timed out thing
			// However, completely disabling chunks isn't really a great thing to do
			if (this.d.maxChunks > 2) {
				this.d.maxChunks--;
			}
		}
		Debug.logString("Done respinning, new score board follows");
		this.d.dumpScoreboard();
		return true;
	},
	// nsIStreamListener
	onDataAvailable: function DL_onDataAvailable(aRequest, aContext, aInputStream, aOffset, aCount) {
		if (this._closed) {
			throw NS_ERROR_BINDING_ABORTED;
		}
		try {
			// we want to kill ftp chans as well which do not seem to respond to
			// cancel correctly.
			if (this.c.write(aRequest, aInputStream, aCount) < 0) {
				// need to attempt another write after merging in verifyChunksStarted
				if (this.verifyChunksStarted()
						&& this.c.write(aRequest, aInputStream, aCount) >= 0) {
					return;
				}

				// we already got what we wanted
				this.cancel();
			}
		}
		catch (ex) {
			Debug.log('onDataAvailable', ex);
			this.d.fail(_("accesserror"), _("permissions") + " " + _("destpath") + ". " + _("checkperm"), _("accesserror"));
		}
	},

	// nsIFTPEventSink
	OnFTPControlLog: function(server, msg) {
		/*
		 * Very hacky :p If we don't handle it here, then nsIFTPChannel will + try
		 * to CWD to the file (d'oh) + afterwards ALERT (modally) that the CWD
		 * didn't succeed (double-d'oh)
		 */
		if (!server) {
			this._wasRetr = /^RETR/.test(msg) || /^REST/.test(msg);
		}
	},

	handleError: function DL_handleError() {
		let c = this.c;
		let d = this.d;

		c.cancel();
		d.dumpScoreboard();
		if (d.chunks.indexOf(c) == -1) {
			// already killed;
			return true;
		}

		Debug.log("handleError: problem found; trying to recover");

		if (d.urlManager.markBad(this.url)) {
			Debug.log("handleError: fresh urls available, kill this one and use another!");
			d.timeLastProgress = getTimestamp();
			return true;
		}

		Debug.log("affected: " + c);
		d.dumpScoreboard();

		let max = -1, found = null;
		for each (let cmp in d.chunks) {
			if (!cmp.running) {
				continue;
			}
			if (cmp.start < c.start && cmp.start > max) {
				found = cmp;
				max = cmp.start;
			}
		}
		if (found) {
			Debug.log("handleError: found joinable chunk; recovering suceeded, chunk: " + found);
			found.end = c.end;
			if (--d.maxChunks == 1) {
				// d.resumable = false;
			}
			d.chunks = d.chunks.filter(function(ch) ch != c);
			d.chunks.sort(function(a, b) a.start - b.start);

			// check for overlapping ranges we might have created
			// otherwise we'll receive a size mismatch
			// this means that we're gonna redownload an already finished chunk...
			for (let i = d.chunks.length - 2; i > -1; --i) {
				let c1 = d.chunks[i], c2 = d.chunks[i + 1];
				if (c1.end >= c2.end) {
					if (c2.running) {
						// should never ever happen :p
						d.dumpScoreboard();
						Debug.log("overlapping:\n" + c1 + "\n" + c2);
						d.fail("Internal error", "Please notify the developers that there were 'overlapping chunks'!", "Internal error (please report)");
						return false;
					}
					d.chunks.splice(i + 1, 1);
				}
			}
			let ac = 0;
			d.chunks.forEach(function(c) { if (c.running) { ++ac;	}});
			d.activeChunks = ac;
			c.close();

			d.save();
			d.dumpScoreboard();
			return true;
		}
		Debug.log("recovery failed");
		return false;
	},
	handleHttp: function DL_handleHttp(aChannel) {
		let c = this.c;
		let d = this.d;

		let code = 0, status = 'Server returned nothing';
		try {
			code = aChannel.responseStatus;
			status = aChannel.responseStatusText;
		}
		catch (ex) {
			return true;
		}

		if (code >= 400) {
			// any data that we got over this channel should be considered "corrupt"
			c.rollback();

			if (c.starter && d.urlManager.markBad(this.url)) {
				Debug.log("caught bad server (Error: " + code + ")", d.toString());
				d.cancel();
				d.safeRetry();
				return false;
			}
			if (!this.handleError()) {
				Debug.log("handleError: Cannot recover from problem!", code);
				if ([401, 402, 407, 500, 502, 503, 504].indexOf(code) != -1 || Preferences.getExt('recoverallhttperrors', false)) {
					Debug.log("we got temp failure!", code);
					d.pauseAndRetry();
					d.status = code >= 500 ? _('temperror') : _('autherror');
				}
				else if (code == 450) {
					d.fail(
						_('pcerrortitle'),
						_('pcerrortext'),
						_('pcerrortitle')
					);
				}
				else {
					var file = d.fileName.length > 50 ? d.fileName.substring(0, 50) + "..." : d.fileName;
					code = formatNumber(code, 3);
					if (Preferences.getExt('resumeonerror', false)) {
						d.pauseAndRetry();
						d.status = _('temperror');
					}
					else {
						d.fail(
							_("error", [code]),
							_("failed", [file]) + " " + _("sra", [code]) + ": " + status,
							_("error", [code])
						);
					}
				}
				this.cancel();
				d.save();
			}
			return false;
		}

		// not partial content altough we are multi-chunk
		if (code != 206 && !this.isInfoGetter) {
			Debug.log(d + ": Server returned a " + aChannel.responseStatus + " response instead of 206", this.isInfoGetter);

			if (!this.handleError()) {
				vis = {value: '', visitHeader: function(a,b) { this.value += a + ': ' + b + "\n"; }};
				aChannel.visitRequestHeaders(vis);
				Debug.log("Request Headers\n\n" + vis.value);
				vis.value = '';
				aChannel.visitResponseHeaders(vis);
				Debug.log("Response Headers\n\n" + vis.value);
				d.cancel();
				d.resumable = false;
				d.safeRetry();
				return false;
			}
		}

		var visitor = null;
		try {
			visitor = d.visitors.visit(aChannel);
		}
		catch (ex) {
			Debug.log("header failed! " + d, ex);
			// restart download from the beginning
			d.cancel();
			d.resumable = false;
			d.safeRetry();
			return false;
		}

		if (!this.isInfoGetter) {
			return false;
		}

		if (visitor.type) {
			d.contentType = aChannel.contentType || visitor.type;
		}

		// compression?
		if (['gzip', 'deflate'].indexOf(visitor.encoding) != -1 && !d.contentType.match(/gzip/i) && !d.fileName.match(/\.gz$/i)) {
			d.compression = visitor.encoding;
		}
		else {
			d.compression = null;
		}

		if (visitor.hash && (!d.hashCollection || !d.hashCollection.full || d.hashCollection.full.q < visitor.hash.q)) {
			d.hashCollection = new DTA.HashCollection(visitor.hash);
		}

		// accept range
		d.resumable &= visitor.acceptRanges;

		if (visitor.type && visitor.type.search(/application\/metalink4?\+xml/) != -1) {
			d.isMetalink = true;
			d.resumable = false;
		}

		if (visitor.contentLength > 0) {
			d.totalSize = visitor.contentLength;
		}
		else {
			d.totalSize = 0;
		}

		if (visitor.fileName && visitor.fileName.length > 0) {
			// if content disposition hasn't an extension we use extension of URL
			let newName = visitor.fileName.replace(/\\|\?/g, '_').getUsableFileNameWithFlatten();
			let ext = this.url.usable.getExtension();
			if (visitor.fileName.lastIndexOf('.') == -1 && ext) {
				newName += ('.' + ext);
				newName = newName.getUsableFileNameWithFlatten();
			}
			d.fileName = newName;
		}

		return false;
	},

	// Generic handler for now :p
	handleFtp: function  DL_handleFtp(aChannel) {
		let c = this.c;
		let d = this.d;
		try {
			let totalSize = 0;
			try {
				let pb = aChannel.QueryInterface(Ci.nsIPropertyBag2);
				totalSize = Math.max(pb.getPropertyAsInt64('content-length'), 0);
			}
			catch (ex) {
				// Firefox 4 support 64bit contentLength
				totalSize = Math.max(aChannel.contentLength, 0);
			}
			if (d.totalSize && totalSize != d.totalSize && !this.handleError()) {
				Debug.log("ftp: total size mismatch " + totalSize + " " + d.totalSize);
				d.fail(_('servererror'), _('ftperrortext'), _('servererror'));
				return false;
			}
			Debug.log("ftp: total size is: " + totalSize + " for: " + this.url);
			d.totalSize = totalSize;
		}
		catch (ex) {
			Debug.log("ftp: no totalsize", ex);
			if (c.start != 0 && !this.handleError()) {
				d.fail(_('servererror'), _('ftperrortext'), _('servererror'));
				return false;
			}
			d.totalSize = 0;
			d.resumable = false;
		}

		try {
			aChannel.QueryInterface(Ci.nsIResumableChannel).entityID;
		}
		catch (ex) {
			Debug.log("likely not resumable or connection refused!");
			if (!this.handleError()) {
				// restart download from the beginning
				d.fail(_('servererror'), _('ftperrortext'), _('servererror'));
				return false;
			}
		}

		try {
			let visitor = d.visitors.visit(aChannel.QueryInterface(Ci.nsIChannel));
		}
		catch (ex) {
			Debug.log("header failed! " + d, ex);
			// restart download from the beginning
			d.cancel();
			d.resumable = false;
			d.safeRetry();
			return false;
		}
		return false;
	},

	handleGeneric: function DL_handleGeneric(aChannel) {
		var c = this.c;
		var d = this.d;

		// hack: determine if we are a multi-part chunk,
		// if so something bad happened, 'cause we aren't supposed to be multi-part
		if (c.start != 0 && d.is(RUNNING)) {
			if (!this.handleError()) {
				Debug.log(d + ": Server error or disconnection", "(type 1)");
				d.pauseAndRetry();
				d.status = _("servererror");
			}
			return false;
		}

		// try to get the size anyway ;)
		try {
			let pb = aChannel.QueryInterface(Ci.nsIPropertyBag2);
			d.totalSize = Math.max(pb.getPropertyAsInt64('content-length'), 0);
		}
		catch (ex) {
			try {
				d.totalSize = Math.max(aChannel.contentLength, 0);
			}
			catch (ex) {
				d.totalSize = 0;
			}
		}
		d.resumable = false;
		return false;
	},

	// nsIRequestObserver,
	_supportedChannels: [
		{i:Ci.nsIHttpChannel, f:'handleHttp'},
		{i:Ci.nsIFTPChannel, f:'handleFtp'},
		{i:Ci.nsIChannel, f:'handleGeneric'}
	],
	onStartRequest: function DL_onStartRequest(aRequest, aContext) {
		let c = this.c;
		let d = this.d;
		Debug.log('StartRequest: ' + c);

		this.started = true;

		if (d.chunks.indexOf(c) == -1) {
			return;
		}

		try {
			for each (let sc in this._supportedChannels) {
				let chan = null;
				try {
					chan = aRequest.QueryInterface(sc.i);
					if ((this.rexamine = this[sc.f](chan))) {
						return;
					}
					break;
				}
				catch (ex) {
					Debug.log("examine", ex);
					// continue
				}
			}

			if (this.isInfoGetter) {
				Debug.log("Infogetter");
				let ext = d.fileName.getExtension();
				if (ext && ext.match(/^meta(?:4|link)$/i)) {
					d.isMetalink = true;
					d.resumable = false;
				}

				// Checks for available disk space.
				let tsd = d.totalSize;
				if (tsd && !d.checkSpace(tsd)) {
					return;
				}

				if (!d.totalSize) {
					d.resumable = false;
					this.cantCount = true;
				}

				if (!d.resumable) {
					d.maxChunks = 1;
				}
				c.end = d.totalSize - 1;

				// Explicitly trigger rebuildDestination here, as we might have received
				// a html content type and need to rewrite the file
				d.rebuildDestination();
				d.resolveConflicts();
			}

			if (d.resumable && !d.isOf(CANCELED | PAUSED)) {
				d.resumeDownload();
			}
		}
		catch (ex) {
			Debug.log("onStartRequest", ex);
			d.fail(_("unknownerror"), _('unknownerrortext'), _("unknownerror"));
			return;
		}
	},
	onStopRequest: function DL_onStopRequest(aRequest, aContext, aStatusCode) {
		try {
			Debug.log('StopRequest');
		}
		catch (ex) {
			return;
		}

		// shortcuts
		let c = this.c;
		let d = this.d;
		c.close();

		if (d.chunks.indexOf(c) == -1) {
			return;
		}

		// update flags and counters
		d.refreshPartialSize();
		--d.activeChunks;

		// check if we're complete now
		if (d.is(RUNNING) && d.chunks.every(function(e) { return e.complete; })) {
			if (!d.resumeDownload()) {
				d.state = FINISHING;
				Debug.log(d + ": Download is complete!");
				d.finishDownload();
				return;
			}
		}

		if (c.starter && -1 != [
			NS_ERROR_CONNECTION_REFUSED,
			NS_ERROR_UNKNOWN_HOST,
			NS_ERROR_NET_TIMEOUT,
			NS_ERROR_NET_RESET
		].indexOf(aStatusCode)) {
			if (!d.urlManager.markBad(this.url)) {
				Debug.log(d + ": Server error or disconnection", "(type 3)");
				d.pauseAndRetry();
				d.status = _("servererror");
			}
			else {
				Debug.log("caught bad server", d.toString());
				d.cancel();
				d.safeRetry();
			}
			return;
		}

		// work-around for ftp crap
		// nsiftpchan for some reason assumes that if RETR fails it is a directory
		// and tries to advance into said directory
		if (aStatusCode == NS_ERROR_FTP_CWD) {
			Debug.log("Cannot change to directory :p", aStatusCode);
			if (!this.handleError()) {
				d.fail(_('servererror'), _('ftperrortext'), _('servererror'));
			}
			return;
		}

		// routine for normal chunk
		Debug.log(this.url + ": Chunk " + c.start + "-" + c.end + " finished.");

		// rude way to determine disconnection: if connection is closed before
		// download is started we assume a server error/disconnection
		if (c.starter && d.is(RUNNING)) {
			if (!d.urlManager.markBad(this.url)) {
				Debug.log(d + ": Server error or disconnection", "(type 2)");
				d.pauseAndRetry();
				d.status = _("servererror");
			}
			else {
				Debug.log("caught bad server", d.toString());
				d.cancel();
				d.safeRetry();
			}
			return;
		}

		// Server did not return any data.
		// Try to mark the URL bad
		// else pause + autoretry
		if (!c.written  && !!c.remainder) {
			if (d.is(RUNNING) && !d.urlManager.markBad(this.url)) {
				Debug.log(d + ": Server error or disconnection", "(type 1)");
				d.pauseAndRetry();
				d.status = _("servererror");
			}
			return;
		}

		if (!d.isOf(PAUSED | CANCELED | FINISHING) && d.chunks.length == 1 && d.chunks[0] == c) {
			if (d.resumable || Preferences.getExt('resumeonerror', false)) {
				d.pauseAndRetry();
				d.status = _('errmismatchtitle');
			}
			else {
				d.fail(
					_('errmismatchtitle'),
					_('errmismatchtext', [d.partialSize, d.totalSize]),
					_('errmismatchtitle')
				);
			}
			return;
		}
		if (!d.isOf(PAUSED | CANCELED)) {
			d.resumeDownload();
		}
	},

	// nsIProgressEventSink
	onProgress: function DL_onProgress(aRequest, aContext, aProgress, aProgressMax) {
		try {
			// shortcuts
			let c = this.c;
			let d = this.d;

			if (this.reexamine) {
				Debug.log(d + ": reexamine");
				this.onStartRequest(aRequest, aContext);
				if (this.reexamine) {
					return;
				}
			}

			if (d.is(RUNNING)) {
				if (!this.resumable && d.totalSize) {
					// basic integrity check
					if (d.partialSize > d.totalSize) {
						d.dumpScoreboard();
						Debug.log(d + ": partialSize > totalSize" + "(" + d.partialSize + "/" + d.totalSize + "/" + ( d.partialSize - d.totalSize) + ")");
						d.fail(
							_('errmismatchtitle'),
							_('errmismatchtext', [d.partialSize, d.totalSize]),
							_('errmismatchtitle')
						);
						return;
					}
				}
				else {
					d.status = _("downloading");
				}
			}
		}
		catch(ex) {
			Debug.log("onProgressChange():", ex);
		}
	},
	onStatus: function  DL_onStatus(aRequest, aContext, aStatus, aStatusArg) {}
};
const GlobalBucket = new ByteBucket(Preferences.getExt('speedlimit', -1), 1.3);