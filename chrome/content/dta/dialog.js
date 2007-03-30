/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
 *
 * ***** END LICENSE BLOCK ***** */

function load() {
   
	var w = window.arguments[0];
	document.getElementById("text").appendChild(document.createTextNode(w.text));
	document.getElementById("s1").label = w.s1.caption;
	document.getElementById("s2").label = w.s2.caption;
	document.getElementById("s3").label = w.s3.caption;
	document.getElementById("s1").value = w.s1.value;
	document.getElementById("s2").value = w.s2.value;
	document.getElementById("s3").value = w.s3.value;
}

function ok() {
try {
	window.arguments[0].scelta = parseInt(document.getElementById("scelta").childNodes[document.getElementById("scelta").selectedIndex].value);
	window.arguments[0].temp = document.getElementById("apply").selectedIndex;

	if (window.arguments[0].temp == 2) {
		pref = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefBranch);
		pref.setIntPref("extensions.dta.existing", document.getElementById("scelta").selectedIndex);
	}
	
	return true;
} catch (e) {
	mydump("ok() : " + e);
}
return false;
}

window.addEventListener("load", function() {setTimeout("window.sizeToContent();",0);}, false);