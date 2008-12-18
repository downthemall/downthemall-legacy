/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
 *
 * ***** END LICENSE BLOCK ***** */

var strbundle;
var dropDowns = new Object();

var canvas, d;

function draw() {
	
	var c = d.firstChunk;
	canvas.clearRect(0,0,300,20);

	var prog = canvas.createLinearGradient(0,0,0,16);
	prog.addColorStop(0, 'rgba(96,165,1,255)');
	prog.addColorStop(1, 'rgba(123,214,1,255)');

	var compl = canvas.createLinearGradient(0,0,0,16);
	compl.addColorStop(0, 'rgba(13,141,15,255)');
	compl.addColorStop(1, 'rgba(0,199,56,255)');
	
	var join = "#A5FE2C";
	
	var cancel = canvas.createLinearGradient(0,0,0,16);
	cancel.addColorStop(0, 'rgba(151,58,2,100)');
	cancel.addColorStop(1, 'rgba(255,0,0,100)');
	
	var normal = canvas.createLinearGradient(0,0,0,16);
	normal.addColorStop(0, 'rgba(255,255,255,50)');
	normal.addColorStop(1, '#ECE9D8');
	
	canvas.fillStyle = normal;
	canvas.fillRect(0,0,300,20);

	if (d.isCompleted) {
		canvas.fillStyle = compl;
		canvas.fillRect(0,0,300,20);
		canvas.fillStyle = join;
		if (d.join == null || !d.totalSize)
			canvas.fillRect(0,16,300,4);
		else
			canvas.fillRect(0,16,Math.round(d.join.offset/d.totalSize*300),4);
	} else if (d.isCanceled) {
		canvas.fillStyle = cancel;
		canvas.fillRect(0,0,300,20);
	} else if (d.isStarted && d.totalSize) {
		while (c != -1) {
			canvas.fillStyle=prog;
			canvas.fillRect(Math.round(d.chunks[c].start/d.totalSize*300),0,Math.round(d.chunks[c].chunkSize/d.totalSize*300),20);
			c = d.chunks[c].next;
		}
		canvas.fillStyle = join;
		if (d.join == null)
			canvas.fillRect(0,16,Math.round(d.chunks[d.firstChunk].chunkSize/d.totalSize*300),4);
		else
			canvas.fillRect(0,16,Math.round(d.join.offset/d.totalSize*300),4);
	}
	
	setTimeout("draw()", 100);
}

function load() {
try {
	strbundle = document.getElementById("strings");
	canvas = document.getElementById("draw").getContext("2d");
	
	document.getElementById("directory").addEventListener("blur", checkSyntax, true);
	
	// load dropdownns
	dropDowns.renaming = new dropDownObject("renaming", "renaming", "renamingitems", "*name*.*ext*", "*name*.*ext*|@|*num*_*name*.*ext*|@|*url*/*name*.*ext*|@|*name* (*text*).*ext*|@|*name* (*hh*-*mm*).*ext*");
	dropDowns.renaming.load();
	dropDowns.directory = new dropDownObject("directory", "directory", "directoryitems", "", "");
	dropDowns.directory.load();
	
	// d is an Array of Downloads
	d = window.arguments[0];

	if (d.length == 1) {
		document.getElementById("infoURL").value = d[0].url;
		document.getElementById("sourcePage").value = d[0].refPage.spec;
		document.getElementById(dropDowns.renaming.idInput).value = d[0].mask;
		document.getElementById(dropDowns.directory.idInput).value = d[0].originalDirSave;
		document.getElementById("image").setAttribute("src", "moz-icon://"+ d.fileName+"?size=32");
		d = d[0];
		draw();
	} else {
		document.getElementById("infoURL").value = document.getElementById("sourcePage").value = "---";
		
		for (var count=1; count<d.length; count++)
			if (String(d[count-1].mask) != String(d[count].mask)) break;
		document.getElementById(dropDowns.renaming.idInput).value = (count==d.length)?d[0].mask:"---";
	
		for (var count=1; count<d.length; count++) 			
			if (String(d[count-1].originalDirSave) != String(d[count].originalDirSave))
				break;
		
		document.getElementById(dropDowns.directory.idInput).value = (count==d.length)?d[0].originalDirSave:"---";
		
		var normal = canvas.createLinearGradient(0,0,0,16);
		normal.addColorStop(0, 'rgba(255,255,255,50)');
		normal.addColorStop(1, '#ECE9D8');
		
		canvas.fillStyle = normal;
		canvas.fillRect(0,0,300,20);
	}
} catch(e) {
	DTA_debug.dump("load:", e);
}
}

function unload() {
	if (!checkSyntax()) return false;
	
	var t = window.arguments[0];
	var win = window.arguments[1];
	
	for (var i=0; i<t.length; i++) {
		d = t[i];
		if (!(d.isCompleted && !d.isPassed)) {
			if (document.getElementById(dropDowns.directory.idInput).value.trim().length>0)
				d.originalDirSave = document.getElementById(dropDowns.directory.idInput).value.trim().addFinalSlash();

			if (document.getElementById(dropDowns.renaming.idInput).value.trim().length>0)
				d.mask = document.getElementById(dropDowns.renaming.idInput).value.trim();
			
			d.destinationName = d.fileName;
			d.destinationName = d.buildFromMask(false, d.mask);
			d.dirSave = d.originalDirSave;
			d.dirSave = d.buildFromMask(true, d.mask);
			
			d.setTreeCell("dir", d.originalDirSave);
			d.setTreeCell("mask", d.mask);
			
			d.checkFilenameConflict();
		}
	}
	return true;
}

function browseDire() {
	// let's check and create the directory
	var f = new filePicker();
	var newDir = f.getFolder(document.getElementById("directory").value, strbundle.getString("validdestination"));
	if (newDir) document.getElementById("directory").value = newDir;
	
	var directory = document.getElementById("directory");
	checkSyntax();
	dropDowns.directory.saveCurrent(false);
}

function checkSyntax() {
	// let's check and create the directory
	var f = new filePicker();
	var directory = document.getElementById("directory");
	
	if (directory.value.trim().length == 0) return false;
	
	if (!f.createValidDestination(directory.value)) {
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

function appendTag(event) {
	var text = document.getElementById(dropDowns.renaming.idInput);
	var s = text.inputField.selectionStart;
	text.value = text.value.substring(0, s) + event.target.getAttribute("value") + text.value.substring(text.inputField.selectionEnd, text.value.length);
	text.inputField.setSelectionRange(s + event.target.getAttribute("value").length, s + event.target.getAttribute("value").length);
}

var listObserver = {
  onDragStart: function (evt,transferData,action){
    var txt=evt.target.getAttribute("value");
    transferData.data=new TransferData();
    transferData.data.addDataForFlavour("text/unicode", txt);
  }
}

window.addEventListener("load", function() {setTimeout("window.sizeToContent();",0);}, false);