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
 * The Original Code is DownThemAll API loader module.
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

/*
 * This is a compat layer, that will likely change or will be completely removed!
 * Please use api.jsm directly
 */

var EXPORTED_SYMBOLS = ['inject'];

function inject(window) {
	window.__defineGetter__('DTA', function(){
		delete this.DTA;
		let DTA = {
			showPreferences: function(pane) this.Mediator.showPreferences(window, pane)
		};
		Components.utils.import("resource://dta/api.jsm", DTA);
		return (window.DTA = DTA);
	});
	
	/* Compat; mostly FlashGot, maybe others */
	// Obsolete; will be removed in 2.++ timeframe
	window.__defineGetter__('DTA_AddingFunctions', function() {
		let rv = {
			get ios() {
				return DTA.IOService
			},
			composeURL: function() DTA.composeURL.apply(this, arguments),
			applyWithWindow: function(func, args) {
				DTA.Debug.logString("Obsolete function called: " + func.name);
				args.unshift(window);
				return func.apply(DTA, args);
			},
			saveSingleLink: function() this.applyWithWindow(DTA.saveSingleLink, Array.map(arguments, function(e) e)),
			saveLinkArray: function() {
				let args = Array.map(arguments, function(e) e);
				let turbo = args.shift();
				if (turbo) {
					this.applyWithWindow(DTA.turboSaveLinkArray, args);
				}
				else {
					this.applyWithWindow(DTA.saveLinkArray, args);
				}
			},
			turboSaveLinkArray: function() this.applyWithWindow(DTA.turboSaveLinkArray, Array.map(arguments, function(e) e)),
			sendToDown: function() this.applyWithWindow(DTA.sendToDown, Array.map(arguments, function(e) e)),
			turboSendToDown: function() this.applyWithWindow(DTA.turboSendToDown, Array.map(arguments, function(e) e))
		};
		delete window.DTA_AddingFunctions;
		return (window.DTA_AddingFunctions = rv);
	});
	window.__defineGetter__('DTA_getLinkPrintMetalink', function() this.DTA.getLinkPrintMetalink);
	window.__defineGetter__('DTA_URL', function() this.DTA.URL);
};