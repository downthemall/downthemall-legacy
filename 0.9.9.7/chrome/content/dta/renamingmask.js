/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
 *
 * ***** END LICENSE BLOCK ***** */

var pref = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefBranch);

//--> determina lo slash del sistema operativo
function findForbiddenSeparator() {

    const DIR_SERVICE = new Components.Constructor("@mozilla.org/file/directory_service;1","nsIProperties");
    try {
        var path=(new DIR_SERVICE()).get("ProfD", Components.interfaces.nsIFile).path;
    } catch (e) {}

    // determine the file-separator
    if (path.search(/\\/) != -1) return "/"; else return "\\"; 
}

function checkMaskSyntax() {
	var v = document.getElementById("renaming").value;
	if (v.replace(/^[ ]+|[ ]+$/gi, "").length == 0) {
		document.getElementById("renaming").value = "*name*.*ext*";
		return true;
	}
	
	v = v.replace(/\*[^\*]+\*/gi, "");
	
	if (findForbiddenSeparator() == "/")
		var regex = new RegExp(/[^\*\?\"\<\>\|\:/]{0,}/ig);
	else
		var regex = new RegExp(/[^\*\?\"\<\>\|\:\\]{0,}/ig);

	var a = regex.exec(v);
	if (a[0]!=v) {
	  alert(strbundle.getString("rennv") + findForbiddenSeparator());
	  document.getElementById("renaming").value = document.getElementById("renaming").value.replace(/[\?\"\<\>\|\:]/gi, "-");
	  return false;
	}
	return true;
}

function dropDownObject(name, idInput, idDropDown, predefined, predefinedHistory) {
	this.name = name;
	this.branch = "extensions.dta.dropdown."+name;
	this.currentValue = this.branch+"-current";
	this.history = this.branch+"-history";
	this.idInput = idInput;
	this.idDropDown = idDropDown;
	this.predefined = predefined;
	this.predefinedHistory = predefinedHistory;
}

dropDownObject.prototype.load = function() {
	var valuesDrop = getPreference(this.history, this.predefinedHistory).split("|@|");
	var drop = document.getElementById(this.idDropDown);
	var maxDrop = getPreference("extensions.dta.context.history", 5);

	while (drop.hasChildNodes())
		drop.removeChild(drop.lastChild); 
	
	for (x in valuesDrop) {
		var itemNode = document.createElement("menuitem");
		itemNode.setAttribute("label", valuesDrop[x]);
		drop.appendChild(itemNode);
	}

	document.getElementById(this.idInput).value = getPreference(this.currentValue, this.predefined);
}

dropDownObject.prototype.getCurrent = function() {
	return document.getElementById(this.idInput).value;
}

dropDownObject.prototype.saveCurrent = function(alsoNothing) {
	if (alsoNothing || document.getElementById(this.idInput).value.length > 0)
		pref.setCharPref(this.currentValue, document.getElementById(this.idInput).value);
}

dropDownObject.prototype.saveDrop = function(stringa) {
	if (stringa.length == 0) return true;
	
	var valuesDrop = getPreference(this.history, this.predefinedHistory).split("|@|");
	var maxInDrop = getPreference("extensions.dta.context.history", 5);
	
	for (i in valuesDrop)
		if (stringa == valuesDrop[i])
			valuesDrop.splice(i, 1);

	if (valuesDrop.length == maxInDrop) valuesDrop.pop();
	valuesDrop.splice(0, 0, stringa);
	
	pref.setCharPref(this.history, valuesDrop.join("|@|"));
} 
 
var setted = false;
function addURLnow() {
	var sel = window.arguments[0];
	checkMaskSyntax();
	var mask = document.getElementById("renaming").value;
    for (i in sel) {
		sel[i].mask = mask;
	}
	setted = true;
	self.close();
}

var dropDown;

function load() {
	strbundle = document.getElementById("strings");
	document.getElementById("renaming").addEventListener("blur", checkMaskSyntax, true);
	dropDown = new dropDownObject("renaming", "renaming", "renamingitems", "*name*.*ext*", "*name*.*ext*|@|*num*_*name*.*ext*|@|*url*/*name*.*ext*|@|*name* (*text*).*ext*|@|*name* (*hh*-*mm*).*ext*");
	dropDown.load();
}

function unload() {
	var v = checkMaskSyntax();
	if (v && !setted) {
		var sel = window.arguments[0];
		sel = new Array();
	}
	return v;
}


function getPreference(stringa, predefinito) {
	try {
		if (typeof(predefinito) == "boolean")
			var scelta = pref.getBoolPref(stringa);
		else if (typeof(predefinito) == "string")
			var scelta = pref.getCharPref(stringa);
		else
			var scelta = pref.getIntPref(stringa);
		return scelta;
	} catch (e) {
		if (typeof(predefinito) == "boolean")
			var scelta = pref.setBoolPref(stringa, predefinito);
		else if (typeof(predefinito) == "string")
			var scelta = pref.setCharPref(stringa, predefinito);
		else
			var scelta = pref.setIntPref(stringa, predefinito);
		
		return predefinito;
	}
}

var listObserver = { 
  onDragStart: function (evt,transferData,action){
    var txt=evt.target.getAttribute("value");
    transferData.data=new TransferData();
    transferData.data.addDataForFlavour("text/unicode",txt);
  }
};


function appendTag(event) {
	var text = document.getElementById(dropDowns.renaming.idInput);
	var s = text.inputField.selectionStart;
	text.value = text.value.substring(0, s) + event.target.getAttribute("value") + text.value.substring(text.inputField.selectionEnd, text.value.length);
	text.inputField.setSelectionRange(s + event.target.getAttribute("value").length, s + event.target.getAttribute("value").length);
}
