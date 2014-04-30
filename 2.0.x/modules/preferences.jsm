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
 * The Original Code is DownThemAll Preferences module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2008
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

const EXPORTED_SYMBOLS = [
	'get',
	'getExt',
	'getBranch',
	'set',
	'setExt',
	'hasUserValue',
	'hasUserValueExt',
	'getChildren',
	'getChildrenExt',
	'reset',
	'resetExt',
	'resetBranch',
	'resetBranchExt',
	'resetAllExt',
	'addObserver',
	'removeObserver',
	'makeObserver'
];

// Base extension branch
// Third parties reusing this module must specify own branch!
const EXT = 'extensions.dta.';

const Cc = Components.classes;
const Ci = Components.interfaces;
const Ctor = Components.Constructor;
const log = Components.utils.reportError;

const nsIPrefBranch = Ci.nsIPrefBranch;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;

const PREF_STRING = nsIPrefBranch.PREF_STRING;
const PREF_INT = nsIPrefBranch.PREF_INT;
const PREF_BOOL = nsIPrefBranch.PREF_BOOL;

const SupportsString = new Ctor('@mozilla.org/supports-string;1', 'nsISupportsString');

const prefs = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);

/**
 * Gets a preference (based on root)
 * @param key (string) Key of the preference
 * @param defaultValue (mixed) Default value to be returned if preference does not exist 
 * @return (mixed) Value of the preference or defaultValue
 */
function get(key, defaultValue){
	try {
		let rv;
		switch (prefs.getPrefType(key)) {
			case PREF_INT:
				rv = prefs.getIntPref(key);
				break;
			case PREF_BOOL:
				rv = prefs.getBoolPref(key);
				break;
			default:
				rv = getMultiByte(key);
				break;
		}
		if (rv != undefined) {
			return rv;
		}
	} 
	catch (ex) {
		// no-op
	}
	
	return defaultValue;
}

/**
 * Gets a preference (based on extension branch)
 * @param key (string) Key of the preference
 * @param defaultValue (mixed) Default value to be returned if preference does not exist 
 * @return (mixed) Value of the preference or defaultValue
 */
function getExt(key, defaultValue) {
		return get(EXT + key, defaultValue);
}

/**
 * Gets a preference branch 
 * @param branch (string) Branch to get
 * @return (nsIPrefBranch) Requested branch 
 */
function getBranch(branch) {
	return prefs.getBranch(branch);
}

/**
 * Sets a preference (based on root)
 * @param key (string) Key of the preference to set
 * @param value (mixed) value of the preference to set
 * @throws Value-type/Preference-type mismatch
 */
function set(key, value){
	if (typeof value == 'number' || value instanceof Number) {
		return prefs.setIntPref(key, value);
	}
	if (typeof value == 'boolean' || value instanceof Boolean) {
		return prefs.setBoolPref(key, value);
	}
	return setMultiByte(key, value);
}

/**
 * Sets a preference (based on branch)
 * @param key (string) Key of the preference to set
 * @param value (mixed) value of the preference to set
 * @throws Value-type/Preference-type mismatch
 */
function setExt(key, value){
	return set(EXT + key, value);
}

// Helper: get a (multi-byte) string
function getMultiByte(key, defaultValue){
	try {
		return prefs.getComplexValue(key, Ci.nsISupportsString).data;
	} 
	catch (ex) {
		// no-op
	}
	return defaultValue;
}

//Helper: Set a (multi-byte) string
function setMultiByte(key, value) {
	let str = new SupportsString();
	str.data = value.toString();
	prefs.setComplexValue(key, Ci.nsISupportsString, str);
}

/**
 * Preference has a user provided value, i.e. not the default value (based on root)
 * @param key (string) Key of the preference to check
 * @return (boolean) Has user value
 */
function hasUserValue(key) {
	try {
		return prefs.prefHasUserValue(key);
	}
	catch (ex) {
		// no-op
	}
	return false;
}

/**
 * Preference has a user provided value, i.e. not the default value (based on branch)
 * @param key (string) Key of the preference to check
 * @return (boolean) Has user value
 */
function hasUserValueExt(key) {
	return hasUserValue(EXT + key);
}

/**
 * Enumerate all children of a preference (based on root)
 * @param key (string) Key of the preference
 * @return (array) Sub-preferences
 */
function getChildren(key) {
	return prefs.getChildList(key, {});
}

/**
 * Enumerate all children of a preference (based on branch)
 * @param key (string) Key of the preference
 * @return (array) Sub-preferences
 */
function getChildrenExt(key) {
	return getChildren(EXT + key);
}

/**
 * Resets a preference to the original value
 * @param key (string) Key of the preference
 * @return (boolean) Preference reset
 */
function reset(key) {
	try {
		return prefs.clearUserPref(key);
	}
	catch (ex) {
		// no-op
	}
	return false;
}

/**
 * Resets a preference to the original value (based on branch)
 * @param key (string) Key of the preference
 * @return (boolean) Preference reset
 */
function resetExt(key) {
	if (key.search(new RegExp('/^' + EXT + '/')) != 0) {
		key = EXT + key;
	}
	return reset(key);
}

/**
 * Resets a whole branch
 * @param branch (string) Branch to reset
 */
function resetBranch(branch) {
	try {
		prefs.resetBranch(branch);
	}
	catch (ex) {
		// BEWARE: not yet implemented in XPCOM 1.8/trunk.
		let children = prefs.getChildList(branch, {});
		for each (let key in children) {
			reset(key);
		}
	}
}
/**
 * Resets a whole branch (based on extension branch)
 * @param branch (string) Branch to reset
 */

function resetBranchExt(branch) {
	resetBranch(EXT + branch);
}

/**
 * Resets the whole extension branch (aka. restore all)
 */
function resetAllExt() {
	resetBranchExt('');
}

/**
 * Adds a preference observer
 * @param branch (string) Branch to add the preference observer for
 * @param obj (object) Preference observer. Must implement observe(). QueryInterface added as required.
 * @return
 */
function addObserver(branch, obj) {
	makeObserver(obj);
	prefs.QueryInterface(nsIPrefBranch2).addObserver(branch, obj, true);
	return function() removeObserver(branch, obj);
}

/**
 * Removes a preference observer again
 * @param branch (string) Branch to add the preference observer for
 * @param obj (object) Preference observer. Must have been added before
 */
function removeObserver(branch, obj) {
	prefs.QueryInterface(nsIPrefBranch2).removeObserver(branch, obj);
}

/**
 * Converts/encapsulates object into weak nsIObserser.
 * Object must already implement observe().
 * Object may already implement QueryInterface
 * @param obj (object) Object to convert
 */
function makeObserver(obj) {
	try {
		if (
			obj.QueryInterface(Ci.nsISupportsWeakReference)
			&& obj.QueryInterface(Ci.nsIObserver)
		) {
			return;
		}
	}
	catch (ex) {
		// fall-through
	}
	
	// Need to convert/encapsulate object
	
	// Store old QI
	let __QueryInterface = obj.QueryInterface;
	
	// Rewrite QI to support required interfaces
	obj.QueryInterface = function(iid) {
		if (
			iid.equals(Components.interfaces.nsISupports)
			|| iid.equals(Components.interfaces.nsISupportsWeakReference)
			|| iid.equals(Components.interfaces.nsIWeakReference)
			|| iid.equals(Components.interfaces.nsIObserver)
		) {
			return obj;
		}
		if (__QueryInterface) {
			return __QueryInterface.call(this, iid);
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	};
	
	// nsiWeakReference
	obj.QueryReferent = function(iid) {
		return obj.QueryInterface(iid);
	};
	
	// nsiSupportsWeakReference
	obj.GetWeakReference = function() {
		return obj;
	};	
}