/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const DTA = require("api");
const {LOCALE} = require("version");
const {getTimestamp, normalizeMetaPrefs} = require("utils");

function Visitor() {
	// sanity check
	if (arguments.length != 1) {
		return;
	}

	let nodes = arguments[0];
	for (let x in nodes) {
		if (!(x in this.cmpKeys))	{
			continue;
		}
		this[x] = nodes[x];
	}
}

Visitor.prototype = {
	compare: function vi_compare(v)	{
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
			else if (this[x] != v[x]) {
				log(LOG_ERROR, x + " nm: [" + this[x] + "] [" + v[x] + "]");
				throw new Exception("Header " + x + " doesn't match");
			}
		}
	},
	save: function vi_save(node) {
		var rv = {};
		for (let x in this.cmpKeys) {
			if (!(x in this)) {
				continue;
			}
			rv[x] = this[x];
		}
		return rv;
	}
};

function HttpVisitor(chan) {
	if (chan instanceof Ci.nsIHttpChannel) {
		this._charset = chan.URI.originCharset;
		this.visit(chan);
	}
	else {
		Visitor.apply(this, arguments);
	}
}

HttpVisitor.prototype = {
	__proto__: Visitor.prototype,
	acceptRanges: true,
	cmpKeys: {
		'etag': true, // must not be modified from 200 to 206:
									// http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.2.7
		//'content-length': false,
		'last-modified': true, // may get omitted later, but should not change
		'content-encoding': true // must not change, or download will become
															// corrupt.
	},
	QueryInterface: function(aIID) {
		if (
			aIID.equals(Ci.nsISupports)
			|| aIID.equals(Ci.nsIHttpHeaderVisitor)
		) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	visit: function vmh_visit(chan) {
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
				this._charset = this.overrideCharset = ch[1];
			}
		}
		catch (ex) {}

		try {
			this.encoding = chan.getResponseHeader("content-encoding");
		}
		catch (ex) {}

		try {
			this.acceptRanges = !/none/i.test(chan.getResponseHeader("accept-ranges"));
		}
		catch (ex) {}

		try {
			this.acceptRanges = aValue.toLowerCase().indexOf('none') == -1;
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
			let digest = chan.getResponseHeader("digest");
			for (let t in DTA.SUPPORTED_HASHES_ALIASES) {
				try {
					let v = Services.mimeheader.getParameter(aValue, t, this._charset, true, {});
					if (!v) {
						continue;
					}
					v = hexdigest(atob(v));
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

		var links = [];
		this.mirrors = [];
		try {
			links = chan.getResponseHeader("Link").split(/,\s*/g);
		}
		catch (ex) {
			links = [];
		}
		for each(var link in links) {
			try {
				var linkURI = Services.mimeheader.getParameter(link, null, null, true, {})
					.replace(/[<>]/g, '');
				var rel = Services.mimeheader.getParameter(link, "rel", null, true, {});
				if (rel == "describedby") {
					var type = Services.mimeheader.getParameter(link, "type", null, true, {});
					if (type == "application/metalink4+xml") {
						this.metaDescribedBy = Services.io.newURI(linkURI, null, null);
					}
				}
				else if(rel == "duplicate") {
					linkURI = Services.io.newURI(linkURI, null, null);
					var pri = null;
					try {
							.slice(0,2).toLowerCase();
						pri = Services.mimeheader.getParameter(link, "pri", null, true, {});
						pri = parseInt(pri);
						try {
							var pref = Services.mimeheader.getParameter(link, "pref", null, true, {});
							pri = 1;
						}
						catch (ex) {}
						try{
							var depth = Services.mimeheader.getParameter(link, "depth", null, true, {});
						}
						catch (ex) {}
						try {
							var geo = Services.mimeheader.getParameter(link, "geo", null, true, {})
							if (LOCALE.indexOf(geo) != -1) {
								pri = Math.max(pri / 4, 1);
							}
						}
						catch (ex) {}
					}
					catch (ex) {}
					this.mirrors.push(new DTA.URL(linkURI, pri));
				}
			}
			catch (ex) {
				log(LOG_ERROR, ex);
			}
		}
		normalizeMetaPrefs(this.mirrors);

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
	},
	_checkFileName: function(aValue) {
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
			this.fileName = fn;
		}
	}
};

function FtpVisitor(chan) {
	Visitor.apply(this, arguments);
}

FtpVisitor.prototype = {
	__proto__: Visitor.prototype,
	cmpKeys: {
		'etag': true,
	},
	time: null,
	visitChan: function fv_visitChan(chan) {
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
};

/**
 * Visitor Manager c'tor
 *
 * @author Nils
 */
function VisitorManager() {
	this._visitors = {};
}
VisitorManager.prototype = {
	/**
	 * Loads a ::save'd JS Array Will silently bypass failed items!
	 */
	load: function vm_init(nodes) {
		for each (let n in nodes) {
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
	},
	/**
	 * Saves/serializes the Manager and associated Visitors to an JS Array
	 *
	 * @return A ::load compatible Array
	 */
	toJSON: function vm_toJSON() {
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
	},
	/**
	 * Visit and compare a channel
	 *
	 * @returns visitor for channel
	 * @throws Exception
	 *           if comparision yield a difference (i.e. channels are not
	 *           "compatible")
	 */
	visit: function vm_visit(chan) {
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
	},
	/**
	 * return the first timestamp registered with a visitor
	 *
	 * @throws Exception
	 *           if no timestamp found
	 */
	get time() {
		for each (let v in this._visitors) {
			if (v.time && v.time > 0) {
				return v.time;
			}
		}
		throw new Exception("No Date registered");
	}
};

exports.VisitorManager = VisitorManager;
