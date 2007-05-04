/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
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
		$("temp").disabled = $("browse").disabled = !$("useTemp").checked;
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

var NewPrefs = {
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