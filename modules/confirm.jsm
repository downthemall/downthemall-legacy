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
 *   Federico Parodi <f.parodi@tiscali.it>
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

var EXPORTED_SYMBOLS = ['DTA_confirm', 'DTA_confirmOC', 'DTA_confirmYN', 'DTA_alert'];

/**
 * wrapper around confirmEx
 * @param title. Dialog title
 * @param text. Dialog text
 * @param button0. Either null (omit), one of DTA_confirm.X or a string
 * @param button1. s.a.
 * @param button2. s.a.
 * @param default. Index of the Default button
 * @param check. either null, a boolean, or string specifying the prefs id.
 * @param checkText. The text for the checkbox
 * @return Either the button# or {button: #, checked: bool} if check was a boolean
 * @author Nils
 */
function DTA_confirm(aWindow, aTitle, aText, aButton0, aButton1, aButton2, aDefault, aCheck, aCheckText) {
	var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
		.getService(Components.interfaces.nsIPromptService);
	var flags = 0;
	[aButton0, aButton1, aButton2].forEach(
		function(button, idx) {
			if (typeof(button) == "number") {
				flags += prompts['BUTTON_POS_' + idx] * button;
				button = null;
			}
			else if (typeof(button) == "string" || button instanceof String) {
				flags |= prompts['BUTTON_POS_' + idx] * prompts.BUTTON_TITLE_IS_STRING;
			}
			else {
				button = 0;
			}
		},
		this
	);
	if (aDefault == 1) {
		flags += prompts.BUTTON_POS_1_DEFAULT;
	}
	else if (aDefault == 2) {
		flags += prompts.BUTTON_POS_2_DEFAULT;
	}
	var check = {};
	if (aCheckText) {
		if (typeof(aCheck) == 'boolean') {
			var rv = {};
			check.value = aCheck;
		}
		else if (typeof(aCheck) == 'string' || aCheck instanceof String) {
			check.value = DTA_preferences.getDTA(aCheck, false);
		}
	}
	var cr = prompts.confirmEx(
		aWindow,
		aTitle,
		aText,
		flags,
		aButton0,
		aButton1,
		aButton2,
		aCheckText,
		check
	);
	if (rv) {
		rv.checked = check.value;
		rv.button = cr;
		return rv;
	}
	return cr;
}
DTA_confirm.init = function() {
	for (x in Components.interfaces.nsIPromptService) {
		var r = new String(x).match(/BUTTON_TITLE_(\w+)$/);
		if (r) {
			DTA_confirm[r[1]] = Components.interfaces.nsIPromptService[x];
		}
	}
}
DTA_confirm.init();
function DTA_confirmOC(title, text) {
	return DTA_confirm(title, text, DTA_confirm.OK, DTA_confirm.CANCEL);
}
function DTA_confirmYN(title, text) {
	return DTA_confirm(title, text, DTA_confirm.YES, DTA_confirm.NO);
}
function DTA_alert(aWindow, aTitle, aText) {
	Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
		.getService(Components.interfaces.nsIPromptService)
		.alert(aWindow, aTitle, aText);
}