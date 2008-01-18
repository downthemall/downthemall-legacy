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
 *    Federico Parodi <f.parodi@tiscali.it>
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
 
 var Prefs = {
	tempLocation: null,
	
	mappings: [
		['removeCompleted', true],
		['removeAborted', false],
		['removeCanceled', false],
		['autoClose', 'closedta', false],
		['timeout', 300],
		['maxInProgress', 'ntask', 4],
		['maxChunks', 4],
		['setTime', true],
		['showOnlyFilenames', true],
		['conflictResolution', 3],
		['alertingSystem', 'alertbox', (SYSTEMSLASH == '\\') ? 1 : 0],
		['finishEvent', ''],
		['showTooltip', true],
		['maxAutoRetries', 10],
		['autoRetryInterval', 0]
	],

	// nsIObserver
	observe: function(subject, topic, prefName) {
		this._refreshPrefs();
	},

	init: function() {
		makeObserver(this);

		try {
			this._refreshPrefs();
			Preferences.addObserver('extensions.dta.', this);
			Preferences.addObserver('network.', this);
		}
		catch (ex) {
			Debug.log("failed to add pref-observer", ex);
		}
	},

	_refreshPrefs: function() {
		Debug.logString("pref reload");
		this.mappings.forEach(
			function(e) {
				let key, pref, def;
				if (!e) {
					return;
				}
				else if (e.length == 3) {
					key = e[0];
					pref = e[1];
					def = e[2];
				}
				else {
					key = e[0];
					pref = key.toLowerCase();
					def = e[1];
				}
				this[key] = Preferences.getDTA(pref, def);
			},
			this
		);

		if (Preferences.getDTA("saveTemp", true)) {
			try {
				this.tempLocation = Preferences.getMultiByteDTA("tempLocation", '');
				if (this.tempLocation == '') {
					// #44: generate a default tmp dir on per-profile basis
					// hash the profD, as it would be otherwise a minor information leak
					var dsp = Serv('@mozilla.org/file/directory_service;1', 'nsIProperties');
					this.tempLocation = dsp.get("TmpD", Ci.nsIFile);
					var profD = hash(dsp.get("ProfD", Ci.nsIFile).leafName);
					this.tempLocation.append("dtatmp-" + profD);
					Debug.log(this.tempLocation.path);
				}
				else {
					this.tempLocation = new FileFactory(this.tempLocation);
				}
			} catch (ex) {
				this.tempLocation = null;
				// XXX: error handling
			}
		}
		else {
			this.tempLocation = null;
		}
		var conns = (this.maxInProgress * this.maxChunks + 2) * 2;
		['network.http.max-connections', 'network.http.max-connections-per-server', 'network.http.max-persistent-connections-per-server'].forEach(
			function(e) {
				if (conns > Preferences.get(e, conns)) {
					Preferences.set(e, conns);
				}
				conns /= 2;
			}
		);
	}
}
Prefs.init();