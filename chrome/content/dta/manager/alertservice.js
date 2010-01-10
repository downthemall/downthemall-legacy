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
 * The Original Code is DownThemAll!
 *
 * The Initial Developers of the Original Code are Stefano Verna and Federico Parodi
 * Portions created by the Initial Developers are Copyright (C) 2004-2007
 * the Initial Developers. All Rights Reserved.
 *
 * Contributor(s):
 *    Stefano Verna <stefano.verna@gmail.com>
 *    Federico Parodi <jimmy2k@gmail.com>
 *    Nils Maier <MaierMan@web.de>
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
 var AlertService = {
	_alerting: false,
	_init: function() {
		if ('@mozilla.org/alerts-service;1' in Cc && 'nsIAlertsService' in Ci) {
			// some systems do not have this service
			try {
				this._service = Serv('@mozilla.org/alerts-service;1', 'nsIAlertsService');
				Preferences.makeObserver(this);
				this._available = true;
			}
			catch (ex) {
				// no-op
			}
		}
	},
	get available() {
		return this._available;
	},
	_available: false,
	_service: null,
	show: function(title, msg, clickable, cookie) {
		if (!this.available) {
			throw new Exception("Alerting Service not available on this platform!");
		}
		if (this._alerting || !this._service) {
			return;
		}
		this._alerting = true;
		this._service.showAlertNotification(
			"chrome://dta/skin/common/alert.png",
			title,
			msg,
			clickable,
			cookie,
			this
			);
	},
	observe: function (aSubject, aTopic, aData) {
		switch (aTopic) {
			case "alertfinished":
				// global variable
				this._alerting = false;
				break;
			case "alertclickcallback":
				if (aData != "errore") {
					try {
						OpenExternal.launch(aData);
					}
					catch (ex) {
						// no-op
					}
				}
				break;
		}
	}
};
AlertService._init();