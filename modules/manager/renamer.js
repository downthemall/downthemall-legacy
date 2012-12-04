/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {formatNumber} = require("utils");
const {
	replaceSlashes,
	getUsableFileNameWithFlatten
} = require("support/stringfuncs");

const expr = /\*\w+\*/gi;

const Renamer = {
	get name() this._o.fileNameAndExtension.name,
	get ext() this._o.fileNameAndExtension.extension,
	get text() replaceSlashes(this._o.description, " ").trim(),
	get flattext() getUsableFileNameWithFlatten(this._o.description),
	get title() this._o.title.trim(),
	get flattitle() getUsableFileNameWithFlatten(this._o.title),
	get url() this._o.urlManager.host,
	get domain() this._o.urlManager.domain,
	get subdirs() this._o.maskURLPath,
	get flatsubdirs() getUsableFileNameWithFlatten(this._o.maskURLPath),
	get refer() this._o.referrer ? this._o.referrer.host.toString() : '',
	get qstring() this._o.maskURL.query || '',
	get curl() this._o.maskCURL,
	get flatcurl() getUsableFileNameWithFlatten(this._o.maskCURL),
	get num() formatNumber(this._o.bNum),
	get inum() formatNumber(this._o.iNum),
	get hh() formatNumber(this._o.startDate.getHours(), 2),
	get mm() formatNumber(this._o.startDate.getMinutes(), 2),
	get ss() formatNumber(this._o.startDate.getSeconds(), 2),
	get d() formatNumber(this._o.startDate.getDate(), 2),
	get m() formatNumber(this._o.startDate.getMonth() + 1, 2),
	get y() this._o.startDate.getFullYear().toString()
};

Object.defineProperty(exports, "createRenamer", {
	value: function createRenamer(o) {
		const replacements = Object.create(Renamer, {"_o": {value: o}});
		const replace = function replace(type) {
			const t = type.substr(1, type.length - 2);
			return (t in replacements) ? replacements[t] : type;
		};
		return function replacer(mask) {
			return mask.replace(expr, replace);
		};
	},
	enumerable: true
});
