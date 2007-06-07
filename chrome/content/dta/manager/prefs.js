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
 *    Federico Parodi
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
	// default values
	showOnlyFilenames: true,
	alertingSystem: (SYSTEMSLASH == '\\') ? 1 : 0,

	// conflict filenames preference for this session (-1 not setted)
	askEveryTime: true,
	sessionPreference: -1,
	onConflictingFilenames: 3,

	maxInProgress: 5,
	maxChunks: 5,
	tempLocation: null,

	currentTooltip: null,

	removeCompleted: true,
	removeAborted: false,
	removeCanceled: false,
	
	autoClose: false,
	
	setTime: true,
	
	finishEvent: '',
	
	timeout: 300,

	// nsIObserver
	observe: function(subject, topic, prefName) {
		this._refreshPrefs();
	},

	init: function() {
		makeObserver(this);

		try {
			this._refreshPrefs();
			var pbi = Cc['@mozilla.org/preferences-service;1']
				.getService(Ci.nsIPrefService)
				.getBranch(null)
				.QueryInterface(Components.interfaces.nsIPrefBranch2)
			;
			pbi.addObserver('extensions.dta.', this, true);
			pbi.addObserver('network.', this, true);
		}
		catch (ex) {
			Debug.dump("failed to add pref-observer", ex);
		}
	},

	_refreshPrefs: function() {
		Debug.dump("pref reload");

		[
			'removeCompleted',
			'removeAborted',
			'removeCanceled',
			['autoClose', 'closedta'],
			'timeout',
			['maxInProgress', 'ntask'],
			'maxChunks',
			'setTime',
			'showOnlyFilenames',
			['onConflictingFilenames', 'existing'],
			['alertingSystem', 'alertbox'],
			'finishEvent'
		].forEach(
			function(e) {
				if (e instanceof Array) {
					var key = e[0];
					var pref = e[1];
				}
				else {
					var key = e;
					var pref = key.toLowerCase();
				}
				this[key] = Preferences.getDTA(pref, this[key]);
			},
			this
		);

		if (Preferences.get("saveTemp", true)) {
			try {
				this.tempLocation = Preferences.getMultiByteDTA("tempLocation", '');
				if (this.tempLocation == '') {
					// #44: generate a default tmp dir on per-profile basis
					// hash the profD, as it would be otherwise a minor information leak
					var dsp = Cc["@mozilla.org/file/directory_service;1"]
						.getService(Ci.nsIProperties);
					this.tempLocation = dsp.get("TmpD", Ci.nsIFile);
					var profD = hash(dsp.get("ProfD", Ci.nsIFile).leafName);
					this.tempLocation.append("dtatmp-" + profD);
					Debug.dump(this.tempLocation.path);
				}
				else {
					this.tempLocation = new FileFactory(this.tempLocation);
				}
			} catch (ex) {
				this.tempLocation = null;
				// XXX: error handling
			}
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