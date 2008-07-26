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
	'getDTA',
	'getMultiByte',
	'getMultiByteDTA',
	'set',
	'setDTA',
	'setMultiByte',
	'setMultiByteDTA',
	'reset',
	'resetDTA',
	'resetBranch',
	'resetBranchDTA',
	'resetAllDTA',
	'addObserver',
	'removeObserver'
];

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
	
function getDTA(key, defaultValue) {
		return get('extensions.dta.' + key, defaultValue);
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

function setDTA(key, value){
	return set('extensions.dta.' + key, value);
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

function getMultiByteDTA(key, defaultValue){
	return getMultiByte('extensions.dta.' + key, defaultValue);
}

function setMultiByte(key, value) {
	let str = new SupportsString();
	str.data = value.toString();
	prefs.setComplexValue(key, Ci.nsISupportsString, str);
}

function setMultiByteDTA(key, value) {
		setMultiByte('extensions.dta.' + key, value);
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


function resetDTA(key) {
	if (key.search(/^extensions\.dta\./) != 0) {
		key = 'extensions.dta.' + key;
	}
	return reset(key);
}

function resetBranch(branch) {
	try {
		prefs.resetBranch(branch);
	}
	catch (ex) {
		// BEWARE: not yet implemented in XPCOM 1.8/trunk.
		let c = {value: 0};
		let children = prefs.getChildList(branch, c);
		for (var i = 0; i < c.value; ++i) {
			reset(prefs[i]);
		}
	}
}

function resetBranchDTA(branch) {
	resetBranch('extension.dta.' + branch);
}

function resetAllDTA() {
	resetBranchDTA('');
}

function addObserver(branch, obj) {
	prefs.QueryInterface(nsIPrefBranch2).addObserver(branch, obj, true);
}

function removeObserver(branch, obj) {
	prefs.QueryInterface(nsIPrefBranch2).removeObserver(branch, obj);
}
