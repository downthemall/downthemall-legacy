/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

/**
 * Metalinker3 namespace
 */
const NS_METALINKER3 = 'http://www.metalinker.org/';
/**
 * Metalinker 4 namespace
 */
const NS_METALINK_RFC5854 = 'urn:ietf:params:xml:ns:metalink';

const DTA = require("api");
const Preferences = require("preferences");
const {LOCALE} = require("version");
const {UrlManager} = require("./urlmanager");
const {NS_DTA, NS_HTML, normalizeMetaPrefs} = require("utils");

const XPathResult = Ci.nsIDOMXPathResult;

/**
 * Parsed Metalink representation
 * (Do not construct yourself unless you know what you're doing)
 */
function Metalink(downloads, info, parser) {
	this.downloads = downloads;
	this.info = info;
	this.parser = parser;
}
Metalink.prototype = {
	/**
	 * Array of downloads
	 */
	downloads: [],
	/**
	 * Dict of general information
	 */
	info: {},
	/**
	 * Parser identifaction
	 */
	parser: ""
};

function Base(doc, NS) {
	this._doc = doc;
	this._NS = NS;
}
Base.prototype = {
	lookupNamespaceURI: function Base_lookupNamespaceURI(prefix) {
		switch (prefix) {
		case 'html':
			return NS_HTML;
		case 'dta':
			return NS_DTA;
		}
		return this._NS;
	},
	getNodes: function (elem, query) {
		let rv = [];
		let iterator = this._doc.evaluate(
			query,
			elem,
			this,
			XPathResult.ORDERED_NODE_ITERATOR_TYPE,
			null
		);
		for (let n = iterator.iterateNext(); n; n = iterator.iterateNext()) {
			rv.push(n);
		}
		return rv;
	},
	getNode: function Base_getNode(elem, query) {
		let r = this.getNodes(elem, query);
		if (r.length) {
			return r.shift();
		}
		return null;
	},
	getSingle: function BasegetSingle(elem, query) {
		let rv = this.getNode(elem, 'ml:' + query);
		return rv ? rv.textContent.trim() : '';
	},
	getLinkRes: function BasegetLinkRes(elem, query) {
		let rv = this.getNode(elem, 'ml:' + query);
		if (rv) {
			let n = this.getSingle(rv, 'name'), l = this.checkURL(this.getSingle(rv, 'url'));
			if (n && l) {
				return [n, l];
			}
		}
		return null;
	},
	checkURL: function Base_checkURL(url, allowed) {
		if (!url) {
			return null;
		}
		try {
			url = Services.io.newURI(url, this._doc.characterSet, null);
			if (url.scheme === 'file') {
				throw new Exception("file protocol invalid!");
			}
			// check for some popular bad links :p
			if (!~['http', 'https', 'ftp'].indexOf(url.scheme) || !~url.host.indexOf('.')) {
				if (!(allowed instanceof Array)) {
					throw new Exception("bad link!");
				}
				if (!~allowed.indexOf(url.scheme)) {
					throw new Exception("not allowed!");
				}
			}
			return url.spec;
		}
		catch (ex) {
			log(LOG_ERROR, "checkURL: failed to parse " + url, ex);
			// no-op
		}
		return null;
	}
};

/**
 * Metalink3 Parser
 * @param doc document to parse
 * @return Metalink
 */
function Metalinker3(doc) {
	let root = doc.documentElement;
	if (root.nodeName !== 'metalink' || root.getAttribute('version') !== '3.0') {
		throw new Exception('mlinvalid');
	}
	Base.call(this, doc, NS_METALINKER3);
}
Metalinker3.prototype = {
	__proto__: Base.prototype,
	parse: function ML3_parse(aReferrer) {
		if (aReferrer && 'spec' in aReferrer) {
			aReferrer = aReferrer.spec;
		}

		let doc = this._doc;
		let root = doc.documentElement;
		let downloads = [];

		let files = this.getNodes(doc, '//ml:files/ml:file');

		if (!files.length) {
			throw new Exception("No valid file nodes");
		}

		for (let file of files) {
			let fileName = file.getAttribute('name');
			if (!fileName) {
				throw new Exception("LocalFile name not provided!");
			}
			let referrer = null;
			if (file.hasAttributeNS(NS_DTA, 'referrer')) {
				referrer = file.getAttributeNS(NS_DTA, 'referrer');
			}
			else {
				referrer = aReferrer;
			}
			let num = null;
			if (file.hasAttributeNS(NS_DTA, 'num')) {
				try {
					num = parseInt(file.getAttributeNS(NS_DTA, 'num'), 10);
				}
				catch (ex) {
					/* no-op */
				}
			}
			if (!num) {
				num = DTA.currentSeries();
			}
			let startDate = new Date();
			if (file.hasAttributeNS(NS_DTA, 'startDate')) {
				try {
					startDate = new Date(parseInt(file.getAttributeNS(NS_DTA, 'startDate'), 10));
				}
				catch (ex) {
					/* no-op */
				}
			}

			let urls = [];
			let urlNodes = this.getNodes(file, 'ml:resources/ml:url');
			for (var url of urlNodes) {
				let preference = 1;
				let charset = doc.characterSet;
				if (url.hasAttributeNS(NS_DTA, 'charset')) {
					charset = url.getAttributeNS(NS_DTA, 'charset');
				}

				let uri = null;
				try {
					if (url.hasAttribute('type') && !url.getAttribute('type').match(/^(?:https?|ftp)$/i)) {
						throw new Exception("Invalid url type");
					}
					uri = this.checkURL(url.textContent.trim());
					if (!uri) {
						throw new Exception("Invalid url");
					}
					else if(!url.hasAttribute('type') && uri.substr(-8) === ".torrent") {
						throw new Exception("Torrent downloads not supported");
					}
					uri = Services.io.newURI(uri, charset, null);
				}
				catch (ex) {
					log(LOG_ERROR, "Failed to parse URL" + url.textContent, ex);
					continue;
				}

				if (url.hasAttribute('preference')) {
					let a = parseInt(url.getAttribute('preference'), 10);
					if (isFinite(a) && a > 0 && a < 101) {
						preference = a;
					}
				}
				if (url.hasAttribute('location')) {
					let a = url.getAttribute('location').slice(0,2).toLowerCase();
					if (~LOCALE.indexOf(a)) {
						preference = 100 + preference;
					}
				}
				urls.push(new DTA.URL(uri, preference));
			}
			if (!urls.length) {
				continue;
			}
			let size = this.getSingle(file, 'size');
			size = parseInt(size, 10);
			if (!isFinite(size)) {
				size = 0;
			}

			let hash = null;
			for (let h of this.getNodes(file, 'ml:verification/ml:hash')) {
				try {
					h = new DTA.Hash(h.textContent.trim(), h.getAttribute('type'));
					if (!hash || hash.q < h.q) {
						hash = h;
					}
				}
				catch (ex) {
					log(LOG_ERROR, "Failed to parse hash: " + h.textContent.trim() + "/" + h.getAttribute('type'), ex);
				}
			}
			if (hash) {
				hash = new DTA.HashCollection(hash);
				let pieces = this.getNodes(file, 'ml:verification/ml:pieces');
				if (pieces.length) {
					pieces = pieces[0];
					let type = pieces.getAttribute('type').trim();
					try {
						hash.parLength = parseInt(pieces.getAttribute('length'), 10);
						if (!isFinite(hash.parLength) || hash.parLength < 1) {
							throw new Exception("Invalid pieces length");
						}
						let collection = [];
						let maxPiece = Math.ceil(size / hash.parLength);
						for (let piece of this.getNodes(pieces, 'ml:hash')) {
							try {
								let num = parseInt(piece.getAttribute('piece'), 10);
								if (!maxPiece || (num >= 0 && num <= maxPiece)) {
									collection[num] =  new DTA.Hash(piece.textContent.trim(), type);
								}
								else {
									throw new Exception("out of bound piece");
								}
							}
							catch (ex) {
								log(LOG_ERROR, "Failed to parse piece", ex);
								throw ex;
							}
						}
						let totalPieces = maxPiece || collection.length;
						for (let i = 0; i < totalPieces; i++) {
							if (collection[i]) {
								hash.add(collection[i]);
							}
							else {
								throw new Exception("missing piece");
							}
						}
						log(LOG_DEBUG, "loaded " + hash.partials.length + " partials");
					}
					catch (ex) {
						log(LOG_ERROR, "Failed to parse pieces", ex);
						hash = new DTA.HashCollection(hash.full);
					}
				}
			}
			let desc = this.getSingle(file, 'description');
			if (!desc) {
				desc = this.getSingle(root, 'description');
			}

			downloads.push({
				'url': new UrlManager(urls),
				'fileName': fileName,
				'referrer': referrer ? referrer : null,
				'numIstance': num,
				'title': '',
				'description': desc,
				'startDate': startDate,
				'hashCollection': hash,
				'license': this.getLinkRes(file, "license"),
				'publisher': this.getLinkRes(file, "publisher"),
				'identity': this.getSingle(file, 'identity'),
				'copyright': this.getSingle(file, 'copyright'),
				'size': size,
				'version': this.getSingle(file, 'version'),
				'logo': this.checkURL(this.getSingle(file, 'logo', ['data'])),
				'lang': this.getSingle(file, 'language'),
				'sys': this.getSingle(file, 'os'),
				'mirrors': urls.length,
				'selected': true,
				'fromMetalink': true
			});
		}

		if (!downloads.length) {
			throw new Exception("No valid files to process");
		}
		let info = {
			'identity': this.getSingle(root, 'identity'),
			'description': this.getSingle(root, 'description'),
			'logo': this.checkURL(this.getSingle(root, 'logo', ['data'])),
			'license': this.getLinkRes(root, "license"),
			'publisher': this.getLinkRes(root, "publisher"),
			'start': false
		};
		return new Metalink(downloads, info, "Metalinker Version 3.0");
	}
};

/**
 * Metalink RFC5854 (IETF) Parser
 * @param doc document to parse
 * @return Metalink
 */
function MetalinkerRFC5854(doc) {
	let root = doc.documentElement;
	if (root.nodeName !== 'metalink' || root.namespaceURI !== NS_METALINK_RFC5854 ) {
		if (log.enabled) {
			log(LOG_DEBUG, root.nodeName + "\nns:" + root.namespaceURI);
		}
		throw new Exception('mlinvalid');
	}
	Base.call(this, doc, NS_METALINK_RFC5854);
}
MetalinkerRFC5854.prototype = {
	__proto__: Base.prototype,
	parse: function ML4_parse(aReferrer) {
		if (aReferrer && 'spec' in aReferrer) {
			aReferrer = aReferrer.spec;
		}

		let doc = this._doc;
		let root = doc.documentElement;
		let downloads = [];

		let files = this.getNodes(doc, '/ml:metalink/ml:file');
		if (!files.length) {
			throw new Exception("No valid file nodes");
		}
		for (let file of files) {
			let fileName = file.getAttribute('name');
			if (!fileName) {
				throw new Exception("LocalFile name not provided!");
			}
			let referrer = null;
			if (file.hasAttributeNS(NS_DTA, 'referrer')) {
				referrer = file.getAttributeNS(NS_DTA, 'referrer');
			}
			else {
				referrer = aReferrer;
			}
			let num = null;
			if (file.hasAttributeNS(NS_DTA, 'num')) {
				try {
					num = parseInt(file.getAttributeNS(NS_DTA, 'num'), 10);
				}
				catch (ex) {
					/* no-op */
				}
			}
			if (!num) {
				num = DTA.currentSeries();
			}
			let startDate = new Date();
			if (file.hasAttributeNS(NS_DTA, 'startDate')) {
				try {
					startDate = new Date(parseInt(file.getAttributeNS(NS_DTA, 'startDate'), 10));
				}
				catch (ex) {
					/* no-op */
				}
			}

			let urls = [];
			let urlNodes = this.getNodes(file, 'ml:url');
			for (var url of urlNodes) {
				let preference = 1;
				let charset = doc.characterSet;
				if (url.hasAttributeNS(NS_DTA, 'charset')) {
					charset = url.getAttributeNS(NS_DTA, 'charset');
				}

				let uri = null;
				try {
					uri = this.checkURL(url.textContent.trim());
					if (!uri) {
						throw new Exception("Invalid url");
					}
					uri = Services.io.newURI(uri, charset, null);
				}
				catch (ex) {
					log(LOG_ERROR, "Failed to parse URL" + url.textContent, ex);
					continue;
				}

				if (url.hasAttribute('priority')) {
					let a = parseInt(url.getAttribute('priority'), 10);
					if (a > 0) {
						preference = a;
					}
				}
				if (url.hasAttribute('location')) {
					let a = url.getAttribute('location').slice(0,2).toLowerCase();
					if (~LOCALE.indexOf(a)) {
						preference = Math.max(preference / 4, 1);
					}
				}
				urls.push(new DTA.URL(uri, preference));
			}
			if (!urls.length) {
				continue;
			}
			normalizeMetaPrefs(urls);

			let size = this.getSingle(file, 'size');
			size = parseInt(size, 10);
			if (!isFinite(size)) {
				size = 0;
			}

			let hash = null;
			for (let h of this.getNodes(file, 'ml:hash')) {
				try {
					h = new DTA.Hash(h.textContent.trim(), h.getAttribute('type'));
					if (!hash || hash.q < h.q) {
						hash = h;
					}
				}
				catch (ex) {
					log(LOG_ERROR, "Failed to parse hash: " + h.textContent.trim() + "/" + h.getAttribute('type'), ex);
				}
			}
			if (hash) {
				hash = new DTA.HashCollection(hash);
				let pieces = this.getNodes(file, 'ml:pieces');
				if (pieces.length) {
					pieces = pieces[0];
					let type = pieces.getAttribute('type').trim();
					try {
						hash.parLength = parseInt(pieces.getAttribute('length'), 10);
						if (!isFinite(hash.parLength) || hash.parLength < 1) {
							throw new Exception("Invalid pieces length");
						}
						for (let piece of this.getNodes(pieces, 'ml:hash')) {
							try {
								hash.add(new DTA.Hash(piece.textContent.trim(), type));
							}
							catch (ex) {
								log(LOG_ERROR, "Failed to parse piece", ex);
								throw ex;
							}
						}
						if (size && hash.parLength * hash.partials.length < size) {
							throw new Exception("too few partials");
						}
						else if(size && (hash.partials.length - 1) * hash.parLength > size) {
							throw new Exception("too many partials");
						}
						log(LOG_DEBUG, "loaded " + hash.partials.length + " partials");
					}
					catch (ex) {
						log(LOG_ERROR, "Failed to parse pieces", ex);
						hash = new DTA.HashCollection(hash.full);
					}
				}
			}

			let desc = this.getSingle(file, 'description');
			if (!desc) {
				desc = this.getSingle(root, 'description');
			}
			downloads.push({
				'url': new UrlManager(urls),
				'fileName': fileName,
				'referrer': referrer ? referrer : null,
				'numIstance': num,
				'title': '',
				'description': desc,
				'startDate': startDate,
				'hashCollection': hash,
				'license': this.getLinkRes(file, "license"),
				'publisher': this.getLinkRes(file, "publisher"),
				'identity': this.getSingle(file, "identity"),
				'copyright': this.getSingle(file, "copyright"),
				'size': size,
				'version': this.getSingle(file, "version"),
				'logo': this.checkURL(this.getSingle(file, "logo", ['data'])),
				'lang': this.getSingle(file, "language"),
				'sys': this.getSingle(file, "os"),
				'mirrors': urls.length,
				'selected': true,
				'fromMetalink': true
			});
		}

		if (!downloads.length) {
			throw new Exception("No valid files to process");
		}

		let info = {
			'identity': this.getSingle(root, "identity"),
			'description': this.getSingle(root, "description"),
			'logo': this.checkURL(this.getSingle(root, "logo", ['data'])),
			'license': this.getLinkRes(root, "license"),
			'publisher': this.getLinkRes(root, "publisher"),
			'start': false
		};
		return new Metalink(downloads, info, "Metalinker Version 4.0 (RFC5854/IETF)");
	}
};

const __parsers__ = [
	Metalinker3,
	MetalinkerRFC5854
];

/**
 * Parse a metalink
 * @param aURI (nsIURI) Metalink URI
 * @param aReferrer (String) Optional. Referrer
 * @param aCallback (Function) Receiving callback function of form f(result, exception || null)
 * @return async (Metalink) Parsed metalink data
 */
function parse(aURI, aReferrer, aCallback) {
	let xhrLoad, xhrError;
	let xhr = new Instances.XHR();
	xhr.open("GET", aURI.spec);
	log(LOG_DEBUG, "parsing metalink at " + aURI.spec);
	xhr.overrideMimeType("application/xml");
	xhr.addEventListener("loadend", function xhrLoadend() {
		xhr.removeEventListener("loadend", xhrLoadend, false);
		try {
			let doc = xhr.responseXML;
			if (doc.documentElement.nodeName === 'parsererror') {
				throw new Exception("Failed to parse XML");
			}
			for (let Parser of __parsers__) {
				let parser;
				try {
					parser = new Parser(doc);
				}
				catch (ex) {
					log(LOG_DEBUG, Parser.name + " failed", ex);
					continue;
				}
				aCallback(parser.parse(aReferrer));
				return;
			}
			throw new Exception("no suitable parser found!");
		}
		catch (ex) {
			log(LOG_ERROR, "Failed to parse metalink", ex);
			aCallback(null, ex);
		}
	}, false);
	xhr.send();
}

Object.defineProperties(exports, {
	"parse": {value: parse, enumerable: true},
	"Metalink": {value: Metalink, enumerable: true},
	"NS_DTA": {value: NS_DTA, enumerable: true},
	"NS_HTML": {value: NS_HTML, enumerable: true},
	"NS_METALINKER3": {value: NS_METALINKER3, enumerable: true},
	"NS_METALINK_RFC5854": {value: NS_METALINK_RFC5854, enumerable: true}
});
Object.freeze(exports);
