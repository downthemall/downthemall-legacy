/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
 *
 * ***** END LICENSE BLOCK ***** */

function loadTab() {
	try {
			var ale = Components.classes['@mozilla.org/alerts-service;1'].getService(Components.interfaces.nsIAlertsService);
			not1 = false;
		} catch (e) {
			$("alert2").hidden = true;
			not1 = true;
		}
}

function showLog() {
	var log = DTA_profileFile.get('dta_log.txt');

	if (log.exists())
		DTA_Mediator.openTab("file://" + log.path, '_blank');

}

function deleteLog() {
	var log = DTA_profileFile.get('dta_log.txt');

	if (log.exists()) {
		log.remove(false);
		$("butShowLog").disabled=true;
		$("butDelLog").disabled=true;
	}
}

function privacyLoad() {
try {
  var log = DTA_profileFile.get('dta_log.txt');
	
	if (log.exists()) {
		$("butShowLog").disabled=false;
		$("butDelLog").disabled=false;
	} else {
		$("butShowLog").disabled=true;
		$("butDelLog").disabled=true;
	}
	
	var filters = Preferences.get("extensions.dta.dropdown.filter-history", "");
	if (filters != "") $("butFiltDel").disabled=false;
	else $("butFiltDel").disabled=true;
		
	var folders = Preferences.get("extensions.dta.dropdown.directory-history", "");
	if (folders != "") $("butFoldDel").disabled=false;
	else $("butFoldDel").disabled=true;
} catch(e) {Debug.dump("privacyLoad(): ", e);}
}

function delFilters() {
	var filters = Preferences.get("extensions.dta.dropdown.filter-history", "");
	if (filters != "") Preferences.removeBranch("extensions.dta.dropdown.filter-history");
	$("butFiltDel").disabled=true;
}

function delFolders() {
	var folders = Preferences.get("extensions.dta.dropdown.directory-history", "");
	if (folders != "") Preferences.removeBranch("extensions.dta.dropdown.directory-history");
	$("butFoldDel").disabled=true;
}

function loadContext(whatBox) {
try {
	var preference = $("dtaContext");
	var menu =  preference.value.split(",");
	return menu[whatBox]=="1";
} catch(e) {Debug.dump("loadContext(): ", e); return false;}
}

function loadTool(whatBox) {
try {
	var preference = $("dtaTool");
	var menu =  preference.value.split(",");
	return menu[whatBox]=="1";
	} catch(e) {Debug.dump("loadTool(): ", e); return false;}
}

function setContext(whatBox) {
	
	var preference = $("dtaContext");
	var menu =  preference.value.split(",");
	menu[whatBox] = $("dtacontext" + whatBox).checked?"1":"0";
	var rv = menu[0] + "," + menu[1] + "," + menu[2];
	return rv;
}

function setTool(whatBox) {
var preference = $("dtaTool");
	var menu =  preference.value.split(",");
	menu[whatBox] = $("dtatool" + whatBox).checked?"1":"0";
	var rv = menu[0] + "," + menu[1] + "," + menu[2];
	return rv;
}
