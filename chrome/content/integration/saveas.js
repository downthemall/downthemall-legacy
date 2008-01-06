/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is DownThemAll!
 *
 * The Initial Developers of the Original Code are Stefano Verna and Federico Parodi
 * Portions created by the Initial Developers are Copyright (C) 2004-2007
 * the Initial Developers. All Rights Reserved.
 *
 * Contributor(s):
 *    Stefano Verna
 *    Federico Parodi
 *    Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var DTA_SaveAs = {
	init: function dd_init() {

		var basicBox = document.getElementById('basicBox');
		var normalBox = document.getElementById('normalBox');
		const doRevert = basicBox && (!basicBox.collapsed || (normalBox && normalBox.collapsed));
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
		
		this.normal = document.getElementById('downthemall');
		this.turbo = document.getElementById('turbodta');
		this.mode = document.getElementById('mode');
		this.remember = document.getElementById("rememberChoice");
		this.settingsChange = document.getElementById("settingsChange");
		
		document.getElementById('downthemallcontainer').collapsed = false;
		this.normal.disabled = false;
		
		this.dialog = dialog;
		this.url = dialog.mLauncher.source.spec;
		try {
			this.referrer = dialog.mContext.QueryInterface(Components.interfaces.nsIWebNavigation).currentURI.spec;
  	}
		catch(ex) {
			this.referrer = this.url;
		}
		var ml = DTA_getLinkPrintMetalink(this.url);
		this.url = new DTA_URL(ml ? ml : this.url);

		this.ddDirectory = document.getElementById('tdtalist');
		var mask = DTA_AddingFunctions.getDropDownValue('renaming');
		if (!(document.getElementById("tdta").collapsed = (!DTA_AddingFunctions.getDropDownValue('directory') || !mask))) {
			this.turbo.disabled = false;
		}
		
		try {
			switch (DTA_preferences.getDTA('saveasmode', 0)) {
				case 1:
					this.mode.selectedItem = this.normal;
					break;
				case 2:
					this.mode.selectedItem = this.turbo.disabled ? this.normal : this.turbo;
					break;
			}
			if (DTA_preferences.getDTA('saveasmode', 0)) {
				this.remember.checked = true;
				this.remember.disabled = false;
			}
		}
		catch (ex) {}

		document.documentElement.setAttribute(
			'ondialogaccept',
			'if(DTA_SaveAs.dialogAccepted()) { '
			+ document.documentElement.getAttribute('ondialogaccept')
			+ '}'
		);
		this.mode.addEventListener(
			'select',
			function(evt) {
				DTA_SaveAs.select(evt);
			},
			false
		);
	},
	
	revertUI: function dd_revertUI() {
		['open'].forEach(
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
		this.sizeToContent();
		
		// take care of FlashGot... for now.
		// need to negotiate with the author (and possible other extension authors)
		try {
			gFlashGotDMDialog.init();
			document.getElementById("flashgot-basic").collapsed = true;
		}
		catch (ex) {
			this.sizeToContent();
		}		
	},
	
	// Workaround for bug 371508
	sizeToContent: function() {
		try {
			window.sizeToContent();	
		}
		catch (ex) {
			DTA_debug.dump("sizeToContent Bug: 371508", ex);
			try {
				var btn = document.documentElement.getButton('accept');
				window.innerHeight = btn.boxObject.y + 10; 
			}
			catch (ex) {
				DTA_debug.dump("setting height failed");
			}		
		}
	},	
	select: function dd_select(evt) {
		var mode = this.mode.selectedItem;
		this.remember.checked = false;
		if (this.normal == mode || this.turbo == mode) {
			this.remember.disabled = false;
		}
	},
	
	selectTurbo: function dd_selectTurbo(event) {
		document.getElementById("mode").selectedItem = document.getElementById("turbodta");
		return true;
	},

	dialogAccepted: function dd_accept() {
		var mode = this.mode.selectedItem;
		if (mode == this.normal || mode == this.turbo) {
			if (this.remember.checked) {
				DTA_preferences.setDTA("saveasmode", mode == this.normal ? 1 : 2);
			}
			else {
				DTA_preferences.setDTA("saveasmode", 0);
			}
			this.download(mode == this.turbo);			
			return false;
		}
		DTA_preferences.setDTA("saveasmode", 0);		
	  return true;
	},
	
	download: function(turbo) {
		this.ddDirectory.save();
		DTA_AddingFunctions.saveSingleLink(turbo, this.url, this.referrer, "");
		document.documentElement.removeAttribute('ondialogaccept');
		document.documentElement.cancelDialog();
	}
}
addEventListener(
	"load",
	function(){ DTA_SaveAs.init(); },
	false
);