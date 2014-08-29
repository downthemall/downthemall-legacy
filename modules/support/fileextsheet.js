/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const {Atoms} = require("./atoms");
const Timers = new (require("./timers").TimerManager)();
const {getIcon} = require("./icons");
const {getExtension} = require("./stringfuncs");

function FileExtensionSheet(window) {
	this.hidpi = window.matchMedia && window.matchMedia("(min-resolution: 2dppx)").matches;
	this._windowUtils = window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);

	let document = window.document;
	this._stylesheet = null;
	try {
		for (let i = document.styleSheets.length; ~--i;) {
			let ss = document.styleSheets.item(i);
			if (/^chrome:\/\/dta\//.test(ss.href)) {
				this._stylesheet = ss;
				log(LOG_DEBUG, "found stylesheet " + ss.href + ", rules: " + ss.cssRules.length);
				break;
			}
		}
		if (!this._stylesheet) {
			throw new Exception("didn't find stylesheet");
		}
	}
	catch (ex) {
		log(LOG_ERROR, "sheet:", ex);
		throw ex;
	}
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
		let entry = this._entries.get(ext);
		if (!entry) {
			entry = this._atoms.getAtom("FileIcon" + ext.replace(/\W/g, ''));
			let rule = 'treechildren::-moz-tree-image(iconic,' +
				entry.toString() +
				') { list-style-image: url(' +
				getIcon('file.' + ext, metalink || ext === 'metalink' || ext === "meta4", this.hidpi ? 32 : 16) +
				') !important; }';
			this._stylesheet.insertRule(rule, this._stylesheet.cssRules.length);
			log(LOG_DEBUG, "sheet: " + rule);
			if (!this._timer) {
				// this is a moz-2 hack, as it will otherwise not correctly redraw!
				this._timer = Timers.createOneshot(0, this._updateSheet, this);
			}
			this._entries.set(ext, entry);
		}
		return entry;
	},
	_updateSheet: function() {
		delete this._timer;
		this._windowUtils.redraw();
	}
});

exports.FileExtensionSheet = Object.freeze(FileExtensionSheet);
