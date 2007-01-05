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

var strbundle;
var donation;
var dropDowns = new Object();
var lop = ""; //links or pictures

function checkSyntax(allowEmpty) {
	
	// let's check and create the directory
	var f = new filePicker();
	var directory = $("directory");
	if ((!directory.value || directory.value.trim().length == 0)&&allowEmpty) return false;
	if (!directory.value || directory.value.trim().length == 0 || f.createValidDestination(directory.value)==false) {
		alert(strbundle.getString("alertfolder"));
		var newDir = f.getFolder(null, strbundle.getString("validdestination"));
		if (!newDir) 
			directory.value="";
		else
			directory.value = newDir;
		return false;
	}
	dropDowns.directory.saveCurrent(false);
	return true;
}

// save preferences	
function savepref() {
	for (var i = 0; i < $("checkcontainer").childNodes.length; i++) 
		Preferences.set("extensions.dta.context." + $("checkcontainer").childNodes[i].getAttribute("id") + ".checked", $("checkcontainer").childNodes[i].checked);
}

function load() {

	strbundle = $("strings");
	$("directory").addEventListener("blur", checkSyntax, true);
	document.getElementById("dtaSelectHelp").hidden = !("openHelp" in window);
  versionControl();
	
	dropDowns.filter = new dropDownObject("filter", "filter", "filteritems", strbundle.getString("ddfilter"), "/(\\.mp3)$/|@|/(\\.(html|htm|rtf|doc|pdf))$/|@|http://www.website.com/subdir/*.*|@|http://www.website.com/subdir/pre*.???|@|*.z??, *.css, *.html");
	dropDowns.directory = new dropDownObject("directory", "directory", "directoryitems", "", "");
	dropDowns.renaming = new dropDownObject("renaming", "renaming", "renamingitems", "*name*.*ext*", "*name*.*ext*|@|*num*_*name*.*ext*|@|*url*-*name*.*ext*|@|*name* (*text*).*ext*|@|*name* (*hh*-*mm*).*ext*");
	
	try {
		// searches links in the arguments passed by menu.xul
		var links = window.arguments[0];
		var images = window.arguments[1];
		
		dropDowns.filter.load();
		dropDowns.renaming.load();	
		
		checkSyntax(true);
		
		dropDowns.directory.load();
		
		$("openlinks").label = $("openlinks").label + " ("+ links.length + ")";

		addLinks("file", links);

		$("openpics").label = $("openpics").label + " ("+ images.length + ")";

		addLinks("img", images);
		
		if(Preferences.get("extensions.dta.context.seltab", 0) == 0) 
			lop = "links";
		else
			lop = "pics";
	
		if (dropDowns.filter.getCurrent().length > 0) showFilter(true); else showFilter(false);
		changeTab(lop);
	
		dropDowns.directory.load();
		
		if (Preferences.get("extensions.dta.context.infophrases", true)) {
			donation = new XMLHttpRequest();
			donation.onreadystatechange = checkNews;
			donation.open("GET", "http://www.downthemall.net/news.xml");
			donation.send(null);
		} else {
		  setDefaultDonation();
		}
	} catch(ex) {
		DTA_debug.dump("load():", ex);
	}
}

function createPrefFilter(index, caption, reg, check, link, image) {
	Preferences.set("extensions.dta.context.filter" + index + ".caption", caption);
	Preferences.set("extensions.dta.context.filter" + index + ".filter", reg);
	Preferences.set("extensions.dta.context.filter" + index + ".checked", check);
	Preferences.set("extensions.dta.context.filter" + index + ".isImageFilter", image);
	Preferences.set("extensions.dta.context.filter" + index + ".isLinkFilter", link);
}

function loadOptions () {

	var numfilterold = Preferences.get("extensions.dta.context.numfilters", defNumFilters);
	DTA_showPreferences();

	if (Preferences.get("extensions.dta.context.numfilters", -1) == -1) {
		try {
	    restoreAll();
		} catch(e) {
			DTA_debug.dump("restoreAll():", e);
		}
	}
	
	if ($("filteritems")) {
		dropDowns.filter.load();
		dropDowns.directory.load();
		dropDowns.renaming.load();	
	}

	var box = $("checkcontainer");
	if (box) {
		while (box.hasChildNodes())
			box.removeChild(box.lastChild);
		changeTab(lop);
	}
}
	
function updateIcon(link, metalink, elem) {
	var uri = Components.classes["@mozilla.org/network/standard-url;1"]
		.createInstance(Components.interfaces.nsIURI);
	uri.spec = link;
	var ext = uri.path.match(/\.([^/.]+)$/);
	ext = ext ? ext[1] : null;
	
	var ico = null;	
	if (metalink) {
		ico = "chrome://dta/content/immagini/metalink.png";
	}
	else if ((new String()).findSystemSlash() == "/") {
		if (!ext) {}
		else if (ext.search(/^z(?:ip|\d{2})|r(?:ar|\d{2})|jar|bz2|gz|tar|rpm|deb|xpi|ace|7z(?:ip)$/i) != -1) {
			ico = "chrome://dta/content/immagini/zip.png";
		}
		else if (ext.search(/^mp(?:eg?|g|4)|rmv?|ram|avi|mov|qt|asf|wmv?|mkv$/i) != -1) {
			ico = "chrome://dta/content/immagini/mpg.png";
		}
		else if (ext.search(/^jp(?:eg?|g|2)|gif|png|tiff?|w?bmp|psd|icon?|tga$/i) != -1) {
			ico = "chrome://dta/content/immagini/jpg.png";
		}
		else if (ext.search(/^wav|mp[2-4]?a?|mka|flac|og[ga]|mid$/i) != -1) {
			ico = "chrome://dta/content/immagini/mp3.png";
		}
		else if (ext.search(/^cp{0,3}|hh?|txt|rtf|p(?:l|m|yc?)|xls|doc|odt$/i) != 1) {
			ico = "chrome://dta/content/immagini/doc.png";
		}
		else if (ext.search(/^x?html?|css|rss|atom|js|xml|xslt?$/i) != -1) {
			ico = "chrome://dta/content/immagini/htm.png";
		}
	} else {
		ico = "moz-icon://" + uri.prePath + uri.path + "?size=16";
	}
	if (!ico) {
		ico = "chrome://dta/content/immagini/other.png"
	}
	elem.setAttribute('src', ico);
}

function unload() { 
	self.close();
}

function downloadElement(url, dir, num, desc1, desc2, mask) {
	this.url = url;
	this.dirSave = dir;	
	this.numIstance = num;
	this.description = desc1;
	this.ultDescription = desc2;
	this.refPage = "";
	this.mask = mask;
}

function startDownload(notQueue) {
try {
	
	Preferences.set("extensions.dta.lastWasQueued", !notQueue);
	
	if (!checkSyntax()) return false;
	
	if (lop == "links") {
		var name = "fileList";
		var listLinks = window.arguments[0];
	} else if (lop == "pics") {
		var name = "imgList";
		var listLinks = window.arguments[1];
	}
		
	var startbutton = $("startbutton");
	var directory = $("directory");
	var fileList = $(name);
	
	// let's check and create the directory
	var f = new filePicker();
	
	if (!f.createValidDestination(directory.value)) {
		alert(strbundle.getString("alertfolder"));
		var newDir = f.getFolder(null, strbundle.getString("validdestination"));
		if (!newDir) {
			directory.value = "";
		} else {
			directory.value = newDir;
		}
		//XXX tell the user what happend!
		return 0;
	}
	// load istance number
	var num = Preferences.get("extensions.dta.numistance", 1);
	if (num < 999) num++; else num = 1;
	Preferences.set("extensions.dta.numistance", num);	
	
	var links = new Array();
	var mask = dropDowns.renaming.getCurrent();
	
	// let's create Array to pass to manager.xul
	for (i in listLinks) {
		if (i != "length" && (listLinks[i].checked || listLinks[i].manuallyChecked)) {
			var el = links.length;
			links[el] = new downloadElement(listLinks[i].url, $("directory").value, num, ("description" in listLinks[i])?listLinks[i].description:"", ("ultDescription" in listLinks[i])?listLinks[i].ultDescription:"", ("mask" in listLinks[i])?listLinks[i].mask:mask);
			links[el].refPage = listLinks[i].refPage;
		}
	}
	if (links.length == 0) return -1;
	
	startbutton.setAttribute("disabled", true);

	DTA_AddingFunctions.sendToDown(notQueue, links);
	
	// save history
	dropDowns.filter.saveDrop(dropDowns.filter.getCurrent());
	dropDowns.directory.saveDrop(dropDowns.directory.getCurrent());
	dropDowns.renaming.saveDrop(dropDowns.renaming.getCurrent());
	
	unload();

} catch(e) {
	alert("Downloadfile():" + e);
	self.close();
}
return 0;
}

function modifyRenaming() {
	if (lop == "links") {
		var name = "file";
		var links = window.arguments[0];
	} else if (lop == "pics") {
		var name = "img";
		var links = window.arguments[1];
	}
	
	var selected = new Array();
	var elem = new Array();
	var tree = $(name+"List");
	var rangeCount = tree.view.selection.getRangeCount();
	
	for(var i=0; i<rangeCount; i++) {
		var start = {}; var end = {};
		tree.view.selection.getRangeAt(i,start,end);
			for(var c=start.value; c<=end.value; c++) {
				var i = tree.view.getCellValue(c, tree.columns.getColumnAt(1));
				selected.push(links[i]);
				elem.push(i);
			}
	}
	
	if (selected.length == 0) return;
	
	window.openDialog("chrome://dta/content/dta/renamingmask.xul", "", "chrome, dialog, centerscreen, resizable=yes, dialog=no, modal, close=no", selected);
	
	for (var i=0; i<selected.length; i++)
		if ("mask" in selected[i])
			$(name+"mask"+elem[i]).setAttribute("label", selected[i].mask);
}

function makeRegex() {
	var v = $("filter").value.replace(/^[ \t/]+|[ \t/]+$/gi, "");
	if ($("regex").checked) {
		$("filter").value = "/" + v + "/";
	} else 
		$("filter").value = v;
}

function createFilter() {
	var filtertxt = "";
	if (!$("regexbox").hidden) {
		var filtertxt = $("filter").value;
		if (filtertxt.substring(0,1) == "/" && filtertxt.substr(filtertxt.length - 1, 1) == "/" && filtertxt.length > 1)
			$("regex").checked = true; else $("regex").setAttribute("checked", false);
	}
	var filtro = new Array(); var fil; var arr;
	for (var i = 0; i < $("checkcontainer").childNodes.length; i++) {
		if ($("checkcontainer").childNodes[i].checked) 
			filtro = convertFilter(Preferences._pref.getCharPref("extensions.dta.context." + $("checkcontainer").childNodes[i].getAttribute("id") + ".filter"), filtro);
	}
	if (filtertxt.replace(/^\s*|\s*$/gi,"") != "")
		filtro = convertFilter(filtertxt.replace(/^\s*|\s*$/gi,""), filtro);
	return filtro;
}

function convertFilter (fil, filtro) {
	if (fil.substring(0,1) == "/" && fil.substring(fil.length - 1, fil.length) == "/") {
		if (fil.substring(1, fil.length - 1).replace(/^\s*|\s*$/gi,"") != "") 
			filtro[filtro.length] = fil.substring(1, fil.length - 1).replace(/^\s*|\s*$/gi,"");
	} else {
		fil = fil.replace(/\./gi, "\\.")
			.replace(/\*/gi, "(.)*")
			.replace(/\$/gi, "\\$")
			.replace(/\^/gi, "\\^")
			.replace(/\+/gi, "\\+")
			.replace(/\?/gi, ".")
			.replace(/\|/gi, "\\|")
			.replace(/\[/gi, "\\[");
			
		var arr = fil.split(",");
		for (var i=0; i<arr.length; i++)
			if (arr[i].replace(/^\s*|\s*$/gi,"") != "") 
				filtro[filtro.length] = arr[i].replace(/^\s*|\s*$/gi,"");
	}
	return filtro;
}

function changeTab(name) {
	
	lop = name;
	var filter = $("filter");
	var box = $("checkcontainer");
	while (box.hasChildNodes())
		box.removeChild(box.lastChild);
	
	if (Preferences.get("extensions.dta.context.numfilters", -1) == -1) {
		try {
	    restoreAll();
		} catch(e) {
			DTA_debug.dump("restoreAll():", e);
		}
	}
	
	var numfilter = nsPreferences.getIntPref("extensions.dta.context.numfilters", 0);
	if (lop == "links") {
		Preferences.set("extensions.dta.context.seltab", 0);
		$("fileList").hidden = false;
		$("imgList").hidden = true;
		$("openlinks").setAttribute("disabled", true); 
		$("openpics").setAttribute("disabled", false);
		
		for (var t=0; t < numfilter; t++) {
			if (nsPreferences.getBoolPref("extensions.dta.context.filter" + t + ".isLinkFilter",false))
				addCheckbox(nsPreferences.getLocalizedUnicharPref("extensions.dta.context.filter" + t + ".caption"),"filter" + t, nsPreferences.getBoolPref("extensions.dta.context.filter" + t + ".checked",false));	
		}
	} else {
		Preferences.set("extensions.dta.context.seltab", 1);
		$("fileList").hidden = true;
		$("imgList").hidden = false;
		$("openlinks").setAttribute("disabled", false);
		$("openpics").setAttribute("disabled", true);
		
		
		for (var t=0; t < numfilter; t++) {
			if (nsPreferences.getBoolPref("extensions.dta.context.filter" + t + ".isImageFilter",false))
				addCheckbox(nsPreferences.getLocalizedUnicharPref("extensions.dta.context.filter" + t + ".caption"),"filter" + t, nsPreferences.getBoolPref("extensions.dta.context.filter" + t + ".checked",false));	
		}
	}
	checkAll();
}

function checkAll() {
	if (lop == "links")
		check("file", window.arguments[0]);
	else
		check("img", window.arguments[1]);
}

function check(name, links) {
	try {
		var filter = createFilter();
		var highli = Preferences.get("extensions.dta.context.highlight", true);
		// checks all the items that passes the filtering
		for (i in links) {
			
			if (i == "length" || typeof(links[i])!="object" ) continue;
			
			for (var x=0; x<filter.length; x++) {
				var reg = new RegExp(filter[x], "i");
				if (i.match(reg) || (links[i].description && links[i].description.match(reg)) || (links[i].ultDescription && links[i].ultDescription.match(reg))) {
					if (!links[i].manuallyChecked && !links[i].checked) {
						links[i].checked = true;
						var tmp = $(name+i);
						tmp.setAttribute("value", true); 
						if (highli) {
							tmp.parentNode.setAttribute("properties" ,"f"+(x%8));
						}
					}
					break;
				}
			}
			
			if (x == filter.length && links[i].checked && !links[i].manuallyChecked) {
				links[i].checked = false;
				var tmp = $(name+i);
				tmp.removeAttribute("value");
				$(name+i).parentNode.removeAttribute("properties");
			}
		}
		
		savepref();
		
		var sel=0;
		for (i in links)
			if (i != "length" && (links[i].checked || links[i].manuallyChecked))
				sel++;
				
		if (sel > 0) 
			$("status").label = strbundle.getFormattedString("selel",[sel,links.length]);
		else
			$("status").label = strbundle.getString("status");
		
	} catch(e) {
		DTA_debug.dump("check():", e);
	}
}

function showFilter() {

	var reg = $("regexbox");
	var add = $("additional");
	
	if (!reg) return;
	
	if (arguments.length == 0) 
		reg.hidden= !(reg.hidden); 
	else 
		reg.hidden = !(arguments[0]);

	if (reg.hidden) {
		add.setAttribute("value", strbundle.getString("additional") + "...");
		add.setAttribute("class", "titolo nonaperto");
	} else {
		add.setAttribute("class", "titolo aperto");
		add.setAttribute("value", strbundle.getString("additional") + ":");
	}
}

function addCheckbox (caption, id, checked) {
	try {
		var box = $("checkcontainer");
		var checkbox = document.createElement("checkbox");
		checkbox.setAttribute("checked", checked);
		checkbox.setAttribute("id", id);
		checkbox.setAttribute("label", caption);
		checkbox.setAttribute("class", "lista");
		checkbox.setAttribute("oncommand", "savepref();checkAll();");
		box.appendChild(checkbox);
	} catch(e) {
		DTA_debug.dump("addCheckbox():", e);
	}
}

function checkItem(event) {
	try {
		
		if (lop == "links") {
			var name = "file";
			var links = window.arguments[0];
		} else if (lop == "pics") {
			var name = "img";
			var links = window.arguments[1];
		}
		
		var tree = $(name+"List");
		var highli = Preferences.get("extensions.dta.context.highlight", true);
		
		var row = new Object;
		var column = new Object;
		var part = new Object;
		
		var boxobject = tree.treeBoxObject;
		boxobject.QueryInterface(Components.interfaces.nsITreeBoxObject);
		boxobject.getCellAt(event.clientX, event.clientY, row, column, part);
		
		if (row.value == -1) return;
		
		var highli = Preferences.get("extensions.dta.context.highlight", true);
		
		var i = tree.view.getCellValue(row.value, tree.columns.getColumnAt(1));
		
		// check the item on central click or on left click on the checkbox
		if ((event.button == 1 && !links[i].manuallyChecked && !links[i].checked)||
			(event.button == 0 && (tree.view.getCellValue(row.value, tree.columns.getColumnAt(0)) == "true" && !(links[i].manuallyChecked || links[i].checked)))) {
			tree.view.setCellValue(row.value, tree.columns.getColumnAt(0), "true");
			links[i].manuallyChecked = true;
			if (highli)
				$(name+i).parentNode.setAttribute("properties" ,"manuallySelected"); 
		// uncheck	
		} else if ((event.button == 1 && (links[i].manuallyChecked || links[i].checked))||
				(event.button == 0 && (tree.view.getCellValue(row.value, tree.columns.getColumnAt(0)) == "false" && (links[i].manuallyChecked || links[i].checked)))){
			tree.view.setCellValue(row.value, tree.columns.getColumnAt(0), "false");
			links[i].manuallyChecked = links[i].checked = false;
			if (highli)
				$(name+i).parentNode.removeAttribute("properties");
		}
		else {
			if (links[i].manuallyChecked || links[i].checked)
				tree.view.setCellValue(row.value, tree.columns.getColumnAt(0), "true");
			else
				tree.view.setCellValue(row.value, tree.columns.getColumnAt(0), "false");
		}

	
		var sel=0;
		for (i in links)
			if (i != "length" && (links[i].checked || links[i].manuallyChecked))
				sel++;
		
		if (sel>0)
			$("status").label = strbundle.getFormattedString("selel",[sel,links.length]);
		else
			$("status").label = strbundle.getString("status");
			
	} catch(e) {
		DTA_debug.dump("checkItem():", e);
	}
}

function checkSelected(check) {

	if (lop == "links") {
		var name = "file";
		var links = window.arguments[0];
	} else if (lop == "pics") {
		var name = "img";
		var links = window.arguments[1];
	}
	
	var tree = $(name+"List");
	var rangeCount = tree.view.selection.getRangeCount();
	var highli = Preferences.get("extensions.dta.context.highlight", true);
	
	for(var x=0; x<rangeCount; x++) {
		var start = {};var end = {};
		tree.view.selection.getRangeAt(x,start,end);
			for(var c=start.value; c<=end.value; c++) {
				var i = tree.view.getCellValue(c, tree.columns.getColumnAt(1));
				var e = $(name+i);
				if (check) {
					links[i].manuallyChecked = true;
					e.setAttribute("value", true);
					if (highli)
						e.parentNode.setAttribute("properties" , "manuallySelected"); 
				} else {
					links[i].manuallyChecked = links[i].checked = false;
					if (e.hasAttribute("value"))
						e.removeAttribute("value");
					if (highli)
						e.parentNode.removeAttribute("properties"); 
				}
			}
	}

	var sel=0;
	for (i in links)
		if (!(i == "length" || typeof(links[i])!="object" ) && (links[i].checked || links[i].manuallyChecked))
			sel++;
	
	if (sel>0)
		$("status").label = strbundle.getFormattedString("selel",[sel,links.length]);
	else
		$("status").label = strbundle.getString("status");
}


// adds links to listbox	
function addLinks(name, links) {
	var list = $(name + "ListChildren");
	list.addEventListener("mousedown", checkItem, true);
	list.addEventListener("keydown", checkItem, true);
	
	var n = 0;
	
	for (i in links) {
		
		if (typeof links[i] != "object")
			continue;
		
		var link = links[i];
		link.checked = false;
		link.manuallyChecked = false;
		
		var lista = $("downfigli");
    
		var itemNode = document.createElement("treeitem");
			
		var treeRow = document.createElement("treerow");
			
		var check = document.createElement("treecell");
		check.setAttribute("value", false);
		check.setAttribute("id", name + i); 

		var url = (typeof link.url == 'string' ? link.url : link.url.usable);
		var urlE = document.createElement("treecell");
		urlE.setAttribute("label", " " + url);
		urlE.setAttribute("value", i);
						
		updateIcon(url, link.metalink, urlE);
			
		var desc = document.createElement("treecell");
		var t = "";
		if ("description" in links[i] && links[i].description.length > 0)
			t += links[i].description;
		if ("ultDescription" in links[i] && links[i].ultDescription.length > 0)
			t += ((t.length > 0) ? ' - ' : '') + links[i].ultDescription;
		desc.setAttribute("label", t);
		
		var ren = document.createElement("treecell");
		ren.setAttribute("label", strbundle.getString("default"));
		ren.setAttribute("id", name + "mask" + i);
						
		treeRow.appendChild(check);
		treeRow.appendChild(urlE);
		treeRow.appendChild(desc);
		treeRow.appendChild(ren);
				
		itemNode.appendChild(treeRow);
		
		if (link.metalink) {
			list.insertBefore(itemNode, list.firstChild);
		}
		else {
			list.appendChild(itemNode);
		}
	}
}

function browseDire() {
	// let's check and create the directory
	var f = new filePicker();
	var newDir = f.getFolder($("directory").value, strbundle.getString("validdestination"));
	if (newDir) $("directory").value = newDir;
	
	var directory = $("directory");
	dropDowns.directory.saveCurrent(false);
}

// Renaming tags reference popup stuff
var listObserver = { 
  onDragStart: function (evt,transferData,action){
    var txt=evt.target.getAttribute("value");
    transferData.data=new TransferData();
    transferData.data.addDataForFlavour("text/unicode",txt);
  }
};

function appendTag(event) {
	var text = $(dropDowns.renaming.idInput);
	var s = text.inputField.selectionStart;
	text.value = text.value.substring(0, s) + event.target.getAttribute("value") + text.value.substring(text.inputField.selectionEnd, text.value.length);
	text.inputField.setSelectionRange(s + event.target.getAttribute("value").length, s + event.target.getAttribute("value").length);
	dropDowns.renaming.saveCurrent(false);
}

// Donation & news stuff
function setDefaultDonation() {
  var frasi = [
	  "Do you like dTa? Well, then please considerer making a small donation.",
	  "Keep dTa always reliable and free. Make a small donation.",
	  "To support further development of dTa, we also need your help.",
	  "We're working hard to provide you the best Download Manager in FF.",
	  "Help us making dTa grow. Consider making a small donation.",
	  "Do you like DTA? Why your friends shouldn't? Help us grow!", 
	  "dTa is updated on a daily basis in our free time. Help us grow!"];
  var random = Math.floor(Math.random() * frasi.length);
  var pezzi = frasi[random];
  $("donate").appendChild(document.createTextNode(pezzi));
  $("donate").setAttribute("sito", "http://www.downthemall.net/index.php?page_id=14");
}

function checkNews() {
try {
		if (donation.readyState==4) {
	var domParser = new DOMParser();
	var doc = domParser.parseFromString(donation.responseText, "text/xml");
	var list = doc.documentElement;
	var latestVersion = new Object();
	var alertMessage = null;
	var defaultLink = "http://www.downthemall.net/index.php?page_id=14";
	var news = new Array();
	var donations = new Array();
	
	
	for (var i=0; i<list.childNodes.length; i++) {
		var down = list.childNodes[i];
		if (!down.tagName) continue;

		switch (down.tagName) {
			case "currentVersion":
				latestVersion.version = down.getAttribute("latestVersion");
				latestVersion.link = down.getAttribute("url");
			break;
			case "alert":
				for (var d=0; d<down.childNodes.length; d++) {
					var el = down.childNodes[d];
					if (el.tagName == "element") {
						alertMessage = new Object();
						alertMessage.link = el.hasAttribute("url")?el.getAttribute("url"):defaultLink;
						alertMessage.shortMessage = el.getAttribute("shortdescription");
						alertMessage.longMessage = el.getAttribute("longdescription");
						alertMessage.title = el.getAttribute("title");
						alertMessage.id = el.getAttribute("id");
						}
				}
			break;
			case "news":
				for (var d=0; d<down.childNodes.length; d++) {
					var el = down.childNodes[d];
					if (el.tagName == "element") {
						var elem = new Object();
						elem.link = el.hasAttribute("url")?el.getAttribute("url"):defaultLink;
						elem.desc = el.getAttribute("description");
						news.push(elem);
					}
				}
			break;
			case "donation":
				for (var d=0; d<down.childNodes.length; d++) {
					var el = down.childNodes[d];
					if (el.tagName == "element") {
						var elem = new Object();
						elem.link = el.hasAttribute("url")?el.getAttribute("url"):defaultLink;
						elem.desc = el.getAttribute("description");
						donations.push(elem);
					}
				}
			break;
		}
	}
	
	var label = $("donate");
	
	if (isNewer(latestVersion.version, currentVersion) && !Preferences.get("extensions.dta.noalert.version"+latestVersion.version, false)) {
		alertCheckVersion(latestVersion.version, "dTa " + latestVersion.version, latestVersion.link);
		label.appendChild(document.createTextNode("dTa " + latestVersion.version + " " + strbundle.getString("available")));
		label.setAttribute("sito", latestVersion.link);
	} else if (alertMessage != null) {
		label.appendChild(document.createTextNode(alertMessage.shortMessage));
		label.setAttribute("sito", alertMessage.link);
		if (!Preferences.get("extensions.dta.noalert.message"+alertMessage.id, false))
			alertCheckMessage(alertMessage);
	} else if (news.length > 0) {
		var r = Math.floor(Math.random() * news.length);
		label.appendChild(document.createTextNode(news[r].desc));
		label.setAttribute("sito", news[r].link);
	} else if (donations.length > 0) {
		var r = Math.floor(Math.random() * donations.length);
		label.appendChild(document.createTextNode(donations[r].desc));
		label.setAttribute("sito", donations[r].link);
	} else
		setDefaultDonation();
		}
} catch(e) {
	DTA_debug.dump("checkNews()",e);
}
}

function alertCheckVersion(version, title, sito) {

	var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
	var checkResult = {};
	
	if (!Preferences.get("extensions.dta.noalert.version"+version, false)) {
		if (promptService.confirmCheck(
			window,
			strbundle.getFormattedString("released",[title]),
			strbundle.getString("wantinfo"),
			strbundle.getString("notanymore"),
			checkResult
		)) {
			DTA_Mediator.openTab(sito);
		}
		if (checkResult.value) 
		{
			Preferences.set("extensions.dta.noalert.version" + version, true);
		}
	}
}

function alertCheckMessage(m) {

	var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
	var checkResult = {};
	
	var flags = promptService.BUTTON_TITLE_IS_STRING * promptService.BUTTON_POS_0 +
		promptService.BUTTON_TITLE_IS_STRING * promptService.BUTTON_POS_1;

	if (!Preferences.get("extensions.dta.noalert.message"+m.id, false)) {
		if (promptService.confirmEx(
			window,
			m.title,
			m.longMessage.replace(/\\n/gi, "\n"),
			flags,
			strbundle.getString("showmemore"),
			strbundle.getString("notinterested"),
			null,
			strbundle.getString("notshowanymore"), 
			checkResult
		) == 0) {
			DTA_Mediator.openTab(m.link);
		}
		if (checkResult.value) {
			Preferences.set("extensions.dta.noalert.message"+m.id, true);
		}
	}
}

function donate() {
	DTA_Mediator.openTab($("donate").getAttribute("sito"));
}
