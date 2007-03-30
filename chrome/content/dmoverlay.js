/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
 *
 * ***** END LICENSE BLOCK ***** */

var DtaDialog = {
	init: function dd_init() {

		this.dialog = dialog;
		this.url = dialog.mLauncher.source.spec;
		try {
			this.referrer=dialog.mContext.QueryInterface(Components.interfaces.nsIWebNavigation).currentURI.spec;
  		} catch(ex) {
			this.referrer=this.url;
		}

		var old = DTA_AddingFunctions.getPreference("extensions.dta.directory", "").split("|");
		var dir = DTA_AddingFunctions.getPreference("extensions.dta.dropdown.directory-current", old[0]);
		
		if (dir.length > 0) {
			document.getElementById("directoryturbodta").setAttribute("hidden", "false");
			document.getElementById("directoryturbodta").setAttribute("value", document.getElementById("directoryturbodta").value + " " + dir);		
		} else {
			document.getElementById("tdownthemallbox").setAttribute("hidden","true");
			document.getElementById("directoryturbodtabox").setAttribute("hidden","true");
		}
		
		try {
			// se dalle nostre preferenze si deseleziona il fatto di metterlo
			var saveEnabled = DTA_AddingFunctions.getPreference("extensions.dta.context.downloadWin", true);
			if (!saveEnabled) {
				document.getElementById("downthemallbox").setAttribute("hidden","true");
				document.getElementById("tdownthemallbox").setAttribute("hidden","true");
				document.getElementById("directoryturbodtabox").setAttribute("hidden","true");
			}
		} catch (e) {}
		
		this.remember=document.getElementById("rememberChoice");
		
		// aggiungo la nostra proprietà senza sovrascrivere le rimanenti
		document.documentElement.setAttribute('ondialogaccept', 'if(DtaDialog.dialogAccepted()) { ' + document.documentElement.getAttribute('ondialogaccept') +'}');
		
		document.getElementById("mode").addEventListener("select", 
			function(event) {
				DtaDialog.onSelect(); 
			},  
		false);
		var basicBox = document.getElementById('basicBox');
		if (basicBox && !basicBox.collapsed) {
			// revert mofo bug #315536
			// https://bugzilla.mozilla.org/show_bug.cgi?id=315536
			window.setTimeout(
				function() {
					DtaDialog.revertUI();
				},
				0
			);
			
		}
	},
	
	revertUI: function dd_revertUI() {
		document.getElementById('open').parentNode.collapsed = true;
		document.getElementById('rememberChoice').parentNode.collapsed = true;
		document.getElementById('normalBox').collapsed = false;
		var nodes = document.getElementById('normalBox')
			.getElementsByTagName('separator');
		
		for (var i = 0; i < nodes.length; ++i) {
			nodes[i].collapsed = true;
		} 

		document.getElementById('basicBox').collapsed = true;
		document.getElementById('normalBox').collapsed = false;
		window.sizeToContent();
		
		// take care of FlashGot... for now.
		// need to negotiate with the author (and possible other extension authors)
		if (gFlashGotDMDialog)
		{
			gFlashGotDMDialog.init();
			document.getElementById("flashgot-basic").collapsed = true;
		} else {
			window.sizeToContent();
		}
	},

	onSelect: function dd_select(event) {
	/*
		// problema di remember con Flashgot
		var mode = document.getElementById("mode").selectedItem;
		var dta = document.getElementById("downthemall");
		var tdta = document.getElementById("turbodta");
		var remember = document.getElementById("rememberChoice");
		
		if ( mode==dta || mode==tdta ) {
			remember.setAttribute("disabled", "true");
			alert("dta1");
		} else {
			remember.removeAttribute("disabled");
			alert("dta2");
		}
	*/
	},

	dialogAccepted: function dd_accept() {
		//se è quello selezionato
		var mode = document.getElementById("mode").selectedItem;
		var dta = document.getElementById("downthemall");
		var tdta = document.getElementById("turbodta");
		
		DTA_AddingFunctions._pref.setBoolPref("extensions.dta.context.autoSaveDm.dta", mode==dta && this.remember.checked);
		DTA_AddingFunctions._pref.setBoolPref("extensions.dta.context.autoSaveDm.tdta", mode==tdta && this.remember.checked);
		
		if (mode==dta)  {
				this.download(false);
		  return false;
		} else if (mode==tdta) {
				this.download(true);
		  return false;
		} else {
		  return true;
		}
	},

	download: function(turbo) {
		DTA_AddingFunctions.saveSingleLink(turbo, this.url, this.referrer, "");
		document.documentElement.removeAttribute('ondialogaccept');
		document.documentElement.cancelDialog();
	}
}
window.addEventListener(
	"load",
	function(){DtaDialog.init();},
	false
);
