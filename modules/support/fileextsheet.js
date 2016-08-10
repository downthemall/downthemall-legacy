/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const {Atoms} = require("./atoms");
const Timers = new (require("./timers").TimerManager)();
const {getIcon} = require("./icons");
const {getExtension} = require("./stringfuncs");
const {identity} = require("./memoize");

function FileExtensionSheet(window, tree) {
	this._tree = tree;
	this._windowUtils = window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);
	this._entries = new Map();
	this._toadd = [];
}

FileExtensionSheet.prototype = Object.freeze({
	_atoms: new Atoms(),
	getAtom: function(fileName, metalink, invalidate) {
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
			let rule = `
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
			this._toadd.push(rule);
			if (!this._timer) {
				this._timer = Timers.createOneshot(0, this._add, this);
			}
			this._entries.set(ext, entry);
		}
		return this._atoms.getAtom(entry);
	},
	_add: function() {
		this._timer = null;
		if (!this._toadd.length) {
			return;
		}
		try {
			let rule = `data:text/css,@namespace url("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul");\n${this._toadd.join("\n")}`;
			log(LOG_DEBUG, "new sheet: " + rule);
			this._windowUtils.loadSheetUsingURIString(rule, this._windowUtils.AGENT_SHEET);
			this._tree.invalidate();
		}
		catch (ex) {
			log(LOG_ERROR, ext + " sheet: " + rule, ex);
		}
		this._toadd = [];
	}
});

exports.FileExtensionSheet = Object.freeze(FileExtensionSheet);
