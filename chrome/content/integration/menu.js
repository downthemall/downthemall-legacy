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

	_str: Components.classes['@mozilla.org/intl/stringbundle;1']
		.getService(Components.interfaces.nsIStringBundleService)
		.createBundle('chrome://dta/locale/menu.properties'),
	
	getString: function(n) {
		try {
			return this._str.GetStringFromName(n);
		} catch (ex) {
			DTA_debug.dump("locale error: " + n, ex);
			return '<error>';
		}
	},
	
	trim : function(t) {
		return t.replace(/^[ \t_]+|[ \t_]+$/gi, '').replace(/(_){2,}/g, "_");
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
	
	// recursively add stuff.
	addLinks : function(aWin, aURLs, aImages, honorSelection) {

		function filterElements(nodes, set) {
			var filtered = [];
			for (var i = 0, e = nodes.length; i < e; ++i) {
				if (set.containsNode(nodes[i], true)) {
					filtered.push(nodes[i]);
				}
			}
		}
	
		try {
		 
			var links = aWin.document.links;
			var images = aWin.document.images;
			var embeds = aWin.document.embeds;
			
			var sel = aWin.getSelection();
			if (honorSelection && sel && !sel.isCollapsed) {
				links = filterElements(links, sel);
				images = filterElements(images, sel);
				embeds = filterElements(embeds, sel);
			}
			
			this.addLinksToArray(links, aURLs, aWin.document);
			this.addImagesToArray(images, aImages, aWin.document);
			this.addImagesToArray(embeds, aImages, aWin.document);
			
		}
		catch (ex) {
			DTA_debug.dump('addLinks', ex);
		}
		
		// do not process further as we just filtered the selection
		if (honorSelection) {
			return;
		}
		
		// recursively process any frames
		if (aWin.frames) {
			for (var i = 0, e = aWin.frames.length; i < e; ++i) {
				this.addLinks(aWin.frames[i], aURLs, aImages);
			}
		}
	},
	
	findLinks : function(turbo, all) {
		try {
			if (turbo) {
				DTA_debug.dump("findLinks(): DtaOneClick request from the user");
			} else {
				DTA_debug.dump("findLinks(): DtaStandard request from the user");
			}

			var windows = [];
			if (!all) {
				var sel = document.commandDispatcher.focusedWindow.getSelection();
				if (sel.isCollapsed) {
					windows.push(DTA_Mediator.getMostRecent().getBrowser().selectedBrowser.contentWindow.top);
				}
				else {
					windows.push(document.commandDispatcher.focusedWindow);
				}
			}
			else {
				var win = DTA_Mediator.getMostRecent().getBrowser();
				win.browsers.forEach(
					function(e) {
						windows.push(e.contentWindow.top);
					}
				);
			}
				

			var urls = {length: 0};
			var images = {length: 0};
			windows.forEach(
				function(win) {
					this.addLinks(win, urls, images, !all);
				},
				this
			);
			if (!urls.length && !images.length) {
				DTA_alert(DTA_getString('error'), this.getString('errornolinks'));
				return;
			}
			
			if (turbo) {
				try {
					DTA_AddingFunctions.saveLinkArray(true, urls, images);
					return;
				} catch (ex) {
					DTA_debug.dump('findLinks', ex);
					DTA_alert(this.getString('error'), this.getString('errorinformation'));
				}
			}
			DTA_AddingFunctions.saveLinkArray(false, urls, images);
		} catch(ex) {
			DTA_debug.dump('findLinks', ex);
		}
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
			
			if (!DTA_AddingFunctions.isLinkOpenable(url)) {
				DTA_alert(this.getString('error'), this.getError('errornodownload'));
				return;
			}
			
			url = new DTA_URL(url, win.document.characterSet);
			var ref = document.commandDispatcher.focusedWindow.document.URL;
			var desc = this.extractDescription(cur);
			if (turbo) {
				try {
					DTA_AddingFunctions.saveSingleLink(true, url, ref, desc);
					return;
				}
				catch (ex) {
					DTA_debug.dump('findSingleLink', ex);
					DTA_alert(this.getString('error'), this.getString('errorinformation'));
				}
			}
			DTA_AddingFunctions.saveSingleLink(false, url, ref, desc);
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
			o.ctx.addEventListener("popupshowing", function (evt) { DTA_ContextOverlay.onContextShowing(evt); }, false);
			o.menu.addEventListener("popupshowing", this.onHideTool, false);

			// prepare ctx object
			// order is important!			
			this.ctx = {};
			['SepBack', 'Pref', 'SepPref', 'TDTA', 'DTA', 'SaveT', 'Save', 'SepFront'].forEach(
				function (e) {
					DTA_ContextOverlay.ctx[e] = document.getElementById('dtaCtx' + e);
				}
			);
			this.ctxBase = document.getElementById('dtaCtxCompact');
			this.ctxMenu = document.getElementById('dtaCtxSubmenu');
			
		} catch (ex) {
			DTA_debug.dump("DCO::init()", ex);
		}
	},
	
	onContextShowing : function(evt) {
		try {
			
			if (evt && evt.target && evt.target.id != 'contentAreaContextMenu') {
				return;
			}
			
			// get settings
			var menu = DTA_preferences.getDTA("ctxmenu", "1,1,0")
				.split(",").map(function(e){return parseInt(e);});
			var compact = DTA_preferences.getDTA("ctxcompact", false);
			
			// all hidden...
			if (menu.indexOf(1) == -1) {
				for (var i in this.ctx) {
					this.ctx[i].hidden = true;
				}
				this.ctxBase.hidden = true;
				return;
			}
			
			// setup menu items
			// show will hold those that will be shown
			var show = [];
			
			// hovering an image or link
			if (gContextMenu && (gContextMenu.onLink || gContextMenu.onImage)) {
				if (menu[0]) {
					show.push('Save');
				}
				if (menu[1]) {
					show.push('SaveT');
				}
				this.ctx.Save.label = this.getString('dtasave' + (gContextMenu.onLink ? 'link' : 'image'));
				this.ctx.SaveT.label = this.getString('turbosave' + (gContextMenu.onLink ? 'link' : 'image'));
			}
			// regular
			else {
				if (menu[0]) {
					show.push('DTA');
				}
				if (menu[1]) {
					show.push('TDTA');
				}
				var sel = document.commandDispatcher.focusedWindow.getSelection();
				sel = sel && !sel.isCollapsed;
				this.ctx.DTA.label = this.getString('dta' + (sel ? 'selection' : 'regular'));
				this.ctx.TDTA.label = this.getString('turbo' + (sel ? 'selection' : 'regular'));
			}
			
			// prefs
			if (menu[2]) {
				show.push('Pref');
				if (compact) {
					show.push('SepPref');
				} else {
					show.push('SepBack');
					show.push('SepFront');
				}
			}
			
			// general setup
			var base = document.getElementById('context-sep-selectall');
			if (compact) {
				this.ctxBase.hidden = false;
				base.parentNode.insertBefore(this.ctxBase, base);
			} else {
				this.ctxBase.hidden = true;
			}
			
			// show the items.
			for (var i in this.ctx) {
				var cur = this.ctx[i];
				cur.hidden = show.indexOf(i) == -1;
				if (cur.hidden) {
					continue;
				}
				if (compact) {
					this.ctxMenu.insertBefore(cur, this.ctxMenu.firstChild);
				} else {
					base.parentNode.insertBefore(cur, base);
					base = cur;
				}
			}
			
			// add separators
			if (!compact) {
				var node = this.ctx.SepFront.previousSibling;
				while (node && node.hidden) {
					node = node.previousSibling;
				}
				if (node && node.nodeName == 'menuseparator') {
					this.ctx.SepFront.hidden = true;
				}
				node = this.ctx.SepBack.nextSibling;
				while (node && node.hidden) {
					node = node.nextSibling;
				}
				if (node && node.nodeName == 'menuseparator') {
					this.ctx.SepBack.hidden = true;
				}			
			}
		} catch(ex) {
			DTA_debug.dump("DTAHide(): ", ex);
		}
	},
	
	onHideTool : function() {try {
		var menuTool = DTA_preferences.getDTA("toolsmenu", "1,1,1").split(",");
		var contextTool = DTA_preferences.getDTA("toolscompact", true); // checks if  the user wants a submenu
		document.getElementById("dta-tool").hidden = !(parseInt(menuTool[0]) && (!contextTool));
		document.getElementById("turbo-tool").hidden = !(parseInt(menuTool[1]) && (!contextTool));
		document.getElementById("dta-manager-tool").hidden = !(parseInt(menuTool[2]) && (!contextTool));
		document.getElementById("dta-menu").hidden = !contextTool; 
		document.getElementById("dta-Popup").hidden = !contextTool;
		document.getElementById("dta-tool-popup").hidden = !parseInt(menuTool[0]);
		document.getElementById("turbo-tool-popup").hidden = !parseInt(menuTool[1]);
		document.getElementById("dta-manager-tool-popup").hidden = !parseInt(menuTool[2]);
	} catch(ex) {
		DTA_debug.dump("DTAHideTool(): " + ex);
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

