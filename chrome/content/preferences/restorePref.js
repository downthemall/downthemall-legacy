/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
 *
 * Contributers:
 *   Nils Maier <MaierMan@web.de>
 *
 * ***** END LICENSE BLOCK ***** */

var defNumFilters = 7;

function versionControl() {
	try {
		var em = Components.classes["@mozilla.org/extensions/manager;1"]
			.getService(Components.interfaces.nsIExtensionManager);
		var currentVersion = em.getItemForID('dtamod@tn123.ath.cx').version;
	
		var vc = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
			.getService(Components.interfaces.nsIVersionComparator);
		
		var lastVersion = Preferences.getDTA('version', '0');
		if (0 == vc.compare(currentVersion, lastVersion)) {
			return;
		}
		
		if (vc.compare(lastVersion, "0.5") >= 0) {
			// Do something (example)
		}
		window.openDialog("chrome://dta/content/privacy/notice.xul","_blank","chrome, centerscreen, resizable=no, dialog=yes, close=no");		
		Preferences.setDTA('version', currentVersion);
	}
	catch(ex) {
		DTA_debug.dump("versionControl():", ex);
		try {
			Preferences.reset("extensions.dta.version");
			restoreAll();
			// XXX ?!
			if (typeof(showFilter) == "function") {
				showFilter(true);
			}
		}
		catch (ex) {
			DTA_debug.dump('versionControl:', ex);
		}
	}
}

function restoreAll() {
	try {
		Preferences.resetAll();
		defaultFilters();
	} catch(ex) {
		// XXX
	}
}

function restoreFilter(i,caption,filter,checked,link,image) {
	nsPreferences.setUnicharPref("extensions.dta.filters.filter"+i+".caption", caption);
	nsPreferences.setUnicharPref("extensions.dta.filters.filter"+i+".filter", filter);
	Preferences.set("extensions.dta.filters.filter"+i+".checked", checked);
	Preferences.set("extensions.dta.filters.filter"+i+".isImageFilter", image);
	Preferences.set("extensions.dta.filters.filter"+i+".isLinkFilter", link);
}

function defaultFilters() {
	var strbundleB = document.getElementById("stringB");
	restoreFilter(0, strbundleB.getString("allfiles"));
	restoreFilter(1, strbundleB.getString("arch"));
	restoreFilter(2, strbundleB.getString("vid"));
	restoreFilter(3, strbundleB.getString("images"));
}

function browseDire() {
	// let's check and create the directory
	var f = new filePicker();
	var newDir = f.getFolder(nsPreferences.getLocalizedUnicharPref("extensions.dta.context.tempLocation", ""), "");
	if (!newDir) return;
	$("tempLocation").value = newDir;
	nsPreferences.setUnicharPref("extensions.dta.context.tempLocation", newDir);
	$("tempLocation").focus();
}


// only for advPref.xul
function disableLocation() {
	$("tempLocation").disabled=$("browsedir").disabled=!$("temp").checked;
}
