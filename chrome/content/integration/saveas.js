/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See LICENSE and GPL for details.
 *
 * ***** END LICENSE BLOCK ***** */

var DTA_SaveAs = {
	init: function dd_init() {
	
		var basicBox = document.getElementById('basicBox');
		const doRevert = basicBox && !basicBox.collapsed;
		const doOverlay = DTA_preferences.getDTA("downloadWin", true);
		if (
			!doOverlay
			&& typeof(gFlashGotDMDialog) == 'undefined'
		) {
			// we do not actually overlay!
			return;
		}
		if (doRevert) {
			// revert mofo bug #315536
			// https://bugzilla.mozilla.org/show_bug.cgi?id=315536
			window.setTimeout(
				function() {
					DTA_SaveAs.revertUI();
				},
				0
			);
			
		}
		
		if (!doOverlay) {
			// we do not actually overlay!
			// but we revert to help FlashGot ;)
			return;
		}
		document.getElementById('downthemallcontainer').collapsed = false;
		document.getElementById('downthemall').disabled = false;
		
		this.dialog = dialog;
		this.url = dialog.mLauncher.source.spec;
		try {
			this.referrer = dialog.mContext.QueryInterface(Components.interfaces.nsIWebNavigation).currentURI.spec;
  	}
		catch(ex) {
			this.referrer = this.url;
		}
		this.url = new DTA_URL(this.url);

		this.ddDirectory = document.getElementById('tdtalist');
		var mask = DTA_AddingFunctions.getDropDownValue('renaming');
		if (!(document.getElementById("tdta").collapsed = (!DTA_AddingFunctions.getDropDownValue('directory') || !mask))) {
			document.getElementById('turbodta').disabled = false;
		}
		
		
		this.remember = document.getElementById("rememberChoice");
		
		// aggiungo la nostra proprietà senza sovrascrivere le rimanenti
		document.documentElement.setAttribute('ondialogaccept', 'if(DTA_SaveAs.dialogAccepted()) { ' + document.documentElement.getAttribute('ondialogaccept') +'}');
		
		document.getElementById("mode").addEventListener("select", 
			function(event) {
				DTA_SaveAs.onSelect(); 
			},  
			false
		);
	},
	
	revertUI: function dd_revertUI() {
		['open', 'rememberChoice'].forEach(
			function(e) {
				e = document.getElementById(e);
				e.parentNode.collapsed = true;		
				e.disabled = true;
			}
		);
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
		try {
			gFlashGotDMDialog.init();
			document.getElementById("flashgot-basic").collapsed = true;
		}
		catch (ex) {
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
	
	selectTurbo: function dd_selectTurbo(event) {
		document.getElementById("mode").selectedItem = document.getElementById("turbodta");
		return true;
	},

	dialogAccepted: function dd_accept() {
		var mode = document.getElementById("mode").selectedItem;
		var dta = document.getElementById("downthemall");
		var tdta = document.getElementById("turbodta");
		
		DTA_preferences.setDTA("autoSaveDm.dta", mode==dta && this.remember.checked);
		DTA_preferences.setDTA("autoSaveDm.tdta", mode==tdta && this.remember.checked);
		
		if (mode == dta) {
			this.download(false);
		  return false;
		}
		else if (mode == tdta) {
			this.download(true);
		  return false;
		}
	  return true;
	},

	download: function(turbo) {
		this.ddDirectory.save();
		DTA_AddingFunctions.saveSingleLink(turbo, this.url, this.referrer, "");
		document.documentElement.removeAttribute('ondialogaccept');
		document.documentElement.cancelDialog();
	}
}
window.addEventListener(
	"load",
	function(){ DTA_SaveAs.init(); },
	false
);
