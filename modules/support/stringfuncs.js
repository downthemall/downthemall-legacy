/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {memoize} = require("./memoize");

const rbc_u = /[\n\r\v?:<>*|"]/g;
const rbc_w = /%(?:25)?20/g;
const rsl_r = /[\/\\]/g;
const gufn_u = /\?.*$/;

const SYSTEMSLASH = (function() {
	let f = Services.dirsvc.get("TmpD", Ci.nsIFile);
	f.append('dummy');
	return (f.path.indexOf('/') !== -1) ? '/' : '\\';
})();
exports.SYSTEMSLASH = SYSTEMSLASH;

const {getExt} = require("preferences");

exports.getCURL = function getCURL(u) {
	let rv = u.host;
	if (u instanceof Ci.nsIURL) {
		let fp = u.filePath;
		if (fp !== "/") {
			rv += fp;
		}
	}
	return rv;
};

exports.removeBadChars = function removeBadChars(str) {
	return str.replace(rbc_u, '_').replace(rbc_w, ' ');
};

exports.addFinalSlash = function addFinalSlash(str) {
	if (!str) {
		return SYSTEMSLASH;
	}
	if (str.charAt(str.length - 1) !== SYSTEMSLASH) {
		return str + SYSTEMSLASH;
	}
	return str;
};

exports.removeFinalChar = function removeFinalChar(str, c) {
	if (!str) {
		return str;
	}
	if (str.charAt(str.length - 1) === c) {
		return str.substr(0, str.length - 1);
	}
	return str;
};

exports.removeLeadingChar = function removeLeadingChar(str, c) {
	if (!str) {
		return str;
	}
	if (str.charAt(0) === c) {
		return str.substr(1);
	}
	return str;
};

exports.removeFinalSlash = function removeFinalSlash(str) {
	return exports.removeFinalChar(str, SYSTEMSLASH);
};

exports.replaceSlashes = function replaceSlashes(str, replaceWith) {
	return str.replace(rsl_r, replaceWith);
};

exports.normalizeSlashes = function normalizeSlashes(str) {
	return exports.replaceSlashes(str, SYSTEMSLASH);
};

exports.removeLeadingSlash = function removeLeadingSlash(str) {
	return exports.removeLeadingChar(str, SYSTEMSLASH);
};

exports.getUsablePath = function getUsablePath(str) {
	let i = str.indexOf("?");
	return exports.removeBadChars(exports.normalizeSlashes(~i ? str.substr(0, i) : str)).trim();
};

exports.getUsableFileName = function getUsableFileName(str) {
	let i = str.indexOf("?");
	let t = exports.normalizeSlashes(~i ? str.substr(0, i) : str).trim();
	t = exports.removeFinalSlash(t);
	i = t.lastIndexOf(SYSTEMSLASH);
	return exports.removeBadChars(~i ? t.substr(i + 1) : t).trim();
};

exports.getUsableFileNameWithFlatten = function getUsableFileNameWithFlatten(str) {
	return exports.getUsableFileName(exports.replaceSlashes(str, getExt('flatReplacementChar', '-')));
};

exports.getExtension = function(str) {
	let n = exports.getUsableFileName(str);
	let c = n.lastIndexOf('.');
	return (c === - 1) ? null : n.substr(c + 1);
};

exports.getFileNameAndExt = function getFileNameAndExt(str) {
	let n = exports.getUsableFileName(str);
	let c = n.lastIndexOf('.');
	if (!~c) {
		return [n, ""];
	}
	return [n.substr(0, c), n.substr(c + 1)];
};

exports.cropCenter = function(str, newLength) {
	const length = str.length;
	const max = newLength / 2;
	if (length > newLength) {
		return str.substr(0, max) + "..." + str.substr(length - max);
	}
	return str;
};

exports.symbolize = function(value) {
	return typeof(value) === "symbol" ? value : Symbol.for(value);
};

function toURI(str, charset, baseURI) {
	return Services.io.newURI(str, charset, baseURI);
}
exports.toURI = memoize(toURI, 1000);

exports.toURL = memoize(function toURL(str, charset, baseURI) {
	return toURI(str, charset, baseURI).QueryInterface(Ci.nsIURL);
}, 1000);

Object.freeze(exports);
