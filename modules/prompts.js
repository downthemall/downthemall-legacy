/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// unpack the default button types
for (let x in Ci.nsIPromptService) {
	let r = x.toString().match(/BUTTON_TITLE_(\w+)$/);
	if (r) {
		exports[r[1]] = Ci.nsIPromptService[x];
	}
}

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
exports.confirm = function confirm(aWindow, aTitle, aText, aButton0, aButton1, aButton2, aDefault, aCheck, aCheckText) {
	// Set up the flags/buttons
	let flags = 0;
	[aButton0, aButton1, aButton2].forEach(
		function(button, idx) {
			if (typeof button == 'number') {
				flags += Services.prompt['BUTTON_POS_' + idx] * button;
				button = null;
			}
			else if (typeof button == 'string' || button instanceof String) {
				flags |= Services.prompt['BUTTON_POS_' + idx] * Services.prompt.BUTTON_TITLE_IS_STRING;
			}
			else {
				button = 0;
			}
		},
		this
	);
	if (aDefault == 1) {
		flags += Services.prompt.BUTTON_POS_1_DEFAULT;
	}
	else if (aDefault == 2) {
		flags += Services.prompt.BUTTON_POS_2_DEFAULT;
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
				check.value = Services.prefs.getBoolPref(aCheck);
			}
			catch (ex) {
				// no-op
			}
			if (check.value === undefined) {
				check.value = false;
			}
		}
	}

	let cr = Services.prompt.confirmEx(
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
};

/**
 * Shortcut for OK/Cancel Confirmation dialogs
 * @author Nils
 */
exports.confirmOC = function confirmOC(aWindow, aTitle, aText) {
	return exports.confirm(aWindow, aTitle, aText, exports.OK, exports.CANCEL);
};

/**
 * Shortcut for Yes/No Confirmation dialogs
 * @author Nils
 */
exports.confirmYN = function confirmYN(aWindow, aTitle, aText) {
	return exports.confirm(aWindow, aTitle, aText, exports.YES, exports.NO);
};

/**
 * wrapper around alert
 * @author Nils
 */
exports.alert = function alert(aWindow, aTitle, aText) {
	Services.prompt.alert(aWindow, aTitle, aText);
};

Object.freeze(exports);
