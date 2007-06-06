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
 *    Stefano Verna
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

if (!Cc) {
	const Cc = Components.classes;
}
if (!Ci) {
	const Ci = Components.interfaces;
}

var Main = {
	load: function() {
		$('alert2').hidden = !('nsIAlertsService' in Ci);
	}
}

var Privacy = {
	load: function PP_load() {
		try {
			var log = !DTA_profileFile.get('dta_log.txt').exists();
			$("butShowLog", 'butDelLog', 'butRevealLog')
				.forEach(function(e) { e.disabled = log; });
			
			var history = uneval(Preferences.getDTA("filter", ''));
			history = !history || !history.length;
			$("butFiltDel").disabled = history;
				
			history = uneval(Preferences.getDTA("directory", ''));
			history = !history || !history.length;
			$("butFoldDel").disabled = history;
		}
		catch(ex) {
			Debug.dump("privacyLoad(): ", ex);
		}
	},
	delFilters: function() {
		Preferences.resetDTA("filter");
	},
	delDirectories: function() {
		Preferences.resetDTA("directory");
	},
	showLog: function() {
		var log = DTA_profileFile.get('dta_log.txt');
		if (log.exists()) {
			DTA_Mediator.openTab("file://" + log.path);
		}
	},
	revealLog: function() {
		var log = DTA_profileFile.get('dta_log.txt')
			.QueryInterface(Ci.nsILocalFile);
		if (log.exists()) {
			OpenExternal.reveal(log);
		}
	},
	deleteLog: function() {
		var log = DTA_profileFile.get('dta_log.txt');
		if (log.exists()) {
			log.remove(false);
			$("butShowLog", 'butDelLog', 'butRevealLog')
				.forEach(function(e){ e.disabled = true; });
		}
	}
};

var Advanced = {
	browse: function() {
		// let's check and create the directory
		var tmp = $("temp");
		if (!tmp) {
			return;
		}
		var f = Utils.askForDir(Preferences.getMultiByteDTA("tempLocation", tmp.value), "");
		if (!f) {
			return;
		}
		$("temp").value = f;
		Preferences.setMultiByteDTA("tempLocation", f);
		$("temp").focus();
	},
	toggleTemp: function() {
		$("temp").disabled = $("browsedir").disabled = !$("useTemp").checked;
	}
};

var Interface = {
	getMenu: function(pref, which) {
		return $(pref).value.split(',')[which] == '1';
	},
	setMenu: function(pref, which) {
		var menu = $(pref).value.split(',');
		menu[which] = $(pref + which).checked ? 1 : 0;
		return menu.toString();
	}
};

var Prefs = {
	load: function() {
		make_();
	},
	restoreAll: function() {
		if (DTA_confirm(_('restoreprefstitle'), _('restoreprefstext'), _('restore'), DTA_confirm.CANCEL, null, 1) == 1) {
			return;
		}
		try {
			Preferences.resetAll();
		} catch(ex) {
			// XXX
		}
	}
}