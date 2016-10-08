/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const XRegExp = require("thirdparty/xregexp");

// Link matcher
const regLinks = new XRegExp(
	"\\b(?:(?:h(?:x+|tt)?ps?|f(?:x+|t)p):\\/\\/|www\\d?\\.)[\\d\\w.-]+\\.?(?:\\/[\\p{N}\\p{L}\\pP\\pS]*)?",
	"giu");
// Match more exactly or more than 3 dots. Links are then assumed "cropped" and will be ignored.
const regShortened = /\.{3,}/;
// http cleanup
const regHttp = /^h(?:x+|tt)?p(s?)/i;
// ftp cleanup
const regFtp = /^f(?:x+|t)p/i;
// www (sans protocol) match
const regWWW = /^www/i;
// Right-trim (sanitize) link
const regDTrim = /[<>._-]+$|#.*?$/g;

function mapper(e) {
	try {
		if (regShortened.test(e)) {
			return null;
		}
		if (regWWW.test(e)) {
			if (e.indexOf("/") < 0) {
				e = "http://" + e + "/";
			}
			else {
				e = "http://" + e;
			}

		}
		return e.replace(regHttp, "http$1")
			.replace(regFtp, "ftp")
			.replace(regDTrim, "");
	}
	catch (ex) {
		return null;
	}
}

/**
 * Minimal Link representation (partially) implementing DOMElement
 *
 * @param url (string) URL (href) of the Links
 * @param title (string) Optional. Title/description
 * @see DOMElement
 */
class FakeLink {
	constructor (url, title) {
		this.src = this.href = url;
		if (!!title) {
			this.title = title;
		}
	}
	hasAttribute(attr) {
		return (attr in this);
	}
	getAttribute(attr) {
		return (attr in this) ? this[attr] : null;
	}
	toString() {
		return this.href;
	}
}
FakeLink.prototype.childNodes = Object.freeze([]);

/**
 * Parses a text looking for any URLs with supported protocols
 *
 * @param text (string) Text to parse
 * @param fakeLinks (boolean) Whether an array of plain text links will be returned or an array of FakeLinks
 * @return (array) results
 */
function getTextLinks(text, fakeLinks) {
	let rv = text.match(regLinks);
	if (!rv) {
		return [];
	}
	let i, k, e;
	for (i = 0, k = 0, e = rv.length; i < e; i++) {
		let a = mapper(rv[i]);
		if (a) {
			rv[k] = fakeLinks ? new FakeLink(a) : a;
			k += 1;
		}
	}
	rv.length = k; // truncate
	return rv;
}

exports.getTextLinks = getTextLinks;
exports.FakeLink = Object.freeze(FakeLink);
Object.freeze(exports);
