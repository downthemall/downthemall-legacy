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

var dropDowns = new Object();
var strbundleB, strbundle;

function checkSyntax() {
	
	// let's check and create the directory
	var f = new filePicker();
	var directory = $("directory");
	if (!directory.value || directory.value.trim().length == 0) return false;
	
	if (f.createValidDestination(directory.value)==false) {
		alert(strbundleB.getString("destination"));
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

function createEl(url, num) {
	if (DTA_AddingFunctions.isLinkOpenable(url)) {
		var el = {
				'url': url,
				'numIstance': num,
				'refPage': $("URLref").value,
				'description': window.arguments ? window.arguments[0].description : '',
				'ultDescription': '',
				'mask': dropDowns.renaming.getCurrent(),
				'dirSave': dropDowns.directory.getCurrent()
			};
			return el;
	} else
		return null;
}

function addURLnow(start) {
try {

		if (!checkSyntax()) {
			alert(strbundleB.getString("correctness"));
			return false;
		}
		
		var url = $("URLaddress").value;
		
		var num = Preferences.get("extensions.dta.numistance", 1);
		num = (num<999)?(++num):1;
		Preferences.set("extensions.dta.numistance", num);
		
		var address = $("URLaddress");
		var url = address.value;
		if (address.hasAttribute('_realURL'))	{
			var url = { url: address.getAttribute('_realURL'), usable: address.value };
		}
			
		var urlsToSend = [];
		
		var batch = new BatchGenerator(url);
		if (!batch.isAString) {
			var URL;
			while ((URL=batch.getNextURL())!=null) {
				var el = createEl(URL, num);
				if (el) urlsToSend.push(el)
			}
		} else {
			var el = createEl(url, num);
			if (el) urlsToSend.push(el)
		}
		
		if (urlsToSend.length == 0)  {
			alert(strbundleB.getString("correctness"));
			return false;
		} else if (urlsToSend.length > 1) {
			
			var desc = strbundleB.getString("from") + "\n" + urlsToSend[0].url.cropCenter(70) + "\n";
			if (urlsToSend.length > 2) desc += strbundleB.getString("to")+"\n";
			desc += urlsToSend[urlsToSend.length-1].url.cropCenter(70);
			
			if (!confirm(strbundleB.getFormattedString("tasks",[urlsToSend.length, desc])))
				return false;
		}
		
		DTA_AddingFunctions.sendToDown(start, urlsToSend);
		
		dropDowns.directory.saveCurrent(false);
		dropDowns.renaming.saveCurrent(false);
		dropDowns.renaming.saveDrop(dropDowns.renaming.getCurrent());
		dropDowns.directory.saveDrop(dropDowns.directory.getCurrent());
			
		window.close();
		return true;
} catch(ex) {
	DTA_debug.dump("addURLnow(): ", ex);
}
	return false;
}

function load() {try {
		strbundleB = $("strings");
		strbundle = $("string");
		
		$("directory").addEventListener("blur", checkSyntax, true);
		
		dropDowns.renaming = new dropDownObject("renaming", "renaming", "renamingitems", "*name*.*ext*", "*name*.*ext*|@|*num*_*name*.*ext*|@|*url*/*name*.*ext*|@|*name* (*text*).*ext*|@|*name* (*hh*-*mm*).*ext*");
		dropDowns.renaming.load();
		dropDowns.directory = new dropDownObject("directory", "directory", "directoryitems", "", "");
		dropDowns.directory.load();
		
		// if we know the file to download
		if (window.arguments) {
			var e = window.arguments[0];
			
			if (!e.url.url) {
				$("URLaddress").value = e.url;
			} else {
				$("URLaddress").value = e.url.usable;
				// this dialog was fired up with a predefined url.
				// changing it would invalidate the usable part of it.
				// so making it readonly is the only option.
				// if a users want to edit it then he should copy/paste the url. :p
				// XXX: reflect readonly state in css
				$("URLaddress").setAttribute('_realURL', e.url.url);
				$("URLaddress").readonly = true;
			}
			
			var refPage = DTA_AddingFunctions.isLinkOpenable(e.refPage) ? e.refPage : null;
			if (refPage) {
				try	{
						refPage = decodeURIComponent(refPage);
				} catch (ex) {}
				$("URLref").value	 = refPage;
			}
			
			if (e.mask) {
				$("renaming").value = e.mask;
			}
		} else {
			// check if there's some URL in clipboard
			var clip = Components.classes["@mozilla.org/widget/clipboard;1"].getService(Components.interfaces.nsIClipboard);
			var trans = Components.classes["@mozilla.org/widget/transferable;1"].createInstance(Components.interfaces.nsITransferable);
			trans.addDataFlavor("text/unicode");
			clip.getData(trans, clip.kGlobalClipboard);
			var str=new Object();
			var strLength=new Object();
			trans.getTransferData("text/unicode",str,strLength);
			if (str) {
				str=str.value.QueryInterface(Components.interfaces.nsISupportsString);
				pastetext=str.data.substring(0,strLength.value / 2);
				if (pastetext.length > 0 && (/^(http|ftp)/).test(pastetext)) {
					$("URLaddress").value = pastetext;
					$("URLaddress").select();
				}
			}
		}
		
	} catch(e) {
	DTA_debug.dump("load():", e);
	}
}

function browseDire() {
	// let's check and create the directory
	var f = new filePicker();
	var newDir = f.getFolder($("directory").value, strbundle.getString("validdestination"));
	if (newDir) $("directory").value = newDir;
	
	var directory = $("directory");
	checkSyntax();
	dropDowns.directory.saveCurrent(false);
}

function appendTag(event) {
	var text = $(dropDowns.renaming.idInput);
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

function unload() {
}

window.addEventListener("load", function() {setTimeout("window.sizeToContent();",0);}, false);

function BatchGenerator(s) {
	this.string = s;
	
	var mN = (/\[\s*(\d+)\s*-\s*(\d+)((\s+step\s*:?\s*\d*)?)\s*\]/).exec(s);
	var mL = (/\[\s*([a-z]{1})\s*-\s*([a-z]{1})((\s+step\s*:?\s*\d*)?)\s*\]/i).exec(s);
	this.isNumerical = (mN && (!mL|| mL.index>mN.index));
	this.isLiteral =   (mL && (!mN|| mN.index>mL.index));
	this.isAString = (this.isNumerical==null && this.isLiteral==null);

	if (this.isAString) return;
	
	if (this.isNumerical) {
		this.start=parseInt(mN[1],10);
		this.end=parseInt(mN[2],10);
		this.padding = "";
		for (var i=((this.end>this.start)?mN[1]:mN[2]).length; (i--)>0;) {
			this.padding=this.padding.concat("0");
		}
		this.match = mN;
	} else if (this.isLiteral) {
		 if(/[a-z]{1}/.test(mL[1]))
				mL[2]=mL[2].toLowerCase();
			else
				mL[2]=mL[2].toUpperCase();
				
			this.start=mL[1].charCodeAt(0);
			this.end=mL[2].charCodeAt(0);
			this.match = mL;
	}
	
	var sM=this.match[3].match(/\s+step\s*:?\s*(\d*)/);
	this.step = (sM?parseInt(sM[1],10):1) * (this.start<=this.end?1:-1);
	this.cursor=this.start;

	this.nextBatch = new BatchGenerator(this.match.input.substring(this.match.index+this.match[0].length));
}

BatchGenerator.prototype = {

	reset: function() {
		this.cursor = this.start;
		if (this.nextBatch) this.nextBatch.reset();	
	},
	
	getNextURL: function() {
   	
    if (this.isAString) return this.string;
    
    if(
    	this.step==0
      || 
      (this.step>0 && this.cursor>this.end)
      || 
      (this.step<0 && this.cursor<this.end)
    ) {
      return null;
    }
    
    var count;
    
    if(this.isLiteral) {
      count=String.fromCharCode(this.cursor);
    } else {
      count=new String(this.cursor);
      if(count.length<this.padding.length) {
        count=this.padding.substring(count.length).concat(count);
      }
    }
    
    var n = this.nextBatch.getNextURL();
    
    if (n==null || this.nextBatch.isAString) {
      this.cursor += this.step;
      if (n==null) {
        this.nextBatch.reset();
        return this.getNextURL();
      }
    }
    
    return this.match.input.substring(0, this.match.index).concat(count).concat(n);
   
  }

}

	
