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
 * The Original Code is DownThemAll! Global Progress Indicator integration
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *	 Nils Maier <MaierMan@web.de>
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

var EXPORTED_SYMBOLS = ['GlobalProgress'];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;
var Exception = Components.Exception;

Cu.import("resource://dta/utils.jsm");

function GlobalProgress(window) {
	this.init(window);
}

/**
 * Stub implementation, furthermore showing the interface
 * Right now it is fairly similar to Win7 capabilities,
 * but that may change in the future (UNFROZEN)
 */
GlobalProgress.prototype = {
	
	init: function() {},
	exit: function() {},
	reset: function() {},
	
	hide: function() {},
	unknown: function() {},
	pause: function() {},
	activate: function() {},
	error: function() {},
	
	total: 0,
	value: 0
};

try {
	// Windows7, mozilla 1.9.2
	const wtb = Cc["@mozilla.org/windows-taskbar;1"]
				 .getService(Ci.nsIWinTaskbar);
	
	if (!wtb.available) {
		// Service is present but not supported
		throw new Exception("not available");
	}
	for (let s in Ci.nsITaskbarProgress) {
		if (/^STATE/.test(s)){
			this[s.slice(6)] = Ci.nsITaskbarProgress[s];
		}
	}
	GlobalProgress.prototype = {
		_state: NO_PROGRESS,
		init: function(window) {
			let docShell = window.QueryInterface(Ci.nsIInterfaceRequestor).
					getInterface(Ci.nsIWebNavigation).
					QueryInterface(Ci.nsIDocShellTreeItem).treeOwner.
					QueryInterface(Ci.nsIInterfaceRequestor).
					getInterface(Ci.nsIXULWindow).docShell;
			this._progress = wtb.getTaskbarProgress(docShell);
		},
		exit: function() {
			this.hide();
			delete this._progress;
		},
		reset: function() {
			this._total = 1;
			this._value = 0;
			this.hide();
		},
		hide: function() {
			this._state = NO_PROGRESS;
			this._setState();
		},
		unknown: function() {
			this._state = INDETERMINATE;
			this._setState();
		},
		pause: function(value, total) {
			if (arguments.length) {
				this._value = value;
				this._total = total;
			}
			this._state = PAUSED;
			this._setState();
		},
		activate: function(value, total) {
			if (arguments.length) {
				this._value = value;
				this._total = total;
			}
			this._state = NORMAL;
			this._setState();			
		},
		error: function(value, total) {
			if (arguments.length) {
				this._value = value;
				this._total = total;
			}
			this._state = ERROR;
			this._setState();
		},
		get value() {
			return this._value;
		},
		set value(nv) {
			this._value = nv.toFixed(0);
			this._setState();
		},
		get total() {
			return this._total;
		},
		set total(nv) {
			this._total = nv.toFixed(0);
			this._setState();
		},
		_setState: function() {
			if (this._state <= INDETERMINATE) {
				this._progress.setProgressState(this._state);
			}
			else {
				this._progress.setProgressState(
					this._state, 
					this._value, 
					this._total
					);
			}
		},
		_total: 1,
		_value: 0
	}
}
catch (ex) {
	// not available or failed to init
	// Stub will be used!
}