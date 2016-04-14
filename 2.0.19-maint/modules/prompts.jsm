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
 * The Original Code is DownThemAll Confirm wrappers module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007;2008
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

var EXPORTED_SYMBOLS = ['confirm', 'confirmOC', 'confirmYN', 'alert'];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;

Cu.import("resource://dta/utils.jsm")

// unpack the default button types
for (let x in Components.interfaces.nsIPromptService) {
	let r = new String(x).match(/BUTTON_TITLE_(\w+)$/);
	if (r) {
		this[r[1]] = Components.interfaces.nsIPromptService[x];
		EXPORTED_SYMBOLS.push(r[1]);
	}
}

ServiceGetter(this, "prompts", "@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");

/**
 * wrapper around confirmEx
 * @param title. Dialog title
 * @param text. Dialog text
 * @param button0. Either null (omit), one of CANCEL/NO/... or a string
 * @param button1. s.a.
 * @param button2. s.a.
 * @param default. Index of the Default button
 * @param check. either null, a boolean, or string specifying the prefs id.
 * @param checkText. The text for the checkbox
 * @return Either the button# or {button: #, checked: bool} if check was a boolean
 * @author Nils
 */
function confirm(aWindow, aTitle, aText, aButton0, aButton1, aButton2, aDefault, aCheck, aCheckText) {
	// Set up the flags/buttons
	let flags = 0;
	[aButton0, aButton1, aButton2].forEach(
		function(button, idx) {
			if (typeof button == 'number') {
				flags += prompts['BUTTON_POS_' + idx] * button;
				button = null;
			}
			else if (typeof button == 'string' || button instanceof String) {
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
	
	// Checkmark requested?
	let rv = null;
	let check = {};
	if (aCheckText) {
		if (typeof(aCheck) == 'boolean') {
			rv = {};
			check.value = aCheck;
		}
		else if (typeof(aCheck) == 'string' || aCheck instanceof String) {
			check.value = undefined;
			try {
				check.value = Cc['@mozilla.org/preferences-service;1']
					.getService(Ci.nsIPrefBranch)
					.getBoolPref(aCheck);
			}
			catch (ex) {
				// no-op				
			}
			if (check.value == undefined) {
				check.value = false;
			}
		}
	}
	
	let cr = prompts.confirmEx(
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
	
	// We've got a checkmark request
	if (rv) {
		rv.checked = check.value;
		rv.button = cr;
		return rv;
	}
	
	// Just return as usual
	return cr;
}

/**
 * Shortcut for OK/Cancel Confirmation dialogs
 * @author Nils
 */
function confirmOC(aWindow, aTitle, aText) {
	return confirm(aWindow, aTitle, aText, OK, CANCEL);
}

/**
 * Shortcut for Yes/No Confirmation dialogs
 * @author Nils
 */
function confirmYN(aWindow, aTitle, aText) {
	return confirm(aWindow, aTitle, aText, YES, NO);
}

/**
 * wrapper around alert
 * @author Nils
 */
function alert(aWindow, aTitle, aText) {
	prompts.alert(aWindow, aTitle, aText);
}