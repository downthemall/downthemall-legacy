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
 *    Federico Parodi <jimmy2k@gmail.com>
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

addEventListener('load', function() {
	removeEventListener('load', arguments.callee, true);

	function $() {
		if (arguments.length == 1) {
			return document.getElementById(arguments[0]);
		}
		let elements = [];
		for (let i = 0, e = arguments.length; i < e; ++i) {
			let id = arguments[i];
			let element = document.getElementById(id);
			if (element) {
				elements.push(element);
			}
			else {
				debug("requested a non-existing element: " + id);
			}
		}
		return elements;
	}	
	
	function revertUI() {
		['open'].forEach(
			function(e) {
				e = $(e);
				e.parentNode.collapsed = true;		
				e.disabled = true;
			}
		);
		$('normalBox').collapsed = false;
		var nodes = $('normalBox')
			.getElementsByTagName('separator');
		
		for (var i = 0; i < nodes.length; ++i) {
			nodes[i].collapsed = true;
		} 

		$('basicBox').collapsed = true;
		$('normalBox').collapsed = false;
		
		// take care of FlashGot... for now.
		// need to negotiate with the author (and possible other extension authors)
		try {
			gFlashGotDMDialog.init();
			$("flashgot-basic").collapsed = true;
		}
		catch (ex) {
			// no op
		}
		
		// Workaround for bug 371508
		try {
			window.sizeToContent();	
		}
		catch (ex) {
			DTA.Debug.log("sizeToContent Bug: 371508", ex);
			try {
				var btn = document.documentElement.getButton('accept');
				window.innerHeight = btn.boxObject.y + 10; 
			}
			catch (ex) {
				DTA.Debug.log("setting height failed", ex);
			}		
		}				
	}
	
	function download(turbo) {
		ddDirectory.save();
		DTA.saveSingleLink(window, turbo, url, referrer, "");
		let de = document.documentElement;
		try {
			de.removeAttribute('ondialogaccept');
		}
		catch (ex) {
			// no op
		}
		try {
			const NS_BINDING_ABORTED = 0x804b0002;
			dialog.mLauncher.cancel(NS_BINDING_ABORTED);
		}
		catch (ex) {}		
		de.cancelDialog();
	}

	let basicBox = $('basicBox');
	let normalBox = $('normalBox');
	const doRevert = basicBox && (!basicBox.collapsed || (normalBox && normalBox.collapsed));
	const doOverlay = DTA.Preferences.getExt("downloadWin", true);
	if (
		!doOverlay
		&& typeof(gFlashGotDMDialog) == 'undefined'
	) {
		// we do not actually overlay!
		return;
	}
	if (doRevert) {
		revertUI();
	}
	
	if (!doOverlay) {
		// we do not actually overlay!
		// but we revert to help FlashGot ;)
		return;
	}
	
	const normal = $('downthemall');
	const turbo = $('turbodta');
	const turboExec = $('turbodtaexec');
	const mode = $('mode');
	const remember = $("rememberChoice");
	const settingsChange = $("settingsChange");
	
	$('downthemallcontainer').collapsed = false;
	normal.disabled = false;
	
	let url = Cc["@downthemall.net/contenthandling;3"]
		.getService(Ci.dtaIContentHandling)
		.getRedirect(dialog.mLauncher.source);
	let referrer;
	try {
		referrer = dialog.mContext.QueryInterface(Components.interfaces.nsIWebNavigation).currentURI.spec;
	}
	catch(ex) {
		referrer = url.spec;
	}
	
	let ml = DTA.getLinkPrintMetalink(url);
	url = new DTA.URL(ml ? ml : url);

	const ddDirectory = $('tdtalist');
	let mask = DTA.getDropDownValue('renaming');
	if (!($("tdta").hidden = (DTA.getDropDownValue('directory') == '' || !mask))) {
		turbo.disabled = false;
		turboExec.disabled = false;
	}
	
	try {
		switch (DTA.Preferences.getExt('saveasmode', 0)) {
			case 1:
				mode.selectedItem = normal;
				break;
			case 2:
				mode.selectedItem = turbo.disabled ? normal : turbo;
				break;
		}
		if (DTA.Preferences.getExt('saveasmode', 0)) {
			remember.checked = true;
			remember.disabled = false;
		}
	}
	catch (ex) {
		// no op
	}

	mode.addEventListener(
		'select',
		function() {
			let selMode = mode.selectedItem;
			remember.checked = false;
			if (normal == selMode || turbo == selMode) {
				remember.disabled = false;
			}
		},
		false
	);
	ddDirectory.addEventListener('command', function() {
		mode.selectedItem = turbo;
	}, true);

	turboExec.addEventListener('command', function() {
		download(true);
	}, true);

	addEventListener('dialogaccept', function(evt) {
		let selMode = mode.selectedItem;
		if (selMode == normal || selMode == turbo) {
			if (remember.checked) {
				DTA.Preferences.setExt("saveasmode", selMode == normal ? 1 : 2);
			}
			else {
				DTA.Preferences.setExt("saveasmode", 0);
			}
			download(selMode == turbo);			
			evt.stopPropagation();
			evt.preventDefault();
			return;
		}
		DTA.Preferences.setExt("saveasmode", 0);
	}, false); // dialogaccept
	
}, true); // load

(function() {
	let _loader = {};
	Components.utils.import("resource://dta/_apiloader.jsm", _loader);
	_loader.inject(window);
})();