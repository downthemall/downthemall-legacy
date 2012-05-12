/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const {Atoms} = require("support/atoms");
const Timers = new (require("support/timers").TimerManager)();
const {getIcon} = require("support/icons");
const {getExtension} = require("support/stringfuncs");
const {Logger} = requireJSM("resource://dta/utils.jsm");

function FileExtensionSheet(window) {
	this._windowUtils = window.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);

	let document = window.document;
	this._stylesheet = null;
	try {
		for each (let ss in document.styleSheets) {
			if (/^chrome:\/\/dta\//.test(ss.href)) {
				this._stylesheet = ss;
				if (Logger.enabled) {
					Logger.log("found stylesheet " + ss.href + ", rules: " + ss.cssRules.length);
				}
				break;
			}
		}
		if (!this._stylesheet) {
			throw new Exception("didn't find stylesheet");
		}
	}
	catch (ex) {
		if (Logger.enabled) {
			Logger.log("sheet:", ex);
		}
	}
	this._entries = {};
}

FileExtensionSheet.prototype = {
	_atoms: new Atoms(),
	getAtom: function FES_getAtom(fileName, metalink) {
		let ext = getExtension(fileName);
		if (!ext) {
			ext = 'unknown';
		}
		if (metalink) {
			ext = 'metalink';
		}
		let key = 'ext:' + ext;
		let entry = this._entries[key];
		if (!entry) {
			entry = this._atoms.getAtom("FileIcon" + ext.replace(/\W/g, ''));
			let rule = 'treechildren::-moz-tree-image(iconic,'
				+ entry.toString()
				+ ') { list-style-image: url('
				+ getIcon('file.' + ext, metalink || ext == 'metalink' || ext == "meta4")
				+ ') !important; }';
			this._stylesheet.insertRule(rule, this._stylesheet.cssRules.length);
			if (Logger.enabled) {
				Logger.log("sheet: " + rule);
			}
			if (!this._timer) {
				// this is a moz-2 hack, as it will otherwise not correctly redraw!
				this._timer = Timers.createOneshot(0, this._updateSheet, this);
			}
			this._entries[key] = entry;
		}
		return entry;
	},
	_updateSheet: function FES__updateSheet() {
		delete this._timer;
		this._windowUtils.redraw();
	}
};

exports.FileExtensionSheet = FileExtensionSheet;
