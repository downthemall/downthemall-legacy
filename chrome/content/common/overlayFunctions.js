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

__defineGetter__('DTA', function(){
	delete this.DTA;
	let DTA = {
		showPreferences: function () {
			var instantApply = DTA.Preferences.get("browser.preferences.instantApply", false);
			window.openDialog(
				'chrome://dta/content/preferences/prefs.xul',
				'dtaPrefs',
				'chrome,titlebar,toolbar,resizable,centerscreen'+ (instantApply ? ',dialog=no' : '')
			);
		}
	};
	Components.utils.import("resource://dta/api.jsm", DTA);
	
	DTA.__defineGetter__('Mediator', function() {
		delete DTA.Mediator;
		DTA.Mediator = {
			open: function DTA_Mediator_open(url, ref) {
				this.openUrl(window, url, ref);
			}
		};
		Components.utils.import('resource://dta/support/mediator.jsm', DTA.Mediator);
		return DTA.Mediator;
	});
	return (this.DTA = DTA);
});

/* Compat; mostly FlashGot, maybe others */
// Obsolete; will be removed in 2.++ timeframe
__defineGetter__('DTA_AddingFunctions', function() {
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
 	delete this.DTA_AddingFunctions;
 	return (this.DTA_AddingFunctions = rv);
});
__defineGetter__('DTA_getLinkPrintMetalink', function() DTA.getLinkPrintMetalink);
__defineGetter__('DTA_URL', function() DTA.URL);