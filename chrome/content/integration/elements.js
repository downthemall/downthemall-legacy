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

(function() {
	
	let Cc = Components.classes;
	let Ci = Components.interfaces;
		
	let prompts = {};
	Components.utils.import('resource://dta/prompts.jsm', prompts);
	
	function debug(msg, ex) {
		let _d = DTA.Debug;
		return (debug = function debug(msg, ex) {
			if (ex) {
				return _d.log(msg, ex);
			}
			return _d.logString(msg);
		})(msg, ex);
	}
	
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

	let _selector = null;
	
	let _str = Cc['@mozilla.org/intl/stringbundle;1']
		.getService(Ci.nsIStringBundleService)
		.createBundle('chrome://dta/locale/menu.properties');
	function getString(n) {
		try {
			return _str.GetStringFromName(n);
		}
		catch (ex) {
			debug("locale error: " + n, ex);
			return '<error>';
		}
	};
	function getFormattedString(n) {
		let args = Array.map(arguments, function(e) e);
		args.shift();
		try {
			return _str.formatStringFromName(n, args, args.length);
		}
		catch (ex) {
			debug("locale error: " + n, ex);
			return '<error>';
		}	
	}
	
	function _notify(title, message, priority, mustAlert, timeout) {
		try {
			timeout = timeout || 2500;
			let nb = gBrowser.getNotificationBox();
			let notification = nb.appendNotification(
				message,
				0,
				'chrome://dta/skin/common/dta.png',
				nb[priority]
				);
			setTimeout(function() {
				nb.removeNotification(notification);
			}, timeout);
		}
		catch (ex) {
			if (mustAlert) {
				prompts.alert(window, title, message);
			}
		}
	}
	
	function notifyError(title, message) _notify(title, message, 'PRIORITY_CRITICAL_HIGH', true, 1500);
	function notifyInfo(message) { if (!_selector) _notify('', message, 'PRIORITY_INFO_MEDIUM', false) };
	
	
	function trim(t) {
		return t.replace(/^[ \t_]+|[ \t_]+$/gi, '').replace(/(_){2,}/g, "_");
	}
	
	function extractDescription(child) {
		let rv = [];
		try {
			let fmt = function(s) {
				try {
					return trim(s.replace(/(\n){1,}/gi, " ").replace(/(\s){2,}/gi, " "));
				}
				catch (ex) { /* no-op */ }
				return "";
			};
			for (let i = 0, e = child.childNodes.length; i < e; ++i) {
				let c = child.childNodes[i];

				if (c.nodeValue && c.nodeValue != "") {
					rv.push(fmt(c.nodeValue));
				}

				if (c.nodeType == 1) {
					rv.push(arguments.callee(c));
				}

				if (c && 'hasAttribute' in c) { 
					if (c.hasAttribute('title')) {
						rv.push(fmt(c.getAttribute('title')));	
					}
					else if (c.hasAttribute('alt')) {
						rv.push(fmt(c.getAttribute('alt')));
					}
				}
			}
		}
		catch(ex) {
			debug('extractDescription', ex);
		}
		return trim(rv.join(" "));
	}

		
	let _ch = Cc['@downthemall.net/contenthandling;2']
		.getService(Ci.dtaIContentHandling);
	
	function addLinksToArray(lnks, urls, doc) {
		if (!lnks || !lnks.length) {
			return;
		}
		
		let ref = DTA.getRef(doc);
		
		for each (let link in lnks) {
			// if it's valid and it's new
			if (!DTA.isLinkOpenable(link.href)) {
				continue;
			}
				
			let title = '';
			if (link.hasAttribute('title')) {
				title = trim(link.getAttribute('title'));
			}
			if (!title && link.hasAttribute('alt')) {
				title = trim(link.getAttribute('alt'));
			}
			let url = DTA.IOService.newURI(link.href, doc.characterSet, null);
			urls.push({
				'url': new DTA.URL(url),
				'referrer': ref,
				'description': extractDescription(link),
				'title': title
			});
			let ml = DTA.getLinkPrintMetalink(url.ref);
			if (ml) {
				urls.push({
					'url': new DTA.URL(ml),
					'referrer': ref,
					'description': '[metalink] http://www.metalinker.org/',
					'title': title,
					'metalink': true
				});
			}
		}
	}
	
	function addImagesToArray(lnks, images, doc)	{
		if (!lnks || !lnks.length) {
			return;
		}
		
		let ref = DTA.getRef(doc);
		
		for each (let l in lnks) {
			let src = l.src;
			try {
				src = DTA.composeURL(doc, l.src);
			}
			catch (ex) {
				debug("failed to compose: " + src, ex);
				continue;
			}
			// if it's valid and it's new
			// better double check :p
			if (!DTA.isLinkOpenable(src)) {
				continue;
			}
			let desc = '';
			if (l.hasAttribute('alt')) {
				desc = trim(l.getAttribute('alt'));
			}
			else if (l.hasAttribute('title')) {
				desc = trim(l.getAttribute('title'));
			}
			images.push({
				'url': new DTA.URL(src),
				'referrer': ref,
				'description': desc
			});
		}
	}
	
	function recognizeTextLinks() {
		return DTA.Preferences.getExt("textlinks", true);
	}
	let TextLinks = {};
	Components.utils.import("resource://dta/support/textlinks.jsm", TextLinks);
	function getTextLinks(set, fakeLinks) {
		let text = [];
		for (let r = set.iterateNext(); r; r = set.iterateNext()) {
			r = r.textContent.replace(/^\s+|\s+$/g, "");
			if (r) {
				text.push(r);
			}
		}
		text = text.join(" \n");			
		return TextLinks.getTextLinks(text, fakeLinks)
	}

	function selectButton() {
		return $('dta-turboselect-button') || {checked: false};
	}
	function contextMenu() {
		if (window.gContextMenu !=  null) {
			return gContextMenu;
		}
		let cm = {
			onLink: false,
			onImage: false,
			onVideo: false,
			onAudio: false,
			target: document.popupNode,
			fake: true
		};
		if (cm.target) {
			let node = cm.target;
			if (node instanceof Ci.nsIImageLoadingContent && node.currentURI) {
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
	}		
	
	// recursively add stuff.
	function addLinks(aWin, aURLs, aImages, honorSelection) {

		function filterElements(nodes, set) {
			let filtered = [];
			for each (let n in nodes) {
				if (set.containsNode(n, true)) {
					filtered.push(n);
				}
			}
			return filtered;
		}
	
		try {
			let links = Array.map(aWin.document.links, function(e) e);
			
			let images = Array.map(aWin.document.images, function(e) e);
			let videos = Array.map(aWin.document.getElementsByTagName('video'), function(e) e);
			videos = videos.concat(Array.map(aWin.document.getElementsByTagName('audio'), function(e) e));
			let sources = [];
			for each (let v in videos) {
				sources = sources.concat(Array.map(v.getElementsByTagName('source'), function(e) e));
			}
			videos = videos.concat(sources);
			videos = videos.filter(function(e) !!e.src);
			
			let embeds = Array.map(aWin.document.embeds, function(e) e);
			let rawInputs = aWin.document.getElementsByTagName('input');
			let inputs = [];
			for (let i = 0; i < rawInputs.length; ++i) {
				let rit = rawInputs[i].getAttribute('type');
				if (!rit || rit.toLowerCase() != 'image') {
					continue;
				}
				inputs.push(rawInputs[i]);
			}
			
			let sel = aWin.getSelection();
			if (honorSelection && sel && !sel.isCollapsed) {
				debug("selection only");
				[links, images, videos, embeds, inputs] = [links, images, videos, embeds, inputs].map(
					function(e) {
						return filterElements(e, sel);
					}
				);
				if (recognizeTextLinks()) {
					let copy = aWin.document.createElement('div');
					for (let i = 0; i < sel.rangeCount; ++i) {
						let r = sel.getRangeAt(i);
						copy.appendChild(r.cloneContents());
					}
				  let cdoc = aWin.document.implementation.createDocument ('http://www.w3.org/1999/xhtml', 'html', null);
				  copy = cdoc.adoptNode(copy);
				  cdoc.documentElement.appendChild(cdoc.adoptNode(copy));
				  delete copy;
				  
					let set = cdoc.evaluate(
						'/*//*[not(*) and not(ancestor-or-self::a) and not(ancestor-or-self::style) and not(ancestor-or-self::script)]/text()',
						copy.ownerDocument,
						null,
						XPathResult.ORDERED_NODE_ITERATOR_TYPE,
						null
					);					
					links = links.concat(getTextLinks(set, true));
					delete cdoc;
				}
			}
			else {
				if (DTA.Preferences.getExt('listsniffedvideos', false)) {
					let sniffed = Array.map(
						_ch.getSniffedVideosFor(DTA.IOService.newURI(aWin.location.href, aWin.document.characterSet, null)),
						function(e) e
					);
					let ref = DTA.getRef(aWin.document);
					for each (let s in sniffed) {
						let o = {
							'url': new DTA.URL(s),
							'referrer': ref,
							'description': getString('sniffedvideo')
						}
						aURLs.push(o);
						aImages.push(o);
					}
				}
				if (recognizeTextLinks()) {
					let set = aWin.document.evaluate(
						'//body//*[not(*) and not(ancestor-or-self::a) and not(ancestor-or-self::style) and not(ancestor-or-self::script)]/text()',
						aWin.document,
						null,
						XPathResult.ORDERED_NODE_ITERATOR_TYPE,
						null
					);
					links = links.concat(getTextLinks(set, true));
				}
				
				// we were asked to honor the selection, but we didn't actually have one.
				// so reset this flag so that we can continue processing frames below.
				honorSelection = false;
			}
			
			addLinksToArray(links, aURLs, aWin.document);
			for each (let e in [images, videos, embeds, inputs]) {
				addImagesToArray(e, aImages, aWin.document);
			}
			addImagesToArray(
				videos.filter(function(e) !!e.poster).map(function(e) new TextLinks.FakeLink(e.poster)),
				aImages,
				aWin.document
			);
		}
		catch (ex) {
			debug('addLinks', ex);
		}
		
		// do not process further as we just filtered the selection
		if (honorSelection) {
			return;
		}
		
		// recursively process any frames
		if (aWin.frames) {
			for (let i = 0, e = aWin.frames.length; i < e; ++i) {
				arguments.callee(aWin.frames[i], aURLs, aImages);
			}
		}
	}
	
	function findWindowsNavigator(all) {
		let windows = [];
		if (!all) {
			let sel = document.commandDispatcher.focusedWindow.getSelection();
			if (sel.isCollapsed) {
				windows.push(gBrowser.selectedBrowser.contentWindow.top);
			}
			else {
				windows.push(document.commandDispatcher.focusedWindow);
			}
			return windows;
		}
		for each (let e in gBrowser.browsers) {
			windows.push(e.contentWindow.top);
		}
		return windows;
	}
	
	function findLinks(turbo, all) {
		try {
			if (all == undefined && turbo && DTA.Preferences.getExt('rememberoneclick', false)) {
				all = DTA.Preferences.getExt('lastalltabs', false);
			}
			if (turbo && all != undefined) {
				DTA.Preferences.setExt('lastalltabs', all);
			}
			
			function unique(i) {
				return i.filter(function(e) (e = e.url.url.spec) && !((e in this) || (this[e] = null)), {});
			}		
			
			if (turbo) {
				debug("findLinks(): DtaOneClick request from the user");
			}
			else {
				debug("findLinks(): DtaStandard request from the user");
			}

			let wt = document.documentElement.getAttribute('windowtype');
			let windows = findWindowsNavigator(all);

			let urls = [];
			let images = [];
			for each (let win in windows) {
				addLinks(win, urls, images, !all);
			}
			urls = unique(urls);
			images = unique(images);

			if (!urls.length && !images.length) {
				notifyError(getString('error'), getString('errornolinks'));
				return;
			}
			
			if (turbo) {
				try {
					let queued = DTA.turboSaveLinkArray(window, urls, images);
					if (typeof queued == 'number') {
						notifyInfo(getFormattedString('queuedn', queued));
					}
					else {
						notifyInfo(getFormattedString('queued', queued.url));
					}
					return;
				}
				catch (ex) {
					debug('findLinks', ex);
					DTA.saveLinkArray(window, urls, images, getString('errorinformation'));
				}
				return;
			}
			DTA.saveLinkArray(window, urls, images);
		}
		catch(ex) {
			debug('findLinks', ex);
		}
	}
	
	function findSingleLink(turbo) {
		try {
			let cur = contextMenu().target;
			while (!("tagName" in cur) || !cur.tagName.match(/^a$/i)) {
				cur = cur.parentNode;
			}
			saveSingleLink(turbo, cur.href, cur);
		}
		catch (ex) {
			notifyError(getString('error'), getString('errornodownload'));
			debug('findSingleLink: ', ex);
		}
	}
	
	function findSingleImg(turbo) {
		try {
			let cur = contextMenu().target;
			while (!("tagName" in cur) || !cur.tagName.match(/^img$/i)) {
				cur = cur.parentNode;
			}
			saveSingleLink(turbo, cur.src, cur);
		}
		catch (ex) {
			notifyError(getString('error'), getString('errornodownload'));
			debug('findSingleLink: ', ex);
		}		
	}
	
	function _findSingleMedia(turbo, matching) {
		try {
			let cur = contextMenu().target;
			while (!("tagName" in cur) || !cur.tagName.match(matching)) {
				cur = cur.parentNode;
			}
			if (!cur.src) {
				cur = cur.getElementsByTagName('source')[0];
			}
			saveSingleLink(turbo, cur.src, cur);
		}
		catch (ex) {
			notifyError(getString('error'), getString('errornodownload'));
			debug('_findSingleMedia: ', ex);
		}		
	}
	function findSingleVideo(turbo) {
		_findSingleMedia(turbo, /^video/i);
	}
	function findSingleAudio(turbo) {
		_findSingleMedia(turbo, /^audio/i);
	}
	
	function saveSingleLink(turbo, url, elem) {
		if (!DTA.isLinkOpenable(url)) {
			throw Error("not downloadable");
			return;
		}
		
		url = DTA.IOService.newURI(url, elem.ownerDocument.characterSet, null);
		let ml = DTA.getLinkPrintMetalink(url);
		url = new DTA.URL(ml ? ml : url);
		
		let ref = DTA.getRef(elem.ownerDocument);
		let desc = extractDescription(elem);
		if (turbo) {
			try {
				DTA.saveSingleLink(window, true, url, ref, desc);
				notifyInfo(getFormattedString('queued', url));
				return;
			}
			catch (ex) {
				debug('saveSingleLink', ex);
				notifyError(getString('error'), getString('errorinformation'));
			}
		}
		DTA.saveSingleLink(window, false, url, ref, desc);		
	}
	function findForm(turbo) {
		try {
			let ctx = contextMenu();
			if (!('form' in ctx.target)) {
				throw new Components.Exception("No form");
			}
			let form = ctx.target.form;
			
			let action = DTA.composeURL(form.ownerDocument, form.action);
			if (!DTA.isLinkOpenable(action.spec)) {
				throw new Components.Exception('Unsupported URL');
			}
			action = action.QueryInterface(Ci.nsIURL);
			
			let charset = form.ownerDocument.characterSet;
			if (form.acceptCharset) {
				charset = form.acceptCharset;
			}
			if (charset.match(/utf-?(?:16|32)/i)) {
				charset = 'utf-8';
			}
						
			let encoder = Cc['@mozilla.org/intl/texttosuburi;1']
				.getService(Ci.nsITextToSubURI);
			
			let values = []; 
			
			for (let i = 0; i < form.elements.length; ++i) {
				if (form.elements[i].name ==  '') {
					continue;
				}
				let v = encoder.ConvertAndEscape(charset, form.elements[i].name) + "=";
				if (form.elements[i].value != '') {
					v += encoder.ConvertAndEscape(charset, form.elements[i].value);
				}
				values.push(v); 
			}
			values = values.join("&");

			if (form.method.toLowerCase() == 'post') {
				let ss = Cc['@mozilla.org/io/string-input-stream;1']
					.createInstance(Ci.nsIStringInputStream);
				ss.setData(values, -1);
				
				let ms = Cc['@mozilla.org/network/mime-input-stream;1']
					.createInstance(Ci.nsIMIMEInputStream);
				ms.addContentLength = true;
				ms.addHeader('Content-Type', 'application/x-www-form-urlencoded');
				ms.setData(ss);
				
				let sis = Cc['@mozilla.org/scriptableinputstream;1']
					.createInstance(Ci.nsIScriptableInputStream);
				sis.init(ms);
				let postData = '';
				let avail = 0;
				while ((avail = sis.available()) != 0) {
					postData += sis.read(avail);
				}
				sis.close();
				ms.close();
				ss.close();
				
				action = new DTA.URL(DTA.IOService.newURI(action.spec, form.ownerDocument.characterSet, null));
				action.postData = postData;
			}
			else {
				action.query = values;
				action.ref = '';
				action = new DTA.URL(DTA.IOService.newURI(action.spec, form.ownerDocument.characterSet, null));
			}			

			let ref = DTA.getRef(document.commandDispatcher.focusedWindow.document);
			let desc = extractDescription(form);
			
			if (turbo) {
				try {
					DTA.saveSingleLink(window, true, action, ref, desc);
					return;
				}
				catch (ex) {
					debug('findSingleLink', ex);
					notifyError(getString('error'), getString('errorinformation'));
				}
			}
			DTA.saveSingleLink(window, window, false, action, ref, desc);
		}
		catch (ex) {
			debug('findForm', ex);
		}
	}
	
	// these are only valid after the load event.
	let direct = {};
	let compact = {};
	let tools = {};
	let ctxBase = null;
	let toolsBase = null;
	let toolsMenu = null;
	let toolsSep = null;

	
	function onContextShowing(evt) {
		try {
			let ctx = contextMenu();
			// get settings
			let items = DTA.Preferences.getExt("ctxmenu", "1,1,0").split(",").map(function(e) parseInt(e));
			let showCompact = DTA.Preferences.getExt("ctxcompact", false);
			
			let menu;
			if (showCompact) {
				ctxBase.hidden = false;
				menu = compact;
			}
			else {
				ctxBase.hidden = true;
				menu = direct;
			}
			
			// hide all
			for (let i in menu) {
				direct[i].hidden = true;
				compact[i].hidden = true;
			}
			// show nothing!
			if (items.indexOf(1) == -1) {
				ctxBase.hidden = true;
				return;
			} 
			
			// setup menu items
			// show will hold those that will be shown
			let show = [];
			
			let sel = document.commandDispatcher.focusedWindow.getSelection();
			if (sel && !sel.isCollapsed) {
				if (items[0]) {
					show.push(menu.DTASel);
				}
				if (items[1]) {
					show.push(menu.TDTASel);
				}
			}
			
			// hovering an image or link
			if (ctx && (ctx.onLink || ctx.onImage || ctx.onVideo || ctx.onAudio)) {
				if (items[0]) {
					if (ctx.onLink) {
						show.push(menu.SaveLink);
					}
					if (ctx.onImage) {
						show.push(menu.SaveImg);
					}
					if (ctx.onVideo) {
						show.push(menu.SaveVideo);
					}
					if (ctx.onAudio) {
						show.push(menu.SaveAudio);
					}
				}
				if (items[1]) {
					if (ctx.onLink) {
						show.push(menu.SaveLinkT);
					}
					if (ctx.onImage) {
						show.push(menu.SaveImgT);
					}
					if (ctx.onVideo) {
						show.push(menu.SaveVideoT);
					}
					if (ctx.onAudio) {
						show.push(menu.SaveAudioT);
					}
				}
			}
			else if (
				ctx.target
				&& ('form' in ctx.target)
			) {
				if (items[0]) {
					show.push(menu.SaveForm);
				}
				if (items[1]) {
					show.push(menu.SaveFormT);
				}		
			}			
			// regular
			else if (!sel || sel.isCollapsed) {
				if (items[0]) {
					show.push(menu.DTA);
				}
				if (items[1]) {
					show.push(menu.TDTA);
				}
			}
			
			// prefs
			if (items[2]) {
				show.push(menu.Pref);
				if (compact && (items[0] || items[1])) {
					show.push(menu.SepPref);
				}
			}
			
			// show the seperators, if required.
			let n = menu.SepFront;
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
			for each (let node in show) {
				node.hidden = false;
			}
		}
		catch(ex) {
			debug("DTAContext(): ", ex);
		}		 
	}
	
	function onToolsShowing(evt) {
		try {
			
			// get settings
			let menu = DTA.Preferences.getExt("toolsmenu", "1,1,1").split(",").map(function(e){return parseInt(e);});
			
			// all hidden...
			let hidden = DTA.Preferences.getExt("toolshidden", false);
			for (let i in tools) {
				tools[i].hidden = hidden;
			}
			toolsBase.hidden = hidden;
			if (hidden) {
				return;
			}

			let compact = menu.indexOf(0) != -1;
			
			// setup menu items
			// show will hold those that will be shown
			let show = [];
			
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
			toolsSep.hidden = menu.indexOf(0) == -1;
			toolsBase.setAttribute('label', getString(menu.indexOf(1) != -1 ? 'moredtatools' : 'simpledtatools'));
		
			// show the items.
			for (let i in tools) {
				let cur = tools[i];
				if (show.indexOf(i) == -1) {
					toolsMenu.insertBefore(cur, toolsSep);
				}
				else {
					toolsBase.parentNode.insertBefore(cur, toolsBase);
				}
			}
		}
		catch(ex) {
			debug("DTATools(): ", ex);
		}
	}
	
	function attachOneClick(evt) {
		if (!!_selector) {
			return;
		}
		_selector = new Selector();
	}
	function detachOneClick(evt) {
		if (!_selector) {
			return;
		}
		_selector.dispose();
		_selector = null;
	}

	let _keyActive =  false;
	function onKeyDown(evt) {
		return; // XXX reenable when polished
		if (_keyActive) {
			return;
		}
		if (evt.shiftKey && evt.ctrlKey) {
			_keyActive = true;
			selectButton().checked = true;
			attachOneClick();
		}
	}
	function onKeyUp(evt) {
		return; // XXX reenable when polished
		if (!_keyActive) {
			return;
		}
		if (evt.shiftKey) {
			_keyActive = false;
			selectButton().checked = false;
			detachOneClick();
		}
	}
	
	function onBlur(evt) {
		return; // XXX reenable when polished
		// when the window loses focus the keyup might not be received.
		// better toggle back
		if (!_keyActive) {
			return;
		}
		_keyActive = false;
		selectButton().checked = false;
		detachOneClick();
	}
	
	function toggleOneClick(evt) {
		if (selectButton().checked) {
			attachOneClick(evt);
		}
		else {
			detachOneClick(evt);
		}
	}
	
	function Selector() {
		let tp = this;
		this._callback = function(evt) tp.onClickOneClick(evt);
		
		window.addEventListener('click', this._callback, true);
		window.addEventListener('mouseup', this._callback, false);
		window.addEventListener('mousemove', this._callback, false);
		
		this._detachObserver = DTA.Preferences.addObserver('extensions.dta.selectbgimages', this);
		this.observe();
	}
	Selector.prototype = {
		dispose: function() {
			window.removeEventListener('click', this._callback, true);
			window.removeEventListener('mouseup', this._callback, false);
			window.removeEventListener('mousemove', this._callback, false);
			this.detachHilight();
			this._detachObserver();
		},
		detachHilight: function () {
			if (this._hilight) {
				this._hilight.hide();
				delete this._hilight;
			}
		},
		getBgImage: function(e) {
			if (!e || !e.ownerDocument) {
				return null;
			}
			let url = e.ownerDocument.defaultView.getComputedStyle(e, "").getPropertyCSSValue('background-image');
			if (url && url.primitiveType == CSSPrimitiveValue.CSS_URI) {
				return {elem: e, url: url.getStringValue()};
			}
			return getBgImage(e.parentNode);
		},
		findElemUnderCursor: function (e, n, a) {
			if (n == 'bgimg') {
				return this.getBgImage(e);
			}
			if (!e || !e.localName) {
				return null;
			}
			if (e.localName.toLowerCase() == n && e[a]) {
				return {elem: e, url: e[a] };
			}
			return this.findElemUnderCursor(e.parentNode, n, a);
		},
		cancelEvent: function (evt) {
			if (!evt.cancelable) {
				return;
			}
			evt.preventDefault();
			evt.stopPropagation();
		},	
		onClickOneClick: function(evt) {

			let target = evt.target;
			let doc = target.ownerDocument;

			function processRegular(e) {
				let m = this.findElemUnderCursor(target, e[0], e[1]);
				if (!m) {
					return false;
				}
				try {
					saveSingleLink(true, m.url, m.elem);
					this.detachHilight();
					new this.Flasher(m.elem).hide();
				}
				catch (ex) {
					return false;
				}
				return true;
			}
			function highlightElement(e) {
				let m = this.findElemUnderCursor(target, e[0], e[1]);
				if (!m) {
					return false;
				}
				if (this._hilight && this._hilight.elem == m.elem) {
					return true;
				}
				this.detachHilight();
				this._hilight = new this.Highlighter(m.elem);
				return true;
			}		
			
			if (evt.type == 'click') {
				if (evt.button == 0 && !!target && target.nodeType == 1 && (!target.namespaceURI || target.namespaceURI == 'http://www.w3.org/1999/xhtml')) {
					if (this._searchee.some(processRegular, this)) {
						this.cancelEvent(evt);
					}
				}			
			}
			else if (evt.type == 'mousemove') {
				if (!this._searchee.some(highlightElement, this)) {
					this.detachHilight();
				}
			}
		},
		observe: function() {
			let searchee = [
				['a', 'href'],
				['img', 'src']
			];
			if (DTA.Preferences.getExt('selectbgimages', false)) {
				searchee.push(['bgimg', 'bgimg']);
			}
			this._searchee = searchee;
		}
	};

	Selector.prototype.Flasher = function(elem) {
		this.elem = elem;
		this.doc = elem.ownerDocument;
		this.init();
	}
	Selector.prototype.Flasher.prototype = {
		BACKGROUND: '#1def39 no-repeat center',
		PADDING: 6,
		OPACITY: 0.6,
		RADIUS: 5,
		FSTEP: 0.05,
		FINTERVAL: 60,
		FWAIT: 350,
		
		calcPosition: function(parent) {
			let ow = parent.offsetWidth;
			let oh = parent.offsetHeight;
			let ol = parent.offsetLeft;
			let ot = parent.offsetTop;
			// enlarge the box to include all (overflowing) child elements
			// useful for example for inline <A><IMG></A>
			if (parent.nodeName != 'IMG') {
				let boxen = parent.getElementsByTagName('*');
				for (let i = 0; i < boxen.length; ++i) {
					let box = boxen[i];
					if (!!box.style.float || box.style.position == 'fixed' || box.style.position == 'absolute') {
						continue;
					}
					ow = Math.max(ow, box.offsetWidth);
					oh = Math.max(oh, box.offsetHeight);
					ol = Math.min(ol, box.offsetLeft);
					ot = Math.min(ot, box.offsetTop);
				}
			}
			// calculate the real offset coordinates
			parent = parent.offsetParent;
			let pos = (this.elem.style.position && this.elem.style.position == 'fixed') ? 'fixed' : 'absolute';
			while (parent) {
				ot += parent.offsetTop;
				ol += parent.offsetLeft;
				if (parent.style.position == 'fixed') {
					pos = 'fixed';
				}
				parent = parent.offsetParent;
			}
			return {
				width: ow,
				height: oh,
				left: ol,
				top: ot,
				position: pos
			};
		},	
		
		init: function() {
			let div = this.doc.createElement('div');
			this.doc.documentElement.appendChild(div);
			
			with (div.style) {
				MozBorderRadius = this.RADIUS + 'px';
				zIndex = 2147483647;
				opacity = this.OPACITY;
				background = this.BACKGROUND;
				display = 'block';

				// put the div where it belongs
				let pos = this.calcPosition(this.elem);
				width = (pos.width + 2 * this.PADDING) + "px";
				height = (pos.height + 2 * this.PADDING) + "px";
				top = (pos.top - this.PADDING) + "px";
				left = (pos.left - this.PADDING) + "px";
				position = pos.position;
			
				// add the adding icon if the element covers enough space
				if (Math.min(pos.width, pos.height) >= 36) {
					backgroundImage = 'url(chrome://dta-public/skin/integration/added_large.png)';
				} 
				if (Math.min(pos.width, pos.height) >= 18) {
					backgroundImage = 'url(chrome://dta-public/skin/integration/added_small.png)';
				}
			}
			
			this._div = div;
		},
		fade: function() {
			let o = (parseFloat(this._div.style.opacity) - this.FSTEP);
			if (o - 0.03 < 0) {
				this._div.parentNode.removeChild(this._div);
				return false;
			}
			this._div.style.opacity = o.toString();
			let tp = this;
			setTimeout(function() tp.fade(), this.FINTERVAL);
			return true;
		},
		hide: function() {
			let tp = this;
			setTimeout(function() tp.fade(), this.FWAIT);
		}
	};

	Selector.prototype.Highlighter = function(elem) {
		this.elem = elem;
		this.doc = elem.ownerDocument;
		this.init();
	}
	Selector.prototype.Highlighter.prototype = {
		BACKGROUND: 'red',
		OPACITY: 0.4,
		RADIUS: 9,
		WIDTH: 3,
		
		calcPosition: Selector.prototype.Flasher.prototype.calcPosition, 
		
		init: function() {
			let doc = this.doc;
			let elem = doc.documentElement;
			function div() doc.createElement('div');
			
			let leftD = div();
			elem.appendChild(leftD);
			let rightD = div();
			elem.appendChild(rightD);
			let topD = div();
			elem.appendChild(topD);
			let bottomD = div();
			elem.appendChild(bottomD);
			
			this._divs = [leftD, rightD, topD, bottomD];

			let pos = this.calcPosition(this.elem);
			for each (let div in this._divs) {
				with (div.style) {
					zIndex = 2147483647;
					opacity = this.OPACITY;
					background = this.BACKGROUND;
					display = 'block';
					position = pos.position;
					width = this.WIDTH + 'px';
					height = this.WIDTH + 'px';
				}
			}
			
			with (leftD.style) {
				MozBorderRadiusTopleft = this.RADIUS + 'px';
				MozBorderRadiusBottomleft = this.RADIUS + 'px';
				left = (pos.left - this.WIDTH) + 'px';
				top = (pos.top - this.WIDTH) + 'px';
				height = (pos.height + this.WIDTH * 2) + 'px';
			}

			with (rightD.style) {
				MozBorderRadiusTopright = this.RADIUS + 'px';
				MozBorderRadiusBottomright = this.RADIUS + 'px';
				top = leftD.style.top;
				left = (pos.left + pos.width) + 'px';
				height = leftD.style.height;
			}
			
			with (topD.style) {
				left = pos.left + 'px';
				top = (pos.top - this.WIDTH) + 'px';
				width = pos.width + 'px';
			}
			
			with (bottomD.style) {
				left = pos.left + 'px';
				top = (pos.top + pos.height) + 'px';
				width = pos.width + 'px';
			}			
		},
		hide: function() {
			for each (let div in this._divs) {
				div.parentNode.removeChild(div);
			}
		}
	};

	addEventListener('load', function() {
		removeEventListener('load', arguments.callee, true);	
		
		ctxBase = $('dtaCtxCompact');
		toolsBase = $('dtaToolsMenu');
		toolsMenu = $('dtaToolsPopup');
		toolsSep = $('dtaToolsSep');
		
		(function() {
			try {
				let ctxItem = $("dtaCtxCompact");
				let ctx = ctxItem.parentNode;
				let cont = $('dtaCtxSubmenu');
		
				for each (let id in ['SepBack', 'Pref', 'SepPref', 'TDTA', 'DTA', 'TDTASel', 'DTASel', 'SaveLinkT', 'SaveLink', 'SaveImgT', 'SaveImg', 'SaveVideoT', 'SaveVideo', 'SaveAudioT', 'SaveAudio', 'SaveFormT', 'SaveForm', 'SepFront']) {
					compact[id] = $('dtaCtx' + id);
					let node = $('dtaCtx' + id).cloneNode(true);
					node.setAttribute('id', node.id + "-direct");
					ctx.insertBefore(node, ctxItem.nextSibling);
					direct[id] = node;
				}
		
				let menu = $("dtaToolsMenu").parentNode;
				ctx.addEventListener("popupshowing", onContextShowing, false);
				menu.addEventListener("popupshowing", onToolsShowing, false);
			
				// prepare tools
				for each (let e in ['DTA', 'TDTA', 'Manager']) {
					tools[e] = $('dtaTools' + e);
				}
			}
			catch (ex) {
				Components.utils.reportError(ex);
				debug("DCO::init()", ex);
			}
		})();
			
		addEventListener("keydown", onKeyDown, false);
		addEventListener("keyup", onKeyUp, false);
		addEventListener("blur", onBlur, true);	
		
		function bindEvt(evt, fn) function(e) e.addEventListener(evt, fn, true); 
		
		$(
			'dtaCtxDTA',
			'dtaCtxDTA-direct',
			'dtaCtxDTASel',
			'dtaCtxDTASel-direct',
			'dtaToolsDTA'
		).forEach(bindEvt('command', function() findLinks(false)));
		$(
			'dtaCtxTDTA',
			'dtaCtxTDTA-direct',
			'dtaCtxTDTASel',
			'dtaCtxTDTASel-direct',
			'dtaToolsTDTA'
		).forEach(bindEvt('command', function() findLinks(true)));
		
		$('dtaToolsManager').addEventListener('command', function() DTA.openManager(window), true);
			
		function bindCtxEvt(ctx, evt, fn) {
			$(ctx, ctx + "-direct").forEach(bindEvt(evt, fn));
		}
		
		bindCtxEvt('dtaCtxSaveLink', 'command', function() findSingleLink(false));
		bindCtxEvt('dtaCtxSaveLinkT', 'command', function() findSingleLink(true));
		bindCtxEvt('dtaCtxSaveImg', 'command', function() findSingleImg(false));
		bindCtxEvt('dtaCtxSaveImgT', 'command', function() findSingleImg(true));
		bindCtxEvt('dtaCtxSaveVideo', 'command', function() findSingleVideo(false));
		bindCtxEvt('dtaCtxSaveVideoT', 'command', function() findSingleVideo(true));
		bindCtxEvt('dtaCtxSaveAudio', 'command', function() findSingleAudio(false));
		bindCtxEvt('dtaCtxSaveAudioT', 'command', function() findSingleAudio(true));
		bindCtxEvt('dtaCtxSaveForm', 'command', function() findForm(false));
		bindCtxEvt('dtaCtxSaveFormT', 'command', function() findForm(true));
		
		$('dtaCtxPref', 'dtaCtxPref-direct', 'dtaToolsPrefs').forEach(bindEvt('command', function() DTA_showPreferences()));
		
		$('dtaToolsAbout').addEventListener(
			'command',
			function() DTA_Mediator.showAbout(window),
			true
		);
		
	}, true);
	
	DTA.onDTADragOver = function(event) nsDragAndDrop.dragOver(event, DTA_DropDTA);
	DTA.onDTADragDrop = function(event) nsDragAndDrop.drop(event, DTA_DropDTA);
	DTA.onDTA = function(event) {
		switch (event.target.id) {
		case 'dta-button':
		case 'dta-tb-dta':
			findLinks();
			break;
		case 'dta-tb-all':
			findLinks(false, true);
			break;
		case 'dta-tb-manager':
			DTA.openManager(window);
			break;
		default:
			break;
			}
	};
	
	
	DTA.onTDTADragOver = function(event) nsDragAndDrop.dragOver(event, DTA_DropTDTA);
	DTA.onTDTADragDrop = function(event) nsDragAndDrop.drop(event, DTA_DropTDTA);
	DTA.onTDTA = function(event) {
		switch (event.target.id) {
		case 'dta-turbo-button':
		case 'dta-tb-turbo':
			findLinks(true);
			break;
		case 'dta-tb-allturbo':
			findLinks(true, true);
			break;
		default:

			break;
		}
	};
	
	DTA.onTurboSelect = function(event) { toggleOneClick(event); };
	
	DTA.onManager = function() DTA.openManager(window);

})();