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
 * The Original Code is DownThemAll VisitorManager module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2009
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

const EXPORTED_SYMBOLS = [
	"VisitorManager"
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

module("resource://dta/utils.jsm");

const DTA = {};
module("resource://dta/glue2.jsm");
module("resource://dta/api.jsm", DTA);

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
				if (Logger.enabled) {
					Logger.log(x + " missing");
				}
				throw new Exception(x + " is missing");
			}
			// header is there, but differs
			else if (this[x] != v[x]) {
				if (Logger.enabled) {
					Logger.log(x + " nm: [" + this[x] + "] [" + v[x] + "]");
				}
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
	visit: function(chan) {
		try {
			this.type = chan.getResponseHeader("content-type");
			var ch = this.type.match(/charset=['"]?([\w\d_-]+)/i);
			if (ch && ch[1].length) {
				if (Logger.enabled) {
					Logger.log("visitHeader: found override to " + ch[1]);
				}
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
			if (Logger.enabled) {
				Logger.log("Etag: " + this.etag + " - " + etag);
			}
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
					if (Logger.enabled) {
						Logger.log(this.time);
					}
				}
			}
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("visitChan:", ex);
			}
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
				if (Logger.enabled) {
					Logger.log("failed to read one visitor", ex);
				}
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
				if (Logger.enabled) {
					Logger.log(x, ex);
				}
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
