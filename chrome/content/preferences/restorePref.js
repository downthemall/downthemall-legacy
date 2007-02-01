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
		var currentVersion = em.getItemForID('dta@downthemall.net').version;
	
		var vc = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
			.getService(Components.interfaces.nsIVersionComparator);
		
		var lastVersion = Preferences.getDTA('version', '0');
		if (0 == vc.compare(currentVersion, lastVersion)) {
			return;
		}
		
		if (vc.compare(lastVersion, "0.5") >= 0) {
			// Do something (example)
		}
		if (openHelp) {
			openHelp('About_Privacy','chrome://dta/locale/help/dtahelp.rdf');
		}
		Preferences.setDTA('version', currentVersion);
	}
	catch(ex) {
		DTA_debug.dump("versionControl():", ex);
		try {
			Preferences.resetDTA("version");
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
	} catch(ex) {
		// XXX
	}
}