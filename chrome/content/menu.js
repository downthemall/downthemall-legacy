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

	trim : function(t) {
		return t.replace(/^[ \t_]+|[ \t_]+$/gi, "").replace(/(_){2,}/g, "_");
	},
	
	addLinksToArray : function(lnks, urls, doc) {
		var ref = doc.URL;
		if (!('length' in lnks)) {
			return;
		}
		for (var i = 0; i < lnks.length; ++i) {
		
			// remove anchor from url
			var link = lnks[i].href.replace(/#.*$/gi, "");;
			// if it's valid and it's new
			if (!DTA_AddingFunctions.isLinkOpenable(link) || link in urls) {
				continue;
			}
				
			/// XXX: title is also parsed by extractDescription
			/// XXX: is this instance necessary?
			var udesc = '';
			if (lnks[i].hasAttribute('title')) {
				udesc = this.trim(lnks[i].getAttribute('title'));
			}
			urls[link] = {
				'url': new DTA_URL(link, doc.characterSet),
				'refPage': ref,
				'description': this.extractDescription(lnks[i]),
				'ultDescription': udesc
			};
			++urls.length;
			
			var ml = lnks[i].hash.match(/#!metalink3!((?:https?|ftp):.+)$/);
			if (ml && !((ml = ml[1]) in urls)) {
				urls[ml] = {
					'url': new DTA_URL(ml, doc.characterSet),
					'refPage': ref,
					'description': '[metalink] http://www.metalinker.org/',
					'ultDescription': '',
					'metalink': true
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
					'url': new DTA_URL(lnks[i].src, doc.characterSet),
					'refPage': ref,
					'description': desc
				}
				++images.length;
			}
		}
	},
	
	addLinks : function(win, urls, images) {
		try {
		
		 var filterElements = function(nodes, set) {
			 var filtered = [];
			 for (var i = 0; i<nodes.length; ++i) {
				 if (set.containsNode(nodes[i], true))
					 filtered.push(nodes[i]);
			 }
			 return filtered;
		 }
		 
		 var links = (!win.getSelection().isCollapsed)?filterElements(win.document.links, win.getSelection()):win.document.links;
		 var imgs = (!win.getSelection().isCollapsed)?filterElements(win.document.images, win.getSelection()):win.document.images;
		 var embeds = (!win.getSelection().isCollapsed)?filterElements(win.document.embeds, win.getSelection()):win.document.embeds;
		 
		 // fill links array
		 this.addLinksToArray (links, urls, win.document);
		 // fill images/embedded array
		 this.addImagesToArray (imgs, images, win.document);
		 this.addImagesToArray (embeds, images, win.document);

		} catch(e) {
			DTA_debug.dump('addLinks', e);
		}
		
		if (!win.getSelection().isCollapsed) return;
		
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

			var topMostWindowofCurrentTab = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator)
			.getMostRecentWindow("navigator:browser")
			.getBrowser()
			.selectedBrowser
			.contentWindow
			.top;

			if (!document.commandDispatcher.focusedWindow.getSelection().isCollapsed)
				this.addLinks(document.commandDispatcher.focusedWindow, urls, images);
			else
				this.addLinks(topMostWindowofCurrentTab, urls, images);
			
			DTA_AddingFunctions.saveLinkArray(turbo, urls, images);
		} catch(ex) {
			DTA_debug.dump('findLinks', ex);
		}
		return 0;
	},
	
	findSingleLink : function(turbo) {
	
		try {
			var win = document.commandDispatcher.focusedWindow.top;

			var cur = gContextMenu.target;
			
			if (gContextMenu.onLink)
				var tofind = /^a$/i;
			else
				var tofind = /^img$/i;
				
			while (!("tagName" in cur) || !tofind.test(cur.tagName)) {
				cur = cur.parentNode;
			}
			
			var url = gContextMenu.onLink ? cur.href : cur.src;
			if (gContextMenu.onLink) {
				var ml = cur.hash.match(/#!metalink3!((?:https?|ftp):.+)$/);
				if (ml) {
					url = ml[1];
				}
			}			
			
			DTA_AddingFunctions.saveSingleLink(
				turbo,
				new DTA_URL(url, win.document.characterSet),
				document.commandDispatcher.focusedWindow.document.URL,
				this.extractDescription(cur)
			);
		} catch (ex) {
			DTA_debug.dump('findSingleLink: ', ex);
		}
	},
	
	init : function() {
		try {
			var o = {
				ctx: document.getElementById("contentAreaContextMenu"),
				menu: document.getElementById("menu_ToolsPopup")
			};
			if (!o.ctx || !o.menu) {
				o = {
					ctx: document.getElementById("messagePaneContext"),
					menu: document.getElementById("menu_ToolsPopup")
				};
			}
			if (!o.ctx || !o.menu) {
				return;
			}
			o.ctx.addEventListener("popupshowing", this.onHideContext, false);
			o.menu.addEventListener("popupshowing", this.onHideTool, false);
		} catch (ex) {
			DTA_debug.dump("DCO::init()", ex);
		}
	},
	
	onHideContext : function() {try {
		var menu = DTA_preferences.getDTA("menu", "1,1,0").split(",");
		var context = DTA_preferences.getDTA("compactmenu", false);
		document.getElementById("dta-help-tool").hidden = !("openHelp" in window);
		document.getElementById("dta-context-menu").hidden = !context;
		document.getElementById("context-dta-pref").hidden = !(parseInt(menu[2]) && !context);
		document.getElementById("submenu-dta-pref").hidden = !(parseInt(menu[2]) && context);
		document.getElementById("dta-separator").hidden = !(parseInt(menu[2]) && context);
		
		var cm = gContextMenu;
		if (cm && (cm.onLink || cm.onImage) && document.commandDispatcher.focusedWindow.getSelection().isCollapsed) {
			DTA_ContextOverlay.showSingleLinkItems(cm.onImage && !cm.onLink);
		} else {
			DTA_ContextOverlay.showMultipleLinkItems(!document.commandDispatcher.focusedWindow.getSelection().isCollapsed);
		}
	} catch(e) {
		alert("DTAHide(): " + e);
	}
	},
	
	showSingleLinkItems : function(onImage) {
	
		if (onImage) {
			document.getElementById("context-dta-savelink").label = document.getElementById("submenu-dta-savelink").label = "Save image with dTa on...";
			document.getElementById("context-dta-savelinkt").label = document.getElementById("submenu-dta-savelinkt").label = "Start image with DtaOneClick!";
		} else {
			document.getElementById("context-dta-savelink").label = document.getElementById("submenu-dta-savelink").label = "Save link with dTa on...";
			document.getElementById("context-dta-savelinkt").label = document.getElementById("submenu-dta-savelinkt").label = "Start link with DtaOneClick!";
		}
		
		var menu = DTA_preferences.getDTA("menu", "1,1,0").split(",");
		var context = DTA_preferences.getDTA("compactmenu", false);
		document.getElementById("context-dta").hidden = true;
		document.getElementById("submenu-dta").hidden = true;
		document.getElementById("context-tdta").hidden = true;
		document.getElementById("submenu-tdta").hidden = true;
		document.getElementById("context-dta-savelink").hidden = !(parseInt(menu[0]) && !context);
		document.getElementById("submenu-dta-savelink").hidden = !(parseInt(menu[0]) && context);
		document.getElementById("context-dta-savelinkt").hidden = !(parseInt(menu[1]) && !context);
		document.getElementById("submenu-dta-savelinkt").hidden = !(parseInt(menu[1]) && context);
	}, 
	
	showMultipleLinkItems : function (onSelection) {
	
		if (onSelection) {
			document.getElementById("context-dta").label = document.getElementById("submenu-dta").label = "DownThemAll! selection...";
			document.getElementById("context-tdta").label = document.getElementById("submenu-tdta").label = "DtaOneClick selection!";
		} else {
			document.getElementById("context-dta").label = document.getElementById("submenu-dta").label = "DownThemAll!...";
			document.getElementById("context-tdta").label = document.getElementById("submenu-tdta").label = "DtaOneClick!";
		}
		
		var menu = DTA_preferences.getDTA("menu", "1,1,0").split(",");
		var context = DTA_preferences.getDTA("compactmenu", false);
		document.getElementById("context-dta-savelink").hidden = true;
		document.getElementById("submenu-dta-savelink").hidden = true;
		document.getElementById("context-dta-savelinkt").hidden = true;
		document.getElementById("submenu-dta-savelinkt").hidden = true;
		document.getElementById("context-dta").hidden = !(parseInt(menu[0]) && !context);
		document.getElementById("submenu-dta").hidden = !(parseInt(menu[0]) && context);
		document.getElementById("context-tdta").hidden = !(parseInt(menu[1]) && !context);
		document.getElementById("submenu-tdta").hidden = !(parseInt(menu[1]) && context);
	},
	
	onHideTool : function() {try {
		var menuTool = DTA_preferences.getDTA("menu", "1,1,1").split(",");
		var contextTool = DTA_preferences.getDTA("compactmenu", true); // checks if  the user wants a submenu
		document.getElementById("dta-tool").hidden = !(parseInt(menuTool[0]) && (!contextTool));
		document.getElementById("turbo-tool").hidden = !(parseInt(menuTool[1]) && (!contextTool));
		document.getElementById("dta-manager-tool").hidden = !(parseInt(menuTool[2]) && (!contextTool));
		document.getElementById("dta-menu").hidden = !contextTool; 
		document.getElementById("dta-Popup").hidden = !contextTool;
		document.getElementById("dta-tool-popup").hidden = !parseInt(menuTool[0]);
		document.getElementById("turbo-tool-popup").hidden = !parseInt(menuTool[1]);
		document.getElementById("dta-manager-tool-popup").hidden = !parseInt(menuTool[2]);
	} catch(ex) {
		alert("DTAHideTool(): ", ex);
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
		} catch(ex) {
			DTA_debug.dump('extractDescription', ex);
		}
		return this.trim(rv);
	}
}

window.addEventListener("load", function() {DTA_ContextOverlay.init();}, false);

