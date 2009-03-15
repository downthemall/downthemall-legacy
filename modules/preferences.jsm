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

const EXT = 'extensions.dta.';

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIPrefBranch = Ci.nsIPrefBranch;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;

const PREF_STRING = nsIPrefBranch.PREF_STRING;
const PREF_INT = nsIPrefBranch.PREF_INT;
const PREF_BOOL = nsIPrefBranch.PREF_BOOL;

const SupportsString = Components.Constructor('@mozilla.org/supports-string;1', 'nsISupportsString');

const prefs = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefBranch);

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
	
function getExt(key, defaultValue) {
		return get(EXT + key, defaultValue);
}

function set(key, value){
	if (typeof value == 'number' || value instanceof Number) {
		return prefs.setIntPref(key, value);
	}
	if (typeof value == 'boolean' || value instanceof Boolean) {
		return prefs.setBoolPref(key, value);
	}
	return setMultiByte(key, value);
}

function setExt(key, value){
	return set(EXT + key, value);
}

function getMultiByte(key, defaultValue){
	try {
		return prefs.getComplexValue(key, Ci.nsISupportsString).data;
	} 
	catch (ex) {
		// no-op
	}
	return defaultValue;
}

function setMultiByte(key, value) {
	let str = new SupportsString();
	str.data = value.toString();
	prefs.setComplexValue(key, Ci.nsISupportsString, str);
}

function hasUserValue(key) {
	try {
		return prefs.prefHasUserValue(key);
	}
	catch (ex) {
		// no-op
	}
	return false;
}

function hasUserValueExt(key) {
	return hasUserValue(EXT + key);
}

function getChildren(key) {
	return prefs.getChildList(key, {});
}

function getChildrenExt(key) {
	return getChildren(EXT + key);
}

function reset(key) {
	try {
		return prefs.clearUserPref(key);
	}
	catch (ex) {
		// no-op
	}
	return false;
}


function resetExt(key) {
	if (key.search(new RegExp('/^' + EXT + '/')) != 0) {
		key = EXT + key;
	}
	return reset(key);
}

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

function resetBranchExt(branch) {
	resetBranch(EXT + branch);
}

function resetAllExt() {
	resetBranchExt('');
}

function addObserver(branch, obj) {
	makeObserver(obj);
	prefs.QueryInterface(nsIPrefBranch2).addObserver(branch, obj, true);
}

function removeObserver(branch, obj) {
	prefs.QueryInterface(nsIPrefBranch2).removeObserver(branch, obj);
}

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
	let __QueryInterface = obj.QueryInterface;
	obj.QueryInterface = function(iid) {
		try {
			if (
				iid.equals(Components.interfaces.nsISupports)
				|| iid.equals(Components.interfaces.nsISupportsWeakReference)
				|| iid.equals(Components.interfaces.nsIWeakReference)
				|| iid.equals(Components.interfaces.nsIObserver)
			) {
				return obj;
			}
			if (__QueryInterface) {
				debug("calling original: " + iid);
				return __QueryInterface.call(this, iid);
			}
			throw Components.results.NS_ERROR_NO_INTERFACE;
		}
		catch (ex) {
			debug("requested interface not available: " + iid);
			throw ex;
		}
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
