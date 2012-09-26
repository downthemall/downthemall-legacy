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
 * The Original Code is DownThemAll AlertService module.
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
	'available',
	'show'
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

let Preferences = {};
module("resource://dta/preferences.jsm", Preferences);

let available = false;
let service = null;
let alerting = false;

const Observer = {
	_func: null,
	observe: function(aSubject, aTopic, aData) {
		switch (aTopic) {
		case "alertfinished":
			alerting = false;
			break;
		case "alertclickcallback":
			if (this._func) {
				try {
					this._func();
				}
				catch (ex) {
					Cu.reportError(ex);
					// no op
				}
			}
			this._func = null;
			break;
		}
	}
};

try {
	service = Cc['@mozilla.org/alerts-service;1'].getService(Ci.nsIAlertsService);
	Preferences.makeObserver(Observer);
	available = true;
}
catch (ex) {
	// no-op
}

function show(title, msg, callback) {
	if (!available) {
		throw new Exception("Alerting Service not available on this platform!");
	}
	if (alerting) {
		return;
	}

	let clickable = false;
	Observer._func = null;
	if (typeof callback == 'function') {
		clickable = true;
		Observer._func = callback;
	}

	try {
		service.showAlertNotification(
			"chrome://dta/skin/common/alert.png",
			title,
			msg,
			clickable,
			null,
			Observer
			);
		alerting = true;
	}
	catch (ex) {
		available = false;
	}
}