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
 
// DTA context overlay

var DTA_ContextOverlay = {

	textToSubURI : Components.classes["@mozilla.org/intl/texttosuburi;1"]
		.getService(Components.interfaces.nsITextToSubURI),

	trim : function(t) {
		return t.replace(/^[ \t_]+|[ \t_]+$/gi, "").replace(/(_){2,}/g, "_");
	},
	
	getUsableURL: function(doc, url)	{
		return { 'url': url, usable: this.textToSubURI.UnEscapeAndConvert(doc.characterSet, url) };
	},
	
	addLinksToArray : function(lnks, urls, doc) {
		var ref = doc.URL;
		for (var i = 0; i < lnks.length; ++i) {
			// remove anchor from url
			var link = lnks[i].href.replace(/#.*/gi, "");
			// if it's valid and it's new
			if (DTA_AddingFunctions.isLinkOpenable(link) && !(link in urls)) {
				
				/// XXX: title is also parsed by extractDescription
				/// XXX: is this instance necessary?
				var udesc = '';
				if (lnks[i].hasAttribute('title')) {
					udesc = this.trim(lnks[i].getAttribute('title'));
				}
				urls[link] = {
					'url': this.getUsableURL(doc, link),
					'refPage': ref,
					'description': this.extractDescription(lnks[i]),
					'ultDescription': udesc
				};
				++urls.length;
			}
		}
	},
	
	addImagesToArray : function(lnks, images, doc)	{
		var ref = doc.URL;
		
		if (!lnks || !lnks.length) {
			return;
		}

		for (var i = 0; i<lnks.length; ++i) {
			// if it's valid and it's new
			if (DTA_AddingFunctions.isLinkOpenable(lnks[i].src) && !(lnks[i].src in images)) {
				// add to array
				var desc = '';
				if (lnks[i].hasAttribute('alt')) {
					desc = this.trim(lnks[i].getAttribute('alt'));
				} else if (lnks[i].hasAttribute('title')) {
					desc = this.trim(lnks[i].getAttribute('title'));
				}
				images[lnks[i].src] = {
					'url': this.getUsableURL(doc, lnks[i].src),
					'refPage': ref,
					'description': desc
				}
				++images.length;
			}
		}
	},
	
	addLinks : function(win, urls, images) {
		try {
			if (win.document) {
				// fill links array
				this.addLinksToArray (win.document.links, urls, win.document);
				// fill images/embedded array
				this.addImagesToArray (win.document.images, images, win.document);
				this.addImagesToArray (win.document.embeds, images, win.document);
			}
		} catch(e) {
			DTA_debug.dump('addLinks', e);
		}
		if (win.frames && win.frames.length > 0) {
			for (var i = 0; i<win.frames.length; i++) {
				this.addLinks(win.frames[i], urls, images);
			}
		}
	},
	
	findLinks : function(turbo) {
		try {
		
			if (turbo) {
				DTA_debug.dump("findLinks(): DtaOneClick request from the user");
			} else {
				DTA_debug.dump("findLinks(): DtaStandard request from the user");
			}
			
			var urls = new Object();
			urls.length = 0;
			var images = new Object();
			images.length = 0;

			var win = document.commandDispatcher.focusedWindow.top;
			this.addLinks(win, urls, images);
			
			DTA_AddingFunctions.saveLinkArray(turbo, urls, images);
		} catch(e) {
			DTA_debug.dump('findLinks', e);
		}
		return 0;
	},
	
	findSingleLink : function(turbo) {
	
		try {
			var win = document.commandDispatcher.focusedWindow.top;

			var cur = gContextMenu.target;
			while (!("tagName" in cur) || cur.tagName.toLowerCase() != "a") {
				cur = cur.parentNode;
			}

			DTA_AddingFunctions.saveSingleLink(
				turbo,
				this.getUsableURL(win.document, cur.href),
				document.commandDispatcher.focusedWindow.document.URL,
				this.extractDescription(cur)
			);
		} catch (e) {
			Debug.dump('findSingleLink', e);
		}
	},
	
	init : function() {
		try {
			document.getElementById("contentAreaContextMenu").addEventListener("popupshowing", this.onHideContext, false);
			document.getElementById("menu_ToolsPopup").addEventListener("popupshowing", this.onHideTool, false);
		} catch (e) {}
		
		try {
			document.getElementById("messagePaneContext").addEventListener("popupshowing", this.onHideContext, false);
			document.getElementById("taskPopup").addEventListener("popupshowing", this.onHideTool, false);
		} catch(e){}
	},
	
	onHideContext : function() {try {
		var menu = DTA_AddingFunctions.getPreference("extensions.dta.context.menu", "1,1,0").split(",");
		var context = DTA_AddingFunctions.getPreference("extensions.dta.context.compactmenu", false);
		document.getElementById("dta-help-tool").hidden = !("openHelp" in window);
		document.getElementById("dta-context-menu").hidden = !context;
		document.getElementById("context-dta-pref").hidden = !(parseInt(menu[2]) && !context);
		document.getElementById("submenu-dta-pref").hidden = !(parseInt(menu[2]) && context);
		document.getElementById("dta-separator").hidden = !(parseInt(menu[2]) && context);
		var cm = gContextMenu;
		if (cm && cm.onLink) {
			document.getElementById("context-dta").hidden = true;
			document.getElementById("submenu-dta").hidden = true;
			document.getElementById("context-tdta").hidden = true;
			document.getElementById("submenu-tdta").hidden = true;
			document.getElementById("context-dta-savelink").hidden = !(parseInt(menu[0]) && !context);
			document.getElementById("submenu-dta-savelink").hidden = !(parseInt(menu[0]) && context);
			document.getElementById("context-dta-savelinkt").hidden = !(parseInt(menu[1]) && !context);
			document.getElementById("submenu-dta-savelinkt").hidden = !(parseInt(menu[1]) && context);
		} else {
			document.getElementById("context-dta-savelink").hidden = true;
			document.getElementById("submenu-dta-savelink").hidden = true;
			document.getElementById("context-dta-savelinkt").hidden = true;
			document.getElementById("submenu-dta-savelinkt").hidden = true;
			document.getElementById("context-dta").hidden = !(parseInt(menu[0]) && !context);
			document.getElementById("submenu-dta").hidden = !(parseInt(menu[0]) && context);
			document.getElementById("context-tdta").hidden = !(parseInt(menu[1]) && !context);
			document.getElementById("submenu-tdta").hidden = !(parseInt(menu[1]) && context);
		}
	} catch(e) {
		alert("DTAHide(): " + e);
	}
	},
	
	onHideTool : function() {try {
		var menuTool = DTA_AddingFunctions.getPreference("extensions.dta.tool.menu", "1,1,1").split(",");
		var contextTool = DTA_AddingFunctions.getPreference("extensions.dta.tool.compactmenu", true); // checks if  the user wants a submenu
	
		document.getElementById("dta-tool").hidden = !(parseInt(menuTool[0]) && (!contextTool));
		document.getElementById("turbo-tool").hidden = !(parseInt(menuTool[1]) && (!contextTool));
		document.getElementById("dta-manager-tool").hidden = !(parseInt(menuTool[2]) && (!contextTool));
		document.getElementById("dta-menu").hidden = !contextTool; 
		document.getElementById("dta-Popup").hidden = !contextTool;
		document.getElementById("dta-tool-popup").hidden = !parseInt(menuTool[0]);
		document.getElementById("turbo-tool-popup").hidden = !parseInt(menuTool[1]);
		document.getElementById("dta-manager-tool-popup").hidden = !parseInt(menuTool[2]);
	} catch(e) {
		alert("DTAHideTool(): " + e);
	}
	},
	
	extractDescription : function(child) {
		try {
			var rv = "";
			if (child.hasChildNodes()) {
				for (var x = 0; x < child.childNodes.length; x++) {
					var c = child.childNodes[x];

					if (c.nodeValue && c.nodeValue != "") {
						rv += c.nodeValue.replace(/(\n){1,}/gi, " ").replace(/(\s){2,}/gi, " ");
					}

					if (c.nodeType == 1) {
						rv += this.extractDescription(c);
					}

					if (c.hasAttribute)
					{
						if (c.hasAttribute('title')) {
							rv += c.getAttribute('title').replace(/(\n){1,}/gi, " ").replace(/(\s){2,}/gi, " ") + " ";	
						} else if (c.hasAttribute('alt')) {
							rv += c.getAttribute('alt').replace(/(\n){1,}/gi, " ").replace(/(\s){2,}/gi, " ") + " ";
						}
					}
				}
			}
		} catch(e) {
			Debug.dump('extractDescription', e);
		}
		return this.trim(rv);
	}
}

window.addEventListener("load", function() {DTA_ContextOverlay.init();}, false);

