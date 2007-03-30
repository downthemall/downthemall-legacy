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
var currentVersion = "0.9.9.7";

function isNewer(version, current) {

	var ver = version.split(".");
	var cur = current.split(".");
	
	var i = 0;
	while (ver[i] == cur[i] && i<ver.length && i<cur.length) 
		i++;
	
	if (i == cur.length) 
		return false;
	if (Number(ver[i]) > Number(cur[i]))
		return true;
	else
		return false;
}

function versionControl() {
try {
	if (Preferences.get("extensions.dta.version", "0")=="0") {
			Debug.dump("version read: " + Preferences.get("extensions.dta.version", "0") + " - Deleting old preferences");
			Preferences.set("extensions.dta.version", currentVersion);
			restoreAll();
			if (typeof(showFilter) == "function") showFilter(true);
	}
	if (Preferences.get("extensions.dta.version", "0")!=currentVersion) {
		if (isNewer("0.9.9.4", Preferences.get("extensions.dta.version", "0"))) validList(); // filter list validation
		if (isNewer("0.9.8.7", Preferences.get("extensions.dta.version", "0"))) {
			// Traduco le vecchie dropdown nelle nuove preferenze
			var v;
			if (((v = Preferences.get("extensions.dta.directory", "")) != "") && (Preferences.get("extensions.dta.dropdown.directory-current", "") == "")) {
				Preferences.set("extensions.dta.dropdown.directory-current", v.split("|")[0]);
				Preferences.set("extensions.dta.dropdown.directory-history", v.split("|").join("|@|"));
			}
			if ((v = Preferences.get("extensions.dta.filters", "")) != "" && (Preferences.get("extensions.dta.dropdown.filter-history", "") == ""))
				Preferences.set("extensions.dta.dropdown.filter-history", v);
				
			if ((v = Preferences.get("extensions.dta.filter", "")) != "" && (Preferences.get("extensions.dta.dropdown.filter-current", "") == "")) 
				Preferences.set("extensions.dta.dropdown.filter-current", v);
			
			if ((v = Preferences.get("extensions.dta.rename.files", "")) != "" && (Preferences.get("extensions.dta.dropdown.renaming-current", "") == "")) {
				Preferences.set("extensions.dta.dropdown.renaming-current", v);
			}
		}
		if (Preferences.get("extensions.dta.dropdown.filter-current", "") == "") Preferences.set("extensions.dta.dropdown.renaming-current", "*name*.*ext*");
		Preferences.set("extensions.dta.version", currentVersion);
		window.openDialog("chrome://dta/content/dta/privacy.xul","_blank","chrome, centerscreen, resizable=no, dialog=yes, close=no");
		if (typeof(showFilter) == "function") showFilter(true);
	}
	
	if (nsPreferences && nsPreferences.getLocalizedUnicharPref("extensions.dta.context.tempLocation", "") == "") {
		this.tempLocation = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties).get("TmpD", Components.interfaces.nsIFile);
		this.tempLocation.append("dta");
		nsPreferences.setUnicharPref("extensions.dta.context.tempLocation", this.tempLocation.path);
	}
} catch(e) {Debug.dump("versionControl():", e);}
}

function restoreAll() {
try {
	Preferences.removeBranch("extensions.dta");
	Preferences.set("extensions.dta.context.menu", "1,1,0");
	Preferences.set("extensions.dta.context.compactmenu", false);
	Preferences.set("extensions.dta.tool.menu", "1,1,1");
	Preferences.set("extensions.dta.tool.compactmenu", true);
	Preferences.set("extensions.dta.context.highlight", true);
	Preferences.set("extensions.dta.context.closetab", false);
	Preferences.set("extensions.dta.context.closedta", false);
	Preferences.set("extensions.dta.context.reduce", true);
	Preferences.set("extensions.dta.context.saveTemp", true);
	Preferences.set("extensions.dta.context.downloadWin", true);
	Preferences.set("extensions.dta.existing", 3);
	Preferences.set("extensions.dta.context.ntask",4);
	Preferences.set("extensions.dta.context.timeoutsel",6);
	Preferences.set("extensions.dta.context.maxchunks", 5);
	Preferences.set("extensions.dta.context.history", 5);
	Preferences.set("extensions.dta.alertbox", 2);
	Preferences.set("extensions.dta.context.removecompleted", true);
	Preferences.set("extensions.dta.context.removecanceled", false);
	Preferences.set("extensions.dta.context.removeaborted", false);
	Preferences.set("extensions.dta.context.infophrases", true);
	Preferences.set("extensions.dta.directory.visibledump", false);
	Preferences.set("extensions.dta.context.showOnlyFilenames", true);
	Preferences.set("extensions.dta.sounds.done", true);
	Preferences.set("extensions.dta.sounds.error", false);
	Preferences.set("extensions.dta.prealloc", false);
	defaultFilters();
} catch(e) {}
}

function restoreFilter(i,caption,filter,checked,link,image) {
	nsPreferences.setUnicharPref("extensions.dta.context.filter"+i+".caption", caption);
	nsPreferences.setUnicharPref("extensions.dta.context.filter"+i+".filter", filter);
	Preferences.set("extensions.dta.context.filter"+i+".checked", checked);
	Preferences.set("extensions.dta.context.filter"+i+".isImageFilter", image);
	Preferences.set("extensions.dta.context.filter"+i+".isLinkFilter", link);
}

function defaultFilters() {
	var strbundleB = document.getElementById("stringB");
	restoreFilter(0,strbundleB.getString("allfiles"),"/\./", false, true, true);
	restoreFilter(1,strbundleB.getString("arch"), "/\\/[^\\/\\?]+\\.(z(ip|\\d{2})|r(ar|\\d{2})|jar|bz2|gz|tar|rpm)$/", false, true, false);
	restoreFilter(2,strbundleB.getString("vid"), "/\\/[^\\/\\?]+\\.(mp(eg?|[g4])|rm|avi|mov|divx|asf|qt|wmv|ram|m1v|m2v|rv|vob|asx)$/", false, true, false);
	restoreFilter(3,strbundleB.getString("images"), "/\\/[^\\/\\?]+\\.(jpe?g|jpe|gif|png|tiff?|bmp|ico)$/", false, true, false);
	restoreFilter(4,"*.jpeg", "/\\/[^\\/\\?]+\\.(jpe?g|jpe)$/", false, false, true);
	restoreFilter(5,"*.gif", "/\\/[^\\/\\?]+\\.gif$/", false, false, true);
	restoreFilter(6,"*.png", "/\\/[^\\/\\?]+\\.png$/", false, false, true);
	Preferences.set("extensions.dta.context.numfilters", defNumFilters);
}

/* this function:
	- makes the filter list sequential
	- fixes the filter list if filters are fewer than expected
*/
function fixFilterList(start) { 
	try {
		Debug.dump("fixFilterList from " + start);
		var numFilter = nsPreferences.getIntPref("extensions.dta.context.numfilters",0);
		Debug.dump("numFilter = " + numFilter);
		var goal = numFilter - start;
		var found = 0;
		var cursor = start;
		var cent = 1;
		while (found<goal) { // ricerco filtri validi
			Debug.dump("ciclo while. Found = " + found + ", goal = " + goal + ", cursor-start = " + (cursor-start));
			cursor++;
			
			if (validFilter(cursor)) { // appena ne trovo uno lo sposto dove mancava, metto start al successivo posto vuoto
				Debug.dump("trovato filtro valido in posizione " + cursor);
				found++;
				moveFilter(cursor, start);
				start++;
			}
			
			else if ((cursor-start)==500) { // se non trovo e ne ho già controllati 500, forse c'è un prob.
					Debug.dump("Rilevato probabile problema: imposto il numero di filtri a " + start);
					nsPreferences.setIntPref("extensions.dta.context.numfilters", start);
					window.close();
					return false;
			}	
				
		} 
		return true;
	} catch(e) {
		Debug.dump(e);
	}
	
	return false;
}

// if not well-formed, fix the filter list
function validList() {
	var numFilter = nsPreferences.getIntPref("extensions.dta.context.numfilters",0);
	for(var i=0;i<numFilter;i++) {
		if (!validFilter(i)) 
			return fixFilterList(i);
	}
	return true;
}

// return true if the filter exists
function validFilter(filterNumber) {
	var test = nsPreferences.copyUnicharPref("extensions.dta.context.filter"+ filterNumber +".filter","");
	Debug.dump("controllo esistenza filtro " + filterNumber + ": " + !(test==""));
	if (test == "") return false;
	return true;
}

// change the number of a filter in prefs.js
function moveFilter(from, to) {
	Debug.dump("Moving filter " + from + " to " + to);
	try {
		nsPreferences.setUnicharPref("extensions.dta.context.filter" + to + ".caption",
			(nsPreferences.copyUnicharPref("extensions.dta.context.filter" + from + ".caption","")));
		
		nsPreferences.setUnicharPref("extensions.dta.context.filter" + to + ".filter",
			(nsPreferences.copyUnicharPref("extensions.dta.context.filter" + from + ".filter","")));
			
		nsPreferences.setBoolPref("extensions.dta.context.filter" + to + ".isImageFilter",
			(nsPreferences.getBoolPref("extensions.dta.context.filter" + from + ".isImageFilter","")));
			
		nsPreferences.setBoolPref("extensions.dta.context.filter" + to + ".isLinkFilter",
			(nsPreferences.getBoolPref("extensions.dta.context.filter" + from + ".isLinkFilter","")));
			
		nsPreferences.setBoolPref("extensions.dta.context.filter" + to + ".checked",
			(nsPreferences.getBoolPref("extensions.dta.context.filter" + from + ".checked","")));
			
		Preferences._pref.deleteBranch("extensions.dta.context.filter" + from);
	} catch(e) {Debug.dump(e);}
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
