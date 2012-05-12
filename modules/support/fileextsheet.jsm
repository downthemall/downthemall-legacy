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
 * The Original Code is DownThemAll FileExtensionSheet (CSS) module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2010
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

const EXPORTED_SYMBOLS = ['FileExtensionSheet'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

module("resource://dta/glue.jsm");
const {Atoms} = glue2.require("support/atoms");
module("resource://dta/utils.jsm");
module("resource://dta/support/icons.jsm");
module("resource://dta/support/timers.jsm");

const Timers = new TimerManager();

extendString(String);

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
		let ext = fileName.getExtension();
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
