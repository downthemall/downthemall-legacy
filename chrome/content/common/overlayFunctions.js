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
 * The Original Code is DownThemAll.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *   Federico Parodi <jimmy2k@gmail.com>
 *   Stefano Verna <stefano.verna@gmail.com>
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

const DTA = {};
Components.utils.import("resource://dta/api.jsm", DTA);

function DTA_showPreferences() {
	var instantApply = DTA.Preferences.get("browser.preferences.instantApply", false);
	window.openDialog(
		'chrome://dta/content/preferences/prefs.xul',
		'dtaPrefs',
		'chrome,titlebar,toolbar,resizable,centerscreen'+ (instantApply ? ',dialog=no' : '')
	);
}

function DTA_DropProcessor(func, multiple) {
	this.func = func;
	if (multiple) {
		this.canHandleMultipleItems = true;
	}
};
DTA_DropProcessor.prototype = {
	getSupportedFlavours: function() {
		if (!this._flavors) {
			this._flavors = new FlavourSet();
			this._flavors.appendFlavour('text/x-moz-url');
		}	
		return this._flavors;
	},
	onDragOver: function() {},
	onDrop: function (evt, dropdata, session) {
		if (!dropdata) {
			return;
		}
		let url = null;
		try {
			url = transferUtils.retrieveURLFromData(dropdata.data, dropdata.flavour.contentType);
			if (!DTA.isLinkOpenable(url)) {
				throw new Components.Exception("Link cannot be opened!");
			}
			url = DTA.IOService.newURI(url, null, null);
		}
		catch (ex) {
			DTA.Debug.log("Failed to process drop", ex);
			return;
		}
		let doc = document.commandDispatcher.focusedWindow.document;
		let ref = doc ? DTA.getRef(doc) : null;		
		
		if (url) {
			url = new DTA.URL(DTA.getLinkPrintMetalink(url) || url);
			this.func(url, ref);			
		}
	}
};

var DTA_DropTDTA = new DTA_DropProcessor(function(url, ref) { DTA.saveSingleLink(window, true, url, ref); });
var DTA_DropDTA = new DTA_DropProcessor(function(url, ref) { DTA.saveSingleLink(window, false, url, ref); });

this.__defineGetter__('DTA_Mediator', function() {
	delete this.DTA_Mediator;
	this.DTA_Mediator = {
		open: function DTA_Mediator_open(url, ref) {
			this.openUrl(window, url, ref);
		}
	};
	Components.utils.import('resource://dta/mediator.jsm', this.DTA_Mediator);
	return this.DTA_Mediator;
});

/* DownloadHelper */
const DTA_DownloadHelper = {};
Components.utils.import("resource://dta/downloadHelper.jsm", DTA_DownloadHelper);

/* Compat; mostly FlashGot, maybe others */
// Obsolete; will be removed in 2.++ timeframe
const DTA_AddingFunctions = {
	ios: DTA.IOService,
	composeURL: function() DTA.composeURL.apply(this, arguments),
	applyWithWindow: function(func, args) {
		DTA.Debug.logString("Obsolete function called: " + func.name);
		let args = Array.map(args, function(e) e);
		args[0] = window;
		return func.apply(DTA, args);
	},
	saveSingleLink: function() this.applyWithWindow(DTA.saveSingleLink, arguments),
	saveLinkArray: function() this.applyWithWindow(DTA.saveLinkArray, arguments),
	turboSaveLinkArray: function() this.applyWithWindow(DTA.turboSaveLinkArray, arguments),
	sendToDown: function() this.applyWithWindow(DTA.sendToDown, arguments),
	turboSendToDown: function() this.applyWithWindow(DTA.turboSendToDown, arguments)
};
const DTA_getLinkPrintMetalink = DTA.getLinkPrintMetalink;
const DTA_URL = DTA.URL;