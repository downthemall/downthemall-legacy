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
 * The Original Code is DownThemAll Private Browsing Mode compat.
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

const EXPORTED_SYMBOLS = [
	'browsingPrivately',
	'registerCallbacks',
	'unregisterCallbacks'
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

module("resource://dta/glue.jsm");

/**
 * Returns whether in PBM or not
 */
function browsingPrivately() false;

/**
 * Register a callback
 * @param obj Callback object.
 * 		The callback object can implement enter-/exitPrivateBrowsing.
 *    These functions have no parameters. No return value is expected.
 *    If Private Browsing Mode is currently active enterPrivateBrowsingMode will be called immediately
 *
 *    Furthermore canEnterPrivateBrowsing/canLeavePrivateBrowsing functions may be implemented.
 *    These have no parameters, but a boolean return value is expected stating whether a mode switch might be performed.
 *
 *    All callbacks will be called in the scope of obj.
 */
function registerCallbacks() {};

/**
 * Unregister a callback again
 */
function unregisterCallbacks() {};

if (("@mozilla.org/privatebrowsing-wrapper;1" in Cc) && ("nsIPrivateBrowsingService" in Ci)) {
	const pbm = Cc["@mozilla.org/privatebrowsing-wrapper;1"].getService(Ci.nsIPrivateBrowsingService);

	let _callbacks = [];

	function Observer() {
		Services.obs.addObserver(this, "private-browsing", false);
		Services.obs.addObserver(this, "private-browsing-cancel-vote", false);
		Services.obs.addObserver(this, "quit-application", false);
	}
	Observer.prototype = {
		QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),
		observe: function(aSubject, aTopic, aData) {
			switch (aTopic) {
			case 'private-browsing-cancel-vote':
				if (aData == 'enter') {
					this.doVote('canEnterPrivateBrowsing', aSubject);
				}
				else if (aData == 'exit') {
					this.doVote('canExitPrivateBrowsing', aSubject);
				}
				break;
			case 'private-browsing':
				this.notify(aData + "PrivateBrowsing");
				break;
			case 'quit-application':
				this.teardown();
			}
		},
		doVote: function(prop, cancel) {
			cancel.QueryInterface(Ci.nsISupportsPRBool);
			if (cancel.data) {
				// already canceled
				return;
			}
			cancel.data = !_callbacks.every(function(c) {
				if (prop in c) {
					return c[prop].call(c);
				}
				return true;
			});
		},
		notify: function(prop) {
			_callbacks.forEach(function(c) !(prop in c) || c[prop].call(c));
		},
		teardown: function() {
			Services.obs.removeObserver(this, "private-browsing");
			Services.obs.removeObserver(this, "private-browsing-cancel-vote");
			Services.obs.removeObserver(this, "quit-application");
			_callbacks = [];
		}
	};
	const observer = new Observer();

	function browsingPrivately() pbm.privateBrowsingEnabled;
	function registerCallbacks(obj) {
		_callbacks.push(obj);
		if (browsingPrivately() && 'enterPrivateBrowsing' in obj) {
			obj['enterPrivateBrowsing'].call(obj);
		}
	}
	function unregisterCallbacks(obj) {
		let idx = _callbacks.indexOf(obj);
		if (idx > -1) {
			_callbacks.splice(idx, 1);
		}
	}
}
