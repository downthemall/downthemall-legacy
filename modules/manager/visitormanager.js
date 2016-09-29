/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const DTA = require("api");
const {LOCALE} = require("version");
const {getTimestamp, normalizeMetaPrefs} = require("utils");
const {identity} = require("support/memoize");

class Visitor {
	constructor(nodes) {
		if (nodes) {
			for (let x in nodes) {
				if (!(x in this.cmpKeys))	{
					continue;
				}
				this[x] = nodes[x];
			}
		}
	}

	compare(v)	{
		if (!(v instanceof Visitor)) {
			return;
		}

		for (let x in this.cmpKeys) {
			// we don't have this header
			if (!(x in this)) {
				continue;
			}
			// v does not have this header
			else if (!(x in v)) {
				// allowed to be missing?
				if (this.cmpKeys[x]) {
					continue;
				}
				log(LOG_ERROR, x + " missing");
				throw new Exception(x + " is missing");
			}
			// header is there, but differs
			else if (this[x] !== v[x]) {
				log(LOG_ERROR, x + " nm: [" + this[x] + "] [" + v[x] + "]");
				throw new Exception("Header " + x + " doesn't match");
			}
		}
	}

	save(node) {
		var rv = {};
		for (let x in this.cmpKeys) {
			if (!(x in this)) {
				continue;
			}
			rv[x] = this[x];
		}
		return rv;
	}
}

class HttpVisitor extends Visitor {
	constructor(chan) {
		if ((chan instanceof Ci.nsIHttpChannel) || ("_stub" in chan)) {
			super(null);
			this.acceptRanges = true;
			this._charset = chan.URI.originCharset;
			this.visit(chan);
		}
		else {
			super(chan);
		}
	}

	QueryInterface(aIID) {
		if (aIID.equals(Ci.nsISupports) ||
			aIID.equals(Ci.nsIHttpHeaderVisitor)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}

	visit(chan) {
		if (log.enabled) {
			let msg = chan.URI.spec + "\nRequest:\n";
			let visitor = {
				visitHeader: function(header, value) {
					msg += header + ": " + value + "\n";
				}
			};
			chan.visitRequestHeaders(visitor);
			msg += "\nResponse:\n";
			chan.visitResponseHeaders(visitor);
			log(LOG_DEBUG, msg);
		}
		try {
			this.type = chan.getResponseHeader("content-type");
			var ch = this.type.match(/charset=['"]?([\w\d_-]+)/i);
			if (ch && ch[1].length) {
				log(LOG_DEBUG, "visitHeader: found override to " + ch[1]);
				this._charset = this.overrideCharset = identity(ch[1]);
			}
		}
		catch (ex) {}

		try {
			this.encoding = identity(chan.getResponseHeader("content-encoding"));
		}
		catch (ex) {}

		try {
			this.acceptRanges = !/none/i.test(chan.getResponseHeader("accept-ranges"));
			if (!this.acceptRanges) {
				this.acceptRanges = !~this.acceptRanges.toLowerCase().indexOf('none');
			}
		}
		catch (ex) {}

		let contentLength;
		try {
			contentLength = parseInt(chan.getResponseHeader("content-length"), 10);
		}
		catch (ex) {}
		if (contentLength < 0 || isNaN(contentLength)) {
			try {
				contentLength = parseInt(chan.getResponseHeader("content-range").split("/").pop(), 10);
			} catch (ex) {}
		}
		if (contentLength > 0 && !isNaN(contentLength)) {
			this.contentLength = contentLength;
		}

		try {
			let digest = chan.getResponseHeader("digest").replace(/,/g, ";");
			digest = ";" + digest;
			for (let t in DTA.SUPPORTED_HASHES_ALIASES) {
				try {
					let v = Services.mimeheader.getParameter(digest, t, this._charset, true, {});
					if (!v) {
						continue;
					}
					v = atob(v);
					v = new DTA.Hash(v, t);
					if (!this.hash || this.hash.q < v.q) {
						this.hash = v;
					}
				}
				catch (ex) {
					// no-op
				}
			}
		}
		catch (ex) {}
		try {
			let poweredby = chan.getResponseHeader("x-powered-by");
			if (!!poweredby) {
				this.relaxSize = true;
			}
		}
		catch (ex) {}

		try {
			delete this.mirrors;
			let links = chan.getResponseHeader("Link").split(/,\s*/g);
			for (let link of links) {
				try {
					let linkURI = Services.mimeheader.getParameter(link, null, null, true, {})
						.replace(/[<>]/g, '');
					const rel = Services.mimeheader.getParameter(link, "rel", null, true, {});
					if (rel === "describedby") {
						const type = Services.mimeheader.getParameter(link, "type", null, true, {});
						if (type === "application/metalink4+xml") {
							this.metaDescribedBy = Services.io.newURI(linkURI, null, null);
						}
					}
					else if (rel === "duplicate") {
						linkURI = Services.io.newURI(linkURI, null, null);
						let pri, pref, depth;
						try {
							pri = Services.mimeheader.getParameter(link, "pri", null, true, {});
							pri = parseInt(pri, 10);
							try {
								pref = Services.mimeheader.getParameter(link, "pref", null, true, {});
								pri = 1;
							}
							catch (ex) {}
							try{
								depth = Services.mimeheader.getParameter(link, "depth", null, true, {});
							}
							catch (ex) {}
							try {
								const geo = Services.mimeheader.getParameter(link, "geo", null, true, {})
									.slice(0,2).toLowerCase();
								if (~LOCALE.indexOf(geo)) {
									pri = Math.max(pri / 4, 1);
								}
							}
							catch (ex) {}
						}
						catch (ex) {}
						if (!this.mirrors) {
							this.mirrors = [];
						}
						this.mirrors.push(new DTA.URL(linkURI, pri));
					}
				}
				catch (ex) {
					log(LOG_ERROR, "VM: failed to process a link", ex);
				}
			}
			if (this.mirrors) {
				normalizeMetaPrefs(this.mirrors);
			}
		}
		catch (ex) {
			log(LOG_DEBUG, "VM: failed to process links", ex);
		}

		for (let header in this.cmpKeys) {
			try {
				let value = chan.getResponseHeader(header);
				this[header] = value;
			}
			catch (ex) {}
		}

		if ("etag" in this) {
			let etag = this.etag;
			this.etag = etag
				.replace(/^(?:[Ww]\/)?"(.+)"$/, '$1')
				.replace(/^[a-f\d]+-([a-f\d]+)-([a-f\d]+)$/, '$1-$2')
				.replace(/^([a-f\d]+):[a-f\d]{1,6}$/, '$1');
			log(LOG_DEBUG, "Etag: " + this.etag + " - " + etag);
		}
		if ("last-modified" in this) {
			try {
				this.time = getTimestamp(this["last-modified"]);
			}
			catch (ex) {}
		}

		try {
			this._checkFileName(chan.getResponseHeader("content-disposition"));
		}
		catch (ex) {}
		if (!("fileName" in this) && ("type" in this)) {
			this._checkFileName(this.type);
		}

	}
	_checkFileName(aValue) {
		let fn;
		try {
			fn = Services.mimeheader.getParameter(aValue, 'filename', this._charset, true, {});
		}
		catch (ex) {
			// no-op; handled below
		}
		if (!fn) {
			try {
				fn = Services.mimeheader.getParameter(aValue, 'name', this._charset, true, {});
			}
			catch (ex) {
				// no-op; handled below
			}
		}
		if (fn) {
			this.fileName = identity(fn);
			this.relaxSize = true;
		}
	}
};
Object.assign(HttpVisitor.prototype, {
	cmpKeys: {
		'etag': true, // must not be modified from 200 to 206:
									// http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.2.7
		//'content-length': false,
		'last-modified': true, // may get omitted later, but should not change
		'content-encoding': true // must not change, or download will become
															// corrupt.
	},
});

class FtpVisitor extends Visitor {
	constructor(nodes) {
		super(nodes);
		this.time = null;
	}

	visitChan(chan) {
		try {
			this.etag = chan.QueryInterface(Ci.nsIResumableChannel).entityID;
			let m = this.etag.match(/\/(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(?:(\d{2})))?$/);
			if (m) {
				let time = m[1] + '/' + m[2] + '/' + m[3];
				if (m.length >= 4) {
					time += ' ' + m[4] + ':' + m[5];
					if (m.length >= 7) {
						time += ':' + m[6];
					}
					this.time = getTimestamp(time);
					log(LOG_DEBUG, this.time);
				}
			}
		}
		catch (ex) {
			log(LOG_ERROR, "visitChan:", ex);
		}
	}
}
Object.assign(FtpVisitor.prototype, {
	cmpKeys: {
		'etag': true,
	},
});

class VisitorManager {
	constructor() {
		this._visitors = {};
	}

	/**
	 * Loads a ::save'd JS Array Will silently bypass failed items!
	 */
	load(nodes) {
		for (let n of nodes) {
			try {
				let uri = Services.io.newURI(n.url, null, null);
				switch (uri.scheme) {
				case 'http':
				case 'https':
					this._visitors[n.url] = new HttpVisitor(n.values);
					break;
				case 'ftp':
					this._visitors[n.url] = new FtpVisitor(n.values);
					break;
				}
			}
			catch (ex) {
				log(LOG_ERROR, "failed to read one visitor", ex);
			}
		}
	}
	/**
	 * Saves/serializes the Manager and associated Visitors to an JS Array
	 *
	 * @return A ::load compatible Array
	 */
	toJSON() {
		let rv = [];
		for (let x in this._visitors) {
			try {
				var v = {};
				v.url = x;
				v.values = this._visitors[x].save();
				rv.push(v);
			}
			catch(ex) {
				log(LOG_ERROR, x, ex);
			}
		}
		return rv;
	}
	/**
	 * Visit and compare a channel
	 *
	 * @returns visitor for channel
	 * @throws Exception
	 *           if comparision yield a difference (i.e. channels are not
	 *           "compatible")
	 */
	visit(chan) {
		let url = chan.URI.spec;

		let visitor;
		switch(chan.URI.scheme) {
		case 'http':
		case 'https':
			visitor = new HttpVisitor(chan);
			break;

		case 'ftp':
			visitor = new FtpVisitor(chan);
			visitor.visitChan(chan);
			break;

		default:
			return;
		}

		if (url in this._visitors) {
			this._visitors[url].compare(visitor);
		}
		return (this._visitors[url] = visitor);
	}
	/**
	 * return the first timestamp registered with a visitor
	 *
	 * @throws Exception
	 *           if no timestamp found
	 */
	get time() {
		for (let [,v] in new Iterator(this._visitors)) {
			if (v.time && v.time > 0) {
				return v.time;
			}
		}
		throw new Exception("No Date registered");
	}
}

exports.VisitorManager = VisitorManager;
