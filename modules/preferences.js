/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// Base extension branch
// Third parties reusing this module must specify own branch!
const EXT = 'extensions.dta.';

const PREF_STRING = Ci.nsIPrefBranch.PREF_STRING;
const PREF_INT = Ci.nsIPrefBranch.PREF_INT;
const PREF_BOOL = Ci.nsIPrefBranch.PREF_BOOL;

const prefs = Services.prefs;
if (!(prefs instanceof Ci.nsIPrefBranch2) || !(prefs instanceof Ci.nsIPrefBranch2)) {
	log(LOG_DEBUG, "simple prefs");
}

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
	let str = new Instances.SupportsString();
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
	prefs.addObserver(branch, obj, true);
	return function() removeObserver(branch, obj);
}

/**
 * Removes a preference observer again
 * @param branch (string) Branch to add the preference observer for
 * @param obj (object) Preference observer. Must have been added before
 */
function removeObserver(branch, obj) {
	prefs.removeObserver(branch, obj);
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

Object.defineProperties(exports, {
	"get": {value: get, enumerable: true},
	"getBranch": {value: getBranch, enumerable: true},
	"set": {value: set, enumerable: true},
	"getExt": {value: getExt, enumerable: true},
	"setExt": {value: setExt, enumerable: true},
	"hasUserValue": {value: hasUserValue, enumerable: true},
	"hasUserValueExt": {value: hasUserValueExt, enumerable: true},
	"getChildren": {value: getChildren, enumerable: true},
	"getChildrenExt": {value: getChildrenExt, enumerable: true},
	"reset": {value: reset, enumerable: true},
	"resetExt": {value: resetExt, enumerable: true},
	"resetBranch": {value: resetBranch, enumerable: true},
	"resetBranchExt": {value: resetBranchExt, enumerable: true},
	"resetAllExt": {value: resetAllExt, enumerable: true},
	"addObserver": {value: addObserver, enumerable: true},
	"removeObserver": {value: removeObserver, enumerable: true},
	"makeObserver": {value: makeObserver, enumerable: true}
});
Object.freeze(exports);

(function setDefaultPrefs() {
	log(LOG_INFO, "setting default preferences");
	const branch = Services.prefs.getDefaultBranch("");
	let scope = {pref: function(key, val) {
		log(LOG_INFO, "setting pref " + key + ": " + val);
		if (typeof val == 'number') {
			branch.setIntPref(key, val);
			return;
		}
		if (typeof val == 'boolean') {
			branch.setBoolPref(key, val);
			return;
		}
		let str = new Instances.SupportsString();
		str.data = val.toString();
		branch.setComplexValue(key, Ci.nsISupportsString, str);
	}};
	try {
		Services.scriptloader.loadSubScript(BASE_PATH + "defaultPrefs.js", scope);
	}
	// errors here should not kill addon
	catch (ex) {
		log(LOG_ERROR, "failed to setup default preferences", ex);
	}
})();
