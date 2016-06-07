/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const {Atoms} = require("./atoms");
const Timers = new (require("./timers").TimerManager)();
const {getIcon} = require("./icons");
const {getExtension} = require("./stringfuncs");
const {identity} = require("./memoize");

function FileExtensionSheet(window) {
	this._windowUtils = window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);
	this._entries = new Map();
}

FileExtensionSheet.prototype = Object.freeze({
	_atoms: new Atoms(),
	getAtom: function(fileName, metalink) {
		let ext = getExtension(fileName);
		if (!ext || ext.length > 10 || ext.indexOf(" ") > -1) {
			ext = 'unknown';
		}
		if (metalink) {
			ext = 'metalink';
		}
		ext = identity(ext);
		let entry = this._entries.get(ext);
		if (!entry) {
			entry = "FileIcon" + ext.replace(/\W/g, '');
			let icon16 = getIcon('file.' + ext, metalink || ext === 'metalink' || ext === "meta4", 16);
			let icon32 = getIcon('file.' + ext, metalink || ext === 'metalink' || ext === "meta4", 32);
			let rule = `data:text/css,
treechildren::-moz-tree-image(iconic,${entry.toString()}) {
	list-style-image: url(${icon16}) !important;
	-moz-image-region: auto !important;
	width: 16px !important;
}
@media (min-resolution: 2dppx) {
	treechildren::-moz-tree-image(iconic,${entry.toString()}) {
		list-style-image: url(${icon32}) !important;
	}
}`;
			let ruleURI = Services.io.newURI(rule, null, null);
			log(LOG_DEBUG, ruleURI.spec);
			try {
				this._windowUtils.loadSheet(ruleURI, this._windowUtils.AGENT_SHEET);
			}
			catch (ex) {
				log(LOG_ERROR, ext + " sheet: " + rule, ex);
			}
			this._entries.set(ext, entry);
		}
		return this._atoms.getAtom(entry);
	}
});

exports.FileExtensionSheet = Object.freeze(FileExtensionSheet);
