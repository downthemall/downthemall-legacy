/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const NS_ERROR_MODULE_NETWORK = 0x804B0000;
const NS_ERROR_BINDING_ABORTED = NS_ERROR_MODULE_NETWORK + 2;
const NS_ERROR_UNKNOWN_HOST = NS_ERROR_MODULE_NETWORK + 30;
const NS_ERROR_CONNECTION_REFUSED = NS_ERROR_MODULE_NETWORK + 13;
const NS_ERROR_NET_TIMEOUT = NS_ERROR_MODULE_NETWORK + 14;
const NS_ERROR_NET_RESET = NS_ERROR_MODULE_NETWORK + 20;
const NS_ERROR_FTP_CWD = NS_ERROR_MODULE_NETWORK + 22;

let DTA = require("api");
/* global RUNNING, CANCELED, PAUSED, FINISHING */
requireJoined(this, "constants");
const {formatNumber, SimpleIterator, StringBundles, getTimestamp} = require("utils");
const {modifyURL, modifyHttp} = require("support/requestmanipulation");
const Preferences = require("preferences");
const {
	getUsableFileName,
	getUsableFileNameWithFlatten,
	getExtension
	} = require("support/stringfuncs");

const DISCONNECTION_CODES = [
	NS_ERROR_CONNECTION_REFUSED,
	NS_ERROR_UNKNOWN_HOST,
	NS_ERROR_NET_TIMEOUT,
	NS_ERROR_NET_RESET
];

const _ = (function(global) {
	let bundles = new StringBundles(["chrome://dta/locale/manager.properties"]);
	return function() {
		if (arguments.length === 1) {
			return bundles.getString(arguments[0]);
		}
		return bundles.getFormattedString.apply(bundles, arguments);
	};
})(this);

let proxyInfo = null;
const proxyObserver = {
	observe: function() {
		let type = Preferences.getExt("proxy.type", "");
		let host = Preferences.getExt("proxy.host", "");
		let port = Preferences.getExt("proxy.port", 0);
		let resolve = Preferences.getExt("proxy.resolve", true);
		if (!type || !host || !port) {
			log(LOG_DEBUG, "no proxy info");
			proxyInfo = null;
			return;
		}
		try {
			let flags = 0;
			if (resolve) {
				flags |= Ci.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST;
			}
			proxyInfo = Services.pps.newProxyInfo(type, host, port, flags, 0xffffffff, null);
			log(LOG_DEBUG, "created proxy info");
		}
		catch (ex) {
			log(LOG_ERROR, "Failed to create proxy info", ex);
			proxyInfo = null;
		}
	}
};
Preferences.addObserver("extensions.dta.proxy", proxyObserver);
proxyObserver.observe();

function Connection(d, c, isInfoGetter) {

	this.d = d;
	this.c = c;
	this.isInfoGetter = isInfoGetter;
	this.url = d.urlManager.getURL();

	let url = modifyURL(this.url.url.clone());

	let referrer = d.referrer;
	log(LOG_INFO, "starting: " + url.spec);

	try {
		if (proxyInfo) {
			let handler = Services.io.getProtocolHandler(url.scheme);
			if (handler instanceof Ci.nsIProxiedProtocolHandler) {
				this._chan = handler.newProxiedChannel(url, proxyInfo, 0, null);
			}
			else {
				this._chan = handler.newChannel(url);
			}
		}
		else {
			this._chan = Services.io.newChannelFromURI(url);
		}
	}
	catch (ex) {
		log(LOG_ERROR, "Failed to construct a channel the hard way!");
		this._chan = Services.io.newChannelFromURI(url);
	}
	let r = Ci.nsIRequest;
	let loadFlags = r.LOAD_NORMAL;
	if (!Preferences.getExt('useCache', false)) {
		loadFlags = loadFlags | r.LOAD_BYPASS_CACHE;
	}
	else {
		log(LOG_DEBUG, "using cache");
	}
	this._chan.loadFlags = loadFlags;
	this._chan.notificationCallbacks = this;

	if (d.isPrivate) {
		if (("nsIPrivateBrowsingChannel" in Ci) && (this._chan instanceof Ci.nsIPrivateBrowsingChannel)) {
			try {
				this._chan.setPrivate(d.isPrivate);
				log(LOG_DEBUG, url.spec + ": setPrivate");
			}
			catch (ex) {
				log(LOG_ERROR, "Cannot set channel to private; setPrivate failed!", ex);
				throw ex;
			}
		}
		else {
			log(LOG_ERROR, "Cannot set channel to private; not supported!");
		}
	}

	if (this._chan instanceof Ci.nsIHttpChannel) {
		try {
			log(LOG_DEBUG, "http");
			if (referrer instanceof Ci.nsIURI) {
				this._chan.referrer = referrer;
			}
			if (d.postData && this._chan instanceof Ci.nsIUploadChannel) {
				this._chan.setUploadStream(new Instances.StringInputStream(d.postData, d.postData.length), null, -1);
				this._chan.requestMethod = 'POST';
			}
		}
		catch (ex) {
			log(LOG_ERROR, "error setting up http channel", ex);
			// no-op
		}
	}
	else if (this._chan instanceof Ci.nsIFTPChannel) {
		try {
			if (c.currentPosition > 0) {
					let resumable = this._chan.QueryInterface(Ci.nsIResumableChannel);
					resumable.resumeAt(c.currentPosition, '');
			}
		}
		catch (ex) {
			log(LOG_ERROR, 'error setting up ftp channel', ex);
		}
	}
	this.prepareChannel(this._chan);

	c.running = true;
	this._chan.asyncOpen(this, null);
	log(LOG_INFO, c + "is now open");
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
		Ci.nsIClassInfo,
		Ci.nsICancelable,
	],

	cantCount: false,

	prepareChannel: function(chan) {
		let d = this.d;
		try {
			if (chan instanceof Ci.nsISupportsPriority) {
				if (d.forced) {
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
					if (!d.fromMetalink) {
						chan.setRequestHeader(
							"Accept",
							"application/metalink4+xml;q=0.9,application/metalink+xml;q=0.8",
							true
							);
					}
					chan.setRequestHeader('Want-Digest', DTA.WANT_DIGEST_STRING, false);
				}

				if (Preferences.getExt('nokeepalive', true)) {
					chan.setRequestHeader('Keep-Alive', '', false);
					chan.setRequestHeader('Connection', 'close', false);
				}

				if (c.currentPosition) {
					chan.setRequestHeader('Range', 'bytes=' + (c.currentPosition) + "-", false);
					log(LOG_DEBUG, "setting range");
				}

				modifyHttp(chan);

				try {
					// Users want this so they can have no-third-party when browsing regularly,
					// but still download from sites authenticating using cookies
					if (chan instanceof Ci.nsIHttpChannelInternal) {
						chan.forceAllowThirdPartyCookie = true;
						chan.allowSpdy = false;
					}
				}
				catch (ex) { /* no op */ }
			}
		}
		catch (ex) {
			log(LOG_ERROR, "Failed to prepare channel", ex);
		}
	},

	QueryInterface: function(iid) {
		for (let i = 0, e = this._interfaces.length; i < e; i++) {
			if (iid.equals(this._interfaces[i])) {
				return this;
			}
		}
		throw Cr.NS_ERROR_NO_INTERFACE;
	},

	// nsICancelable
	cancel: function(aReason) {
		try {
			if (this._closed) {
				return;
			}
			log(LOG_INFO, "cancel");
			if (!aReason) {
				aReason = NS_ERROR_BINDING_ABORTED;
			}
			this._chan.cancel(aReason);
			this._closed = true;
		}
		catch (ex) {
			log(LOG_ERROR, "cancel", ex);
		}
	},
	// nsIInterfaceRequestor
	getInterface: function(iid) {
		if (iid.equals(Ci.nsIAuthPrompt) || iid.equals(Ci.nsIAuthPrompt2)) {
			if (this.d.liftLoginRestriction) {
				delete this.d.liftLoginRestriction;
				this.d.AuthPrompts.authPrompter.allowLogin(this._chan.URI);
			}
			return this.d.AuthPrompts.authPrompter.QueryInterface(iid);
		}
		if (iid.equals(Ci.nsIPrompt)) {
			return this.d.AuthPrompts.prompter;
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
	onChannelRedirect: function(oldChannel, newChannel, flags) {
		let d = this.d;
		let c = this.c;
		try {
			if (!(oldChannel instanceof Ci.nsIChannel) || !(newChannel instanceof Ci.nsIChannel)) {
				throw new Exception("redirect: requests not channels");
			}

			this.prepareChannel(newChannel);

			// When we get redirected from, say, http to ftp, we need to explicitly
			// call resumeAt() as this won't be propagated from the old channel.
			if (c.currentPosition > 0 && !(newChannel instanceof Ci.nsIHttpChannel)) {
				let resumable = newChannel.QueryInterface(Ci.nsIResumableChannel);
				resumable.resumeAt(c.currentPosition, '');
				log(LOG_INFO, "redirect: set resumeAt on " +
					newChannel.URI.spec + "/" +
					newChannel.originalURI.spec + " at " +
					c.currentPosition
					);
			}
		}
		catch (ex) {
			log(LOG_ERROR, "redirect: cannot resumeAt", ex);
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
			d.fileName = getUsableFileName(newurl.usable);
			if (oldChannel instanceof Ci.nsIHttpChannel && oldChannel.responseStatus === 302) {
				this.extractMetaInfo(d, oldChannel);
				return;
			}
			d.urlManager.replace(this.url, newurl);
			this.url = newurl;
		}
		catch (ex) {
			log(LOG_ERROR, "Failed to reset data on channel redirect", ex);
		}
	},

	verifyChunksStarted: function() {
		let d = this.d;
		// XXX always check, not just .isInfoGetter?
		if (!this.isInfoGetter || d.chunks.every(function(c) !c.running || !!c.sessionBytes)) {
			// All running chunks received something at this point
			return false;
		}
		// Other downloads didn't start; assume the worst
		if (log.enabled) {
			log(LOG_ERROR, "Need to recombine chunks; not all started");
			d.dumpScoreboard();
		}

		// recombine affected chunks
		let chunks = d.chunks;
		for (let c, i = chunks.length - 1; i > 1 && (c = chunks[i]); --i) {
			if (!c.running || !!c.sessionBytes) {
				// Only check running chunks without bytes received
				log(LOG_DEBUG, "skipping: " + i + " / " + c);
				continue;
			}
			if (log.enabled) {
				log(LOG_DEBUG, "Respinning by merging: " + i + " / " + c);
			}
			// Merge with previous chunk
			chunks[i-1].end = c.end;
			c.cancelChunk();
			chunks.splice(i, 1);

			// We do not want to run into yet another timed out thing
			// However, completely disabling chunks isn't really a great thing to do
			if (d.maxChunks > 2) {
				d.maxChunks--;
			}
		}
		let ac = 0;
		d.chunks.forEach(function(c) { if (c.running) { ++ac; }});
		d.activeChunks = ac;

		if (log.enabled) {
			log(LOG_ERROR, "Done respinning, new score board follows");
			d.dumpScoreboard();
		}
		return true;
	},

	discard: function(aInputStream, count) {
		if (aInputStream instanceof Ci.nsISeekableStream) {
			try {
				aInputStream.seek(Ci.nsISeekableStream.NS_SEEK_END, 0);
				return;
			}
			catch (ex) {
				// no op
			}
		}
		try {
			if (count) {
				new Instances.BinaryInputStream(aInputStream).
					readArrayBuffer(count, new ArrayBuffer(count));
			}
		}
		catch (ex) {
			log(LOG_ERROR, "Failed to discard overrecv by conventional means " + count + " " + aInputStream.available(), ex);
			throw NS_ERROR_BINDING_ABORTED;
		}
	},

	// nsIStreamListener
	onDataAvailable: function(aRequest, aContext, aInputStream, aOffset, aCount) {
		if (this._closed) {
			throw NS_ERROR_BINDING_ABORTED;
		}
		try {
			// we want to kill ftp chans as well which do not seem to respond to
			// cancel correctly.
			let c = this.c;
			let written = c.write(aRequest, aInputStream, aCount);
			if (written < 0) {
				// need to attempt another write after merging in verifyChunksStarted
				if (this.verifyChunksStarted()) {
					written = c.write(aRequest, aInputStream, aCount);
				}
			}
			if (written < 0) {
				// we already got what we wanted
				try {
					this.discard(aInputStream, aCount);
				}
				finally {
					this.cancel();
				}
				return;
			}
			if (aCount - written > 0) {
				this.discard(aInputStream, aCount - written);
			}
		}
		catch (ex if (ex !== NS_ERROR_BINDING_ABORTED && ex.result !== NS_ERROR_BINDING_ABORTED)) {
			log(LOG_ERROR, 'onDataAvailable', ex);
			this.writeFailed();
		}
	},

	writeFailed: function() {
		log(LOG_DEBUG, "write failed invoked!");
		let d = this.d;
		d.fail(_("accesserror"), _("accesserror.long"), _("accesserror"));
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

	handleError: function() {
		let c = this.c;
		let d = this.d;

		c.cancelChunk();
		if (log.enabled) {
			d.dumpScoreboard();
		}
		if (!~d.chunks.indexOf(c)) {
			// already killed;
			return true;
		}

		log(LOG_ERROR, "handleError: problem found; trying to recover");

		if (d.urlManager.markBad(this.url)) {
			log(LOG_ERROR, "handleError: fresh urls available, kill this one and use another!");
			d.timeLastProgress = getTimestamp();
			return true;
		}

		if (log.enabled) {
			log(LOG_DEBUG, "affected: " + c);
			d.dumpScoreboard();
		}

		let max = -1, found = null;
		for (let cmp of d.chunks) {
			if (!cmp.running) {
				continue;
			}
			if (cmp.start < c.start && cmp.start > max) {
				found = cmp;
				max = cmp.start;
			}
		}
		if (found) {
			log(LOG_INFO, "handleError: found joinable chunk; recovering suceeded, chunk: " + found);

			// map current failed chunk into the found one
			found.end = c.end;

			// one less chunk
			--d.maxChunks;

			// remove the current chunk
			let cidx = d.chunks.indexOf(c);
			if (cidx > -1) {
				d.chunks.splice(cidx, 1);
			}
			d.chunks.sort(function(a, b) a.start - b.start);

			// check for overlapping ranges we might have created
			// otherwise we'll receive a size mismatch
			// this means that we're gonna redownload an already finished chunk...
			for (let i = d.chunks.length - 2; i > -1; --i) {
				let c1 = d.chunks[i], c2 = d.chunks[i + 1];
				if (c1.end >= c2.end) {
					if (c2.running) {
						// should never ever happen :p
						if (log.enabled) {
							d.dumpScoreboard();
							log(LOG_ERROR, "overlapping:\n" + c1 + "\n" + c2);
						}
						d.fail(
							"Internal error",
							"Please notify the developers that there were 'overlapping chunks'!",
							"Internal error (please report)"
							);
						return false;
					}
					d.chunks.splice(i + 1, 1);
				}
			}
			let ac = 0;
			d.chunks.forEach(function(c) { if (c.running) { ++ac; }});
			d.activeChunks = ac;
			c.close();

			d.save();
			if (log.enabled) {
				d.dumpScoreboard();
			}
			return true;
		}
		log(LOG_ERROR, "recovery failed");
		return false;
	},
	extractMetaInfo: function(download, channel, cb, visitor) {
		cb = cb || function() true;
		if (!visitor) {
			try {
				visitor = download.visitors.visit(channel);
			}
			catch (ex) {
				cb(ex);
				return;
			}
		}
		if (visitor.metaDescribedBy) {
			const safeTransfer = !(visitor.metaDescribedBy.scheme === "http" && channel.URI.scheme === "https");
			const secureHash = !!(download.hashCollection && download.hashCollection.full._q >= 0.5);
			if (!safeTransfer && !secureHash) {
				log(LOG_DEBUG, "rejecting metalink due to insecure metalink location");
				cb("unsafe transfer");
				return;
			}
			const {parse} = require("support/metalinker");
			let finalURI = channel.URI;
			try {
				if (!channel.requestSucceeded) {
					finalURI = Services.io.newURI(channel.getResponseHeader("Location"), null, null);
				}
			}
			catch (ex) {
				// no op
			}
			if (!secureHash && visitor.metaDescribedBy.host !== channel.URI.host) {
				log(LOG_DEBUG, "rejecting metalink due to host mismatch");
				cb("host mismatch");
				return;
			}
			parse(visitor.metaDescribedBy, "", function(res, ex) {
				if (ex) {
					log(LOG_ERROR, "Failed to parse metalink linked by the download", ex);
					cb(ex);
					return;
				}
				if (!res.downloads.length) {
					log(LOG_ERROR, "Rejected empty metalink linked by the download");
					cb("metalink empty");
					return;
				}
				let d;
				if (res.downloads.length === 1) {
					d = res.downloads;
				}
				else {
					d = res.downloads.filter(function(e) {
						return download.hashCollection && e.hashCollection &&
							download.hashCollection.full.type === e.hashCollection.full.type &&
							download.hashCollection.full.sum === e.hashCollection.full.sum;
					});
					if (!d.length) {
						d = res.downloads.filter(function(e) {
							return e.url._urls.some(function(k) {
								return ~[finalURI.spec, channel.URI.spec].indexOf(k.url.spec);
							});
						});
					}
				}
				if (!d.length) {
					log(LOG_ERROR, "no related files found in referred metalink document");
					cb("metalink empty");
					return;
				}
				d = d[0];
				download.fileName = d.fileName;
				if (download.totalSize && d.size && download.totalSize !== d.size) {
					log(LOG_ERROR, "Rejecting metalink due to size mismatch");
					cb("size mismatch");
					return;
				}
				for (var u of d.url.toArray()){
					download.urlManager.add(u);
				}
				if (d.hashCollection) {
					if (!download.hashCollection) {
						download.hashCollection = d.hashCollection;
						cb();
						return;
					}
					const oldHash = download.hashCollection;
					let newHash = {};
					if (!oldHash || d.hashCollection.full.q > oldHash.full.q) {
						newHash = {
							full: {
								sum: d.hashCollection.full.sum,
								type: d.hashCollection.full.type
							}
						};
					}
					else if(oldHash.full.type === d.hashCollection.full.type &&
							oldHash.full.sum !== d.hashCollection.full.sum) {
						log(LOG_ERROR, "Rejecting describedby metalink due to hash mismatch");
						cb("hash mismatch");
						return;
					}
					if (!newHash.full) {
						newHash.full = {
							sum: oldHash.full.sum,
							type: oldHash.full.type
						};
					}
					if (!d.hashCollection.partials.length) {
						newHash.parLength = oldHash.parLength;
						newHash.partials = oldHash.partials;
					}
					else if(!download.hashCollection.partials.length) {
						newHash.parLength = d.hashCollection.parLength;
						newHash.partials = d.hashCollection.partials;
					}
					else if (d.hashCollection.parLength === oldHash.parLength) {
						newHash.partials = [];
						newHash.parLength = oldHash.parLength;
						for (let i = 0, len = oldHash.partials.length; i < len; i++) {
							newHash.partials.push({
								sum: oldHash.partials[i].sum,
								type: oldHash.partials[i].type
							});
							if (newHash.partials[i].type === d.hashCollection.partials[i].type &&
								newHash.partials[i].sum !== d.hashCollection.parials[i].sum) {
								log(LOG_ERROR, "Rejecting describedby metalink due to hash mismatch");
								cb("hash mismatch");
								return;
							}
							else if(d.hashCollection.partials[i].q > oldHash.partials[i].q) {
								newHash.partials[i] = {
									sum: d.hashCollection.partials[i].sum,
									type: d.hashCollection.partials[i].type
								};
							}
						}
					}
					else if (d.hashCollection.partials.length > oldHash.partials.length &&
						d.hashCollection.partials[1].q > oldHash.partials[1].q) {
						newHash.parLength = d.hashCollection.parLength;
						newHash.partials = d.hashCollection.partials;
					}
					try {
						download.hashCollection = DTA.HashCollection.load(newHash);
					}
					catch (e) {
						log(LOG_ERROR, "Rejecting describedby metalink due to corrupted hashes");
					}
					cb();
				}
			});
		}
		else {
			cb();
		}
		if (visitor.mirrors &&
			download.hashCollection && download.hashCollection.full.q >= 0.5 &&
			!(download.isMetalink || download.fromMetalink)) {
			for (let mirror of visitor.mirrors) {
				download.urlManager.add(mirror);
			}
		}
	},
	handleHttp: function(aChannel) {
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
				log(LOG_ERROR, "caught bad server (Error: " + code + ")", d.toString());
				d.cancel();
				d.safeRetry();
				return false;
			}
			if (!this.handleError()) {
				log(LOG_ERROR, "handleError: Cannot recover from problem!", code);
				if (code === 401) {
					d.AuthPrompts.authPrompter.restrictLogin(aChannel.URI);
				}

				let file = d.fileName.length > 50 ? d.fileName.substring(0, 50) + "..." : d.fileName;
				if (~[401, 402, 407, 500, 502, 503, 504].indexOf(code) ||
					Preferences.getExt('recoverallhttperrors', false)) {
					log(LOG_DEBUG, "we got temp failure!", code);
					d.pauseAndRetry();
					d.status = code >= 500 ? _('temperror') : _('autherror');
				}
				else if (code === 450) {
					d.fail(
						_('pcerrortitle'),
						_('pcerrortext'),
						_('pcerrortitle')
					);
				}
				else if (code === 451) {
					d.fail(
						"Fahrenheit 451 (censored)",
						_("failed", [file]) + " " + _("sra", [code]) + ": " + status,
						"Fahrenheit 451"
						);
				}
				else {
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
		if (code !== 206 && !this.isInfoGetter && (c.currentPosition > 0 || c.start > 0)) {
			log(LOG_ERROR, d + ": Server returned a " +
				aChannel.responseStatus + " response instead of 206",
				this.isInfoGetter);

			if (!this.handleError()) {
				if (log.enabled) {
					let vis = {value: '', visitHeader: function(a,b) { this.value += a + ': ' + b + "\n"; }};
					aChannel.visitRequestHeaders(vis);
					log(LOG_DEBUG, "Request Headers\n\n" + vis.value);
					vis.value = '';
					aChannel.visitResponseHeaders(vis);
					log(LOG_DEBUG, "Response Headers\n\n" + vis.value);
				}
				d.cancel();
				d.resumable = false;
				d.safeRetry();
				return false;
			}
		}

		let visitor = null;
		try {
			visitor = d.visitors.visit(aChannel);
		}
		catch (ex) {
			log(LOG_ERROR, "header failed! " + d, ex);
			// restart download from the beginning
			if (!this.handleError()) {
				d.cancel();
				d.resumable = false;
				d.safeRetry();
			}
			return false;
		}

		if (!this.isInfoGetter) {
			return false;
		}

		if (visitor.type) {
			d.contentType = aChannel.contentType || visitor.type;
		}

		// compression?
		if (~['gzip', 'deflate'].indexOf(visitor.encoding) &&
			!d.contentType.match(/gzip/i) && !d.fileName.match(/\.gz$/i)) {
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

		if (visitor.type && ~visitor.type.search(/application\/metalink4?\+xml/)) {
			d.isMetalink = true;
			d.resumable = false;
		}

		d.relaxSize = !!visitor.relaxSize;

		if (visitor.fileName && visitor.fileName.length > 0) {
			// if content disposition hasn't an extension we use extension of URL
			log(LOG_DEBUG, "raw file name " + visitor.fileName);
			let newName = getUsableFileNameWithFlatten(visitor.fileName.replace(/\\|\?/g, '_'));
			log(LOG_DEBUG, "new file name " + newName);
			let ext = getExtension(this.url.usable);
			if (!~visitor.fileName.lastIndexOf('.') && ext) {
				newName += ('.' + ext);
				newName = getUsableFileNameWithFlatten(newName);
			}
			d.fileName = newName;
		}

		if (code !== 206) {
			if (visitor.contentLength > 0) {
				d.totalSize = visitor.contentLength;
			}
			else {
				d.totalSize = 0;
			}
			log(LOG_DEBUG, "set total size");
		}


		this.extractMetaInfo(d, this._chan, null, visitor);
		return false;
	},

	// Generic handler for now :p
	handleFtp: function  DL_handleFtp(aChannel) {
		let c = this.d;
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
			if (d.totalSize && totalSize !== d.totalSize && !this.handleError()) {
				log(LOG_ERROR, "ftp: total size mismatch " + totalSize + " " + d.totalSize);
				d.fail(_('servererror'), _('ftperrortext'), _('servererror'));
				return false;
			}
			log(LOG_INFO, "ftp: total size is: " + totalSize + " for: " + this.url);
			d.totalSize = totalSize;
		}
		catch (ex) {
			log(LOG_ERROR, "ftp: no totalsize", ex);
			if (c.start && !this.handleError()) {
				d.fail(_('servererror'), _('ftperrortext'), _('servererror'));
				return false;
			}
			d.totalSize = 0;
			d.resumable = false;
		}

		try {
			if (!aChannel.QueryInterface(Ci.nsIResumableChannel).entityID) {
				throw new Error("no entityID");
			}
		}
		catch (ex) {
			log(LOG_INFO, "likely not resumable or connection refused!", ex);
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
			log(LOG_ERROR, "header failed! " + d, ex);
			// restart download from the beginning
			d.cancel();
			d.resumable = false;
			d.safeRetry();
			return false;
		}
		return false;
	},

	handleGeneric: function(aChannel) {
		let c = this.c;
		let d = this.d;

		// hack: determine if we are a multi-part chunk,
		// if so something bad happened, 'cause we aren't supposed to be multi-part
		if (c.start && d.state === RUNNING) {
			if (!this.handleError()) {
				log(LOG_ERROR, d + ": Server error or disconnection", "(type 1)");
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
			catch (e) {
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
	onStartRequest: function(aRequest, aContext) {
		let c = this.c;
		let d = this.d;
		log(LOG_INFO, 'StartRequest: ' + c);

		this.started = true;

		if (!~d.chunks.indexOf(c)) {
			return;
		}

		try {
			for (let sc of this._supportedChannels) {
				let chan = null;
				try {
					chan = aRequest.QueryInterface(sc.i);
					if ((this.rexamine = this[sc.f](chan))) {
						return;
					}
					break;
				}
				catch (ex) {
					log(LOG_DEBUG, "examine", ex);
					// continue
				}
			}

			if (this.isInfoGetter) {
				log(LOG_DEBUG, "Infogetter");
				let ext = getExtension(d.fileName);
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
				if (c.end < 1) {
					c.end = d.totalSize - 1;
				}

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
			log(LOG_ERROR, "onStartRequest", ex);
			d.fail(_("unknownerror"), _('unknownerror.text'), _("unknownerror"));
			return;
		}
	},
	onStopRequest: function(aRequest, aContext, aStatusCode) {
		try {
			log(LOG_INFO, 'StopRequest');
		}
		catch (ex) {
			return;
		}

		try {
			let c = this.c;
			let d = this.d;

			log(LOG_DEBUG, "closing");
			c.close();

			if (!~d.chunks.indexOf(c)) {
				log(LOG_INFO, "chunk unknown");
				return;
			}

			// update flags and counters
			d.refreshPartialSize();
			--d.activeChunks;

			// If automatic creation of new chunks is disabled we reduce maxChunks for
			// every complete chunk so that no new chunk is generated.
			// Manual addidition of new chunks is not affected by this.
			if (!Preferences.getExt('autosegments', true) && d.maxChunks > 1) {
				--d.maxChunks;
			}

			const isRunning = d.state === RUNNING;

			if (c.starter && ~DISCONNECTION_CODES.indexOf(aStatusCode)) {
				if (!d.urlManager.markBad(this.url)) {
					log(LOG_ERROR, d + ": Server error or disconnection", "(type 3)");
					d.pauseAndRetry();
					d.status = _("servererror");
				}
				else {
					log(LOG_ERROR, "caught bad server", d.toString());
					d.cancel();
					d.safeRetry();
				}
				return;
			}

			// work-around for ftp crap
			// nsiftpchan for some reason assumes that if RETR fails it is a directory
			// and tries to advance into said directory
			if (aStatusCode === NS_ERROR_FTP_CWD) {
				log(LOG_DEBUG, "Cannot change to directory :p", aStatusCode);
				if (!this.handleError()) {
					d.fail(_('servererror'), _('ftperrortext'), _('servererror'));
				}
				return;
			}

			// routine for normal chunk
			log(LOG_INFO, this.url + ": Chunk " + c.start + "-" + c.end + " finished.");

			// rude way to determine disconnection: if connection is closed before
			// download is started we assume a server error/disconnection
			if (c.starter && isRunning && !c.written) {
				if (!d.urlManager.markBad(this.url)) {
					log(LOG_ERROR, d + ": Server error or disconnection", "(type 2)");
					d.pauseAndRetry();
					d.status = _("servererror");
				}
				else {
					log(LOG_ERROR, "caught bad server", d.toString());
					d.cancel();
					d.safeRetry();
				}
				return;
			}

			// Server did not return any data.
			// Try to mark the URL bad
			// else pause + autoretry
			if (!c.written && !!c.remainder) {
				if (!d.urlManager.markBad(this.url)) {
					log(LOG_ERROR, d + ": Server error or disconnection", "(type 1)");
					d.pauseAndRetry();
					d.status = _("servererror");
				}
				return;
			}

			// check if we're complete now
			if (isRunning && d.chunks.every(e => e.complete)) {
				if (!d.resumeDownload()) {
					log(LOG_INFO, d + ": Download is complete!");
					d.finishDownload();
					return;
				}
			}

			// size mismatch
			if (!d.isOf(PAUSED | CANCELED | FINISHING) && d.chunks.length === 1 && d.chunks[0] === c) {
				if (d.relaxSize && c.remainder < 250) {
					log(LOG_INFO, d + ": Download is complete!");
					d.setState(FINISHING);
					d.finishDownload();
					return;
				}
				if (d.resumable && c.sessionBytes > 0) {
					// fast retry unless we didn't actually receive something
					d.resumeDownload();
				}
				else if (d.resumable || Preferences.getExt('resumeonerror', false)) {
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
		}
		finally {
			delete this.c;
			delete this._chan;
		}
	},

	// nsIProgressEventSink
	onProgress: function(aRequest, aContext, aProgress, aProgressMax) {
		try {
			// shortcuts
			let c = this.c;
			let d = this.d;

			if (this.reexamine) {
				log(LOG_DEBUG, d + ": reexamine");
				this.onStartRequest(aRequest, aContext);
				if (this.reexamine) {
					return;
				}
			}

			if (d.state === RUNNING) {
				if (!this.resumable && d.totalSize) {
					// basic integrity check
					if (d.partialSize > d.totalSize + (d.relaxSize ? 250 : 0)) {
						if (log.enabled) {
							d.dumpScoreboard();
							log(LOG_DEBUG, d + ": partialSize > totalSize" +
								"(" + d.partialSize + "/" + d.totalSize +
								"/" + ( d.partialSize - d.totalSize) + ")");
						}
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
			log(LOG_ERROR, "onProgressChange():", ex);
		}
	},
	onStatus: function  DL_onStatus(aRequest, aContext, aStatus, aStatusArg) {}
};

exports.Connection = Connection;
