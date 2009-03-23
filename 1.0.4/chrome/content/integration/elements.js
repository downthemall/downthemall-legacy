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
 * Portions created by the Initial Developers are Copyright (C) 2004-2008
 * the Initial Developers. All Rights Reserved.
 *
 * Contributor(s):
 *    Stefano Verna
 *    Federico Parodi <f.parodi@tiscali.it>
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
	
	trim: function(t) {
		return t.replace(/^[ \t_]+|[ \t_]+$/gi, '').replace(/(_){2,}/g, "_");
	},
	
	addLinksToArray: function(lnks, urls, doc) {
		if (!lnks || !lnks.length) {
			return;
		}
		
		var ref = DTA_AddingFunctions.getRef(doc);
		
		for (var i = 0; i < lnks.length; ++i) {
			// remove anchor from url
			var link = lnks[i];
			// if it's valid and it's new
			if (!DTA_AddingFunctions.isLinkOpenable(link.href)) {
				continue;
			}
				
			/// XXX: title is also parsed by extractDescription
			/// XXX: is this instance necessary?
			var udesc = '';
			if (link.hasAttribute('title')) {
				udesc = this.trim(link.getAttribute('title'));
			}
			urls.push({
				'url': new DTA_URL(link.href, doc.characterSet),
				'referrer': ref,
				'description': this.extractDescription(link),
				'ultDescription': udesc
			});
			
			var ml = DTA_getLinkPrintMetalink(link.hash);
			if (ml) {
				urls.push({
					'url': new DTA_URL(ml, doc.characterSet),
					'referrer': ref,
					'description': '[metalink] http://www.metalinker.org/',
					'ultDescription': '',
					'metalink': true
				});
			}
		}
	},
	
	addImagesToArray: function(lnks, images, doc)	{
		if (!lnks || !lnks.length) {
			return;
		}

		var ref = DTA_AddingFunctions.getRef(doc);

		for (var i = 0; i < lnks.length; ++i) {
			var src = lnks[i].src;
			if (!DTA_AddingFunctions.isLinkOpenable(src)) {
				try {
					src = DTA_AddingFunctions.composeURL(doc, src);
				}
				catch (ex) {
					DTA_debug.dump("failed to compose: " + src, ex);
					continue;
				}
			}
			// if it's valid and it's new
			// better double check :p
			if (!DTA_AddingFunctions.isLinkOpenable(src)) {
				continue;
			}
			var desc = '';
			if (lnks[i].hasAttribute('alt')) {
				desc = this.trim(lnks[i].getAttribute('alt'));
			}
			else if (lnks[i].hasAttribute('title')) {
				desc = this.trim(lnks[i].getAttribute('title'));
			}
			images.push({
				'url': new DTA_URL(src, doc.characterSet),
				'referrer': ref,
				'description': desc
			});
		}
	},
	
	// recursively add stuff.
	addLinks: function(aWin, aURLs, aImages, honorSelection) {

		function filterElements(nodes, set) {
			var filtered = [];
			for (var i = 0, e = nodes.length; i < e; ++i) {
				if (set.containsNode(nodes[i], true)) {
					filtered.push(nodes[i]);
				}
			}
			return filtered;
		}
	
		try {
		 
			var links = aWin.document.links;
			var images = aWin.document.images;
			var embeds = aWin.document.embeds;
			var rawInputs = aWin.document.getElementsByTagName('input');
			var inputs = [];
			for (var i = 0; i < rawInputs.length; ++i) {
				var rit = rawInputs[i].getAttribute('type');
				if (!rit || rit.toLowerCase() != 'image') {
					continue;
				}
				inputs.push(rawInputs[i]);
			}
			
			var sel = aWin.getSelection();
			if (honorSelection && sel && !sel.isCollapsed) {
				DTA_debug.dump("selection only");
				[links, images, embeds, inputs] = [links, images, embeds, inputs].map(
					function(e) {
						return filterElements(e, sel);
					}
				);
			}
			else {
				// we were asked to honor the selection, but we didn't actually have one.
				// so reset this flag so that we can continue processing frames below.
				honorSelection = false;
			}
			
			this.addLinksToArray(links, aURLs, aWin.document);
			[images, embeds, inputs].forEach(
				function(e) {
					this.addImagesToArray(e, aImages, aWin.document);
				},
				this
			);
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
	
	findWindowsNavigator: function(all) {
		var windows = [];
		if (!all) {
			var sel = document.commandDispatcher.focusedWindow.getSelection();
			if (sel.isCollapsed) {
				windows.push(gBrowser.selectedBrowser.contentWindow.top);
			}
			else {
				windows.push(document.commandDispatcher.focusedWindow);
			}
		}
		else {
			gBrowser.browsers.forEach(
				function(e) {
					windows.push(e.contentWindow.top);
				}
			);
		}
		return windows;
	},
	findWindowsMail: function(all) {
		var windows = [];
		if (document.documentElement.getAttribute('windowtype') == 'mail:3pane') {
			windows.push(document.getElementById('messagepane').contentWindow);
		}
		else if (!all) {
			windows.push(document.commandDispatcher.focusedWindow);
		}
		else {
			windows = DTA_Mediator
				.getAllByType('mail:messageWindow')
				.map(function(w) {
					return w.content;
				});
		}
		return windows;
	},
	_types: {
		'mail:3pane': 'findWindowsMail',
		'mail:messageWindow': 'findWindowsMail'
	},
	
	findLinks: function(turbo, all) {
		try {
			if (all == undefined && turbo && DTA_preferences.getDTA('rememberoneclick', false)) {
				all = DTA_preferences.getDTA('lastalltabs', false);
			}
			if (turbo && all != undefined) {
				DTA_preferences.setDTA('lastalltabs', all);
			}
			
			function makeUnique(i) {
				var known = {};
				return i.filter(
					function(e) {
						var url = e.url.url;
						if (url in known) {
							return false;
						}
						known[url] = null;
						return true;
					}
				);
			}		
			
			if (turbo) {
				DTA_debug.dump("findLinks(): DtaOneClick request from the user");
			} else {
				DTA_debug.dump("findLinks(): DtaStandard request from the user");
			}

			var wt = document.documentElement.getAttribute('windowtype');
			if (wt in this._types) {
				var windows = this[this._types[wt]](all);
			}
			else {
				var windows = this.findWindowsNavigator(all);
			}
			
			var urls = [];
			var images = [];
			windows.forEach(
				function(win) {
					this.addLinks(win, urls, images, !all);
				},
				this
			);
			urls = makeUnique(urls);
			images = makeUnique(images);

			if (!urls.length && !images.length) {
				DTA_alert(this.getString('error'), this.getString('errornolinks'));
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
	
	findSingleLink: function(turbo) {
		try {
			var win = document.commandDispatcher.focusedWindow.top;
			var ctx = this.contextMenu;

			var cur = ctx.target;
			
			var tofind = ctx.onLink ? /^a$/i : /^img$/i; 
		
			while (!("tagName" in cur) || !tofind.test(cur.tagName)) {
				cur = cur.parentNode;
			}
			var url = ctx.onLink ? cur.href : cur.src;
			
			if (!DTA_AddingFunctions.isLinkOpenable(url)) {
				DTA_alert(this.getString('error'), this.getError('errornodownload'));
				return;
			}
			
			var ml = DTA_getLinkPrintMetalink(url);
			url = new DTA_URL(ml ? ml : url, win.document.characterSet);
			
			var ref = DTA_AddingFunctions.getRef(document.commandDispatcher.focusedWindow.document);
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
	
	init: function() {
		try {
			this.direct = {};
			this.compact = {};
			
			var ctxItem = document.getElementById("dtaCtxCompact");
			var ctx = ctxItem.parentNode;
			var cont = document.getElementById('dtaCtxSubmenu');
			
			['SepBack', 'Pref', 'SepPref', 'TDTA', 'DTA', 'SaveT', 'Save', 'SepFront'].forEach(
				function(id) {
					this.compact[id] = document.getElementById('dtaCtx' + id);
					var node = document.getElementById('dtaCtx' + id).cloneNode(true);
					node.setAttribute('id', node.id + "-direct");
					ctx.insertBefore(node, ctxItem.nextSibling);
					this.direct[id] = node;
				},
				this
			);
			// intitalize those to have Menu Editor pick up "good" text
			[this.direct, this.compact].forEach(
				function(m) {
					m.Save.label = this.getString('dtasavelink');
					m.SaveT.label = this.getString('turbosavelink');
				},
				this
			);

			var menu = document.getElementById("dtaToolsMenu").parentNode;
			ctx.addEventListener("popupshowing", function (evt) { DTA_ContextOverlay.onContextShowing(evt); }, false);
			menu.addEventListener("popupshowing", function (evt) { DTA_ContextOverlay.onToolsShowing(evt); }, false);

			this.ctxBase = document.getElementById('dtaCtxCompact');
			
			// prepare tools
			this.tools = {};
			['DTA', 'TDTA', 'Manager'].forEach(
				function (e) {
					this.tools[e] = document.getElementById('dtaTools' + e);
				},
				this
			);
			this.toolsBase = document.getElementById('dtaToolsMenu');
			this.toolsMenu = document.getElementById('dtaToolsPopup');
			this.toolsSep = document.getElementById('dtaToolsSep');
			
		} catch (ex) {
			Components.utils.reportError(ex);
			DTA_debug.dump("DCO::init()", ex);
		}
	},
	get contextMenu() {
		if (window.gContextMenu !=  null) {
			return gContextMenu;
		}
		var cm = {
			onLink: false,
			onImage: false,
			target: document.popupNode,
			fake: true
		};
		if (cm.target) {
			var node = cm.target;
			if (node instanceof Components.interfaces.nsIImageLoadingContent && node.currentURI) {
				cm.onImage = true;
			}
			while (node && !cm.onLink) {
				if (node instanceof HTMLAnchorElement && node.href) {
					cm.onLink = true;
				}				
				node = node.parentNode;
			}
		}
		return cm;
	},
	onContextShowing: function(evt) {
		try {
			var ctx = this.contextMenu;
			// get settings
			var items = DTA_preferences.getDTA("ctxmenu", "1,1,0").split(",").map(function(e){return parseInt(e);});
			var compact = DTA_preferences.getDTA("ctxcompact", false);

			var menu;
			if (compact) {
				this.ctxBase.hidden = false;
				menu = this.compact;
			}
			else {
				this.ctxBase.hidden = true;
				menu = this.direct;
			}
			
			// hide all
			for (var i in menu) {
				this.direct[i].hidden = true;
				this.compact[i].hidden = true;
			}
			// show nothing!
			if (items.indexOf(1) == -1) {
				this.ctxBase.hidden = true;
				return;
			} 
			
			// setup menu items
			// show will hold those that will be shown
			var show = [];
			
			// hovering an image or link
			if (ctx && (ctx.onLink || ctx.onImage)) {
				if (items[0]) {
					show.push(menu.Save);
				}
				if (items[1]) {
					show.push(menu.SaveT);
				}
				menu.Save.label = this.getString('dtasave' + (ctx.onLink ? 'link' : 'image'));
				menu.SaveT.label = this.getString('turbosave' + (ctx.onLink ? 'link' : 'image'));
			}
			// regular
			if (ctx && (ctx.fake || !(ctx.onLink || ctx.onImage))) {
				if (items[0]) {
					show.push(menu.DTA);
				}
				if (items[1]) {
					show.push(menu.TDTA);
				}
				var sel = document.commandDispatcher.focusedWindow.getSelection();
				sel = sel && !sel.isCollapsed;
				menu.DTA.label = this.getString('dta' + (sel ? 'selection' : 'regular'));
				menu.TDTA.label = this.getString('turbo' + (sel ? 'selection' : 'regular'));
			}
			
			// prefs
			if (items[2]) {
				show.push(menu.Pref);
				if (compact && (items[0] || items[1])) {
					show.push(menu.SepPref);
				}
			}
			
			// show the seperators, if required.
			var n = menu.SepFront;
			while ((n = n.previousSibling)) {
				if (n.hidden) {
					continue;
				}
				if (n.nodeName != 'menuseparator') {
					show.push(menu.SepFront);
				}
				break;
			}
			n = menu.SepBack;
			while ((n = n.nextSibling)) {
				if (n.hidden) {
					continue;
				}
				if (n.nodeName != 'menuseparator') {
					show.push(menu.SepBack);
				}
				break;
			}
			
			show.forEach(
				function (node) {
					node.hidden = false;
				}
			);
		}
		catch(ex) {
			DTA_debug.dump("DTAContext(): ", ex);
		}
	},
	
	onToolsShowing : function(evt) {
		try {
			
			// get settings
			var menu = DTA_preferences.getDTA("toolsmenu", "1,1,1").split(",").map(function(e){return parseInt(e);});
			
			// all hidden...
			var hidden = DTA_preferences.getDTA("toolshidden", false);
			for (var i in this.tools) {
				this.tools[i].hidden = hidden;
			}
			this.toolsBase.hidden = hidden;
			if (hidden) {
				return;
			}

			var compact = menu.indexOf(0) != -1;
			
			// setup menu items
			// show will hold those that will be shown
			var show = [];
			
			if (menu[0]) {
				show.push('DTA');
			}
			if (menu[1]) {
				show.push('TDTA');
			}
			// prefs
			if (menu[2]) {
				show.push('Manager');
			}
			this.toolsSep.hidden = menu.indexOf(0) == -1;
			this.toolsBase.setAttribute('label', this.getString(menu.indexOf(1) != -1 ? 'moredtatools' : 'simpledtatools'));
		
			// show the items.
			for (var i in this.tools) {
				var cur = this.tools[i];
				if (show.indexOf(i) == -1) {
					this.toolsMenu.insertBefore(cur, this.toolsSep);
				}
				else {
					this.toolsBase.parentNode.insertBefore(cur, this.toolsBase);
				}
				document.getElementById('dtaToolsHelp').hidden = !('openHelp' in window);			
			}
		} catch(ex) {
			DTA_debug.dump("DTATools(): ", ex);
		}
	},
	
	extractDescription: function(child) {
		var rv = "";
		try {
			var fmt = function(s) {
				try {
					return s.replace(/(\n){1,}/gi, " ").replace(/(\s){2,}/gi, " ") + " ";
				} catch (ex) { /* no-op */ }
				return "";
			};
			for (var i = 0, e = child.childNodes.length; i < e; ++i) {
				var c = child.childNodes[i];

				if (c.nodeValue && c.nodeValue != "") {
					rv += fmt(c.nodeValue);
				}

				if (c.nodeType == 1) {
					rv += this.extractDescription(c);
				}

				if (c && 'hasAttribute' in c) { 
					if (c.hasAttribute('title')) {
						rv += fmt(c.getAttribute('title'));	
					}
					else if (c.hasAttribute('alt')) {
						rv += fmt(c.getAttribute('alt'));
					}
				}
			}
		} catch(ex) {
			DTA_debug.dump('extractDescription', ex);
		}
		return this.trim(rv);
	}
}

addEventListener("load", function() {DTA_ContextOverlay.init();}, false);