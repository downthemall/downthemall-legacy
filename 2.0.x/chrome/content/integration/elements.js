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
	let Cu = Components.utils;

	let _loader = {};
	Components.utils.import("resource://dta/_apiloader.jsm", _loader);
	_loader.inject(window);
		
	let Preferences = {};
	Components.utils.import('resource://dta/preferences.jsm', Preferences);	
	
	let debug = DTA.Debug;
	
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
				debug.log("requested a non-existing element: " + id);
			}
		}
		return elements;
	}

	let _selector = null;

	function getString(n) {
		try {
			return getString.__str.GetStringFromName(n);
		}
		catch (ex) {
			debug.log("locale error: " + n, ex);
			return '<error>';
		}
	};
	getString.__defineGetter__('__str', function() {
		let _str = Cc['@mozilla.org/intl/stringbundle;1']
			.getService(Ci.nsIStringBundleService)
		  .createBundle('chrome://dta/locale/menu.properties');
		delete getString.__str;
		return (getString.__str = _str);
	});

	function getFormattedString(n) {
		let args = Array.map(arguments, function(e) e);
		args.shift();
		try {
			return getString.__str.formatStringFromName(n, args, args.length);
		}
		catch (ex) {
			debug.log("locale error: " + n, ex);
			return '<error>';
		}	
	}
	
	function _notify(title, message, priority, mustAlert, timeout) {
		try {
			timeout = timeout || 2500;
			let nb = $('dtaNotifications');
			if (!nb) {
				throw new Error("no notifications");
			}
			let notification = nb.appendNotification(
				message,
				0,
				'chrome://dta/skin/toolbarbuttons/turbo.png',
				nb[priority]
				);
			setTimeout(function() {
				nb.removeNotification(notification);
			}, timeout);
		}
		catch (ex) {
			if (mustAlert) {
				let prompts = {};
				Components.utils.import('resource://dta/prompts.jsm', prompts);				
				prompts.alert(window, title, message);
			}
		}
	}
	
	function notifyError(title, message) _notify(title, message, 'PRIORITY_CRITICAL_HIGH', true, 1500);
	function notifyInfo(message) { if (!_selector) _notify('', message, 'PRIORITY_INFO_MEDIUM', false) };
	function notifyProgress(message) {
		try {
			let _n = null;
			return (notifyProgress = function(message) {
				let nb = $('dtaNotifications');
					if (!nb) {
						throw new Error("no notifications");
					}
				if (!message && _n) {
					nb.removeNotification(_n);
					_n = null;
					return;
				}
				if (!message) {
					return;
				}
				if (_n) {
					_n.label = message;
					return;
				}
				_n = nb.appendNotification(
					message,
					0,
					'chrome://dta/skin/toolbarbuttons/turbo.png',
					nb.PRIORITY_INFO_LOW
					);
			})(message);
		}
		catch (ex) {
			notifyProgress = function() {}
		}
	}	
	
	function trimMore(t) {
		return t.replace(/^[\s_]+|[\s_]+$/gi, '').replace(/(_){2,}/g, "_")
	}
	
	function extractDescription(child) {
		let rv = [];
		try {
			let fmt = function(s) {
				try {
					return trimMore(s.replace(/(\n){1,}/gi, " ").replace(/(\s){2,}/gi, " "));
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
			debug.log('extractDescription', ex);
		}
		return trimMore(rv.join(" "));
	}
	
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
				title = trimMore(link.getAttribute('title'));
			}
			if (!title && link.hasAttribute('alt')) {
				title = trimMore(link.getAttribute('alt'));
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
			yield true;
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
				debug.log("failed to compose: " + src, ex);
				continue;
			}
			// if it's valid and it's new
			// better double check :p
			if (!DTA.isLinkOpenable(src)) {
				continue;
			}
			let desc = '';
			if (l.hasAttribute('alt')) {
				desc = trimMore(l.getAttribute('alt'));
			}
			else if (l.hasAttribute('title')) {
				desc = trimMore(l.getAttribute('title'));
			}
			images.push({
				'url': new DTA.URL(src),
				'referrer': ref,
				'description': desc
			});
			yield true;
		}
	}
	
	function recognizeTextLinks() {
		return Preferences.getExt("textlinks", true);
	}
	let TextLinks = {};
	Components.utils.import("resource://dta/support/textlinks.jsm", TextLinks);
	function getTextLinks(set, out, fakeLinks) {
		let rset = [];
		for (let r = set.iterateNext(); r; r = set.iterateNext()) {
			rset.push(r);
		}
		for each (let r in rset) {
			try {
				r = r.textContent.replace(/^\s+|\s+$/g, "");
				if (r) {
					for each (let link in TextLinks.getTextLinks(r, fakeLinks)) {
						out.push(link);
					}
					yield true;
				}
			}
			catch (ex) {
				// no op: might be an already removed node
			}
		}
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
			let rv = [];
			for each (let n in nodes) {
				try {
					if (n && set.containsNode(n, true)) {
						rv.push(n);
					}
				}
				catch (ex) {
				}
			}
			return rv;
		}
	
		try {
			let links = new Array(aWin.document.links.length);
			for (let i = 0, e = aWin.document.links.length; i < e; ++i) {
				links.push(aWin.document.links[i]);
				yield true;
			}
			
			let images = new Array(aWin.document.images.length);
			for (let i = 0, e = aWin.document.images.length; i < e; ++i) {
				images.push(aWin.document.images[i]);
				yield true;
			}			
			
			let videos = Array.map(aWin.document.getElementsByTagName('video'), function(e) e);
			videos = videos.concat(Array.map(aWin.document.getElementsByTagName('audio'), function(e) e));
			let sources = [];
			for each (let v in videos) {
				sources = sources.concat(Array.map(v.getElementsByTagName('source'), function(e) e));
				yield true;
			}
			videos = videos.concat(sources);
			videos = videos.filter(function(e) !!e.src);
			yield true;
			
			let embeds = new Array(aWin.document.embeds.length);
			for (let i = 0, e = aWin.document.embeds.length; i < e; ++i) {
				embeds.push(aWin.document.embeds[i]);
				yield true;
			}
			
			let rawInputs = aWin.document.getElementsByTagName('input');
			let inputs = [];
			for (let i = 0, e = rawInputs.length; i < e; ++i) {
				let rit = rawInputs[i].getAttribute('type');
				if (!rit || rit.toLowerCase() != 'image') {
					continue;
				}
				inputs.push(rawInputs[i]);
				yield true;
			}
			
			let sel = null;
			if (honorSelection && (sel = aWin.getSelection()) && !sel.isCollapsed) {
				debug.log("selection only");
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
					yield true;
					
				  let cdoc = aWin.document.implementation.createDocument ('http://www.w3.org/1999/xhtml', 'html', null);
				  copy = cdoc.adoptNode(copy);
				  cdoc.documentElement.appendChild(cdoc.adoptNode(copy));
				  delete copy;
				  yield true;
				  
					let set = cdoc.evaluate(
						'//*[not(ancestor-or-self::a) and not(ancestor-or-self::style) and not(ancestor-or-self::script)]/text()',
						copy.ownerDocument,
						null,
						XPathResult.ORDERED_NODE_ITERATOR_TYPE,
						null
					);
					yield true;
					
					for (let y in getTextLinks(set, links, true)) {
						yield true;
					}
					delete cdoc;
					yield true;
				}
			}
			else {
				if (Preferences.getExt('listsniffedvideos', false)) {
					let sniffed = Array.map(
						addLinks.__ch.getSniffedVideosFor(DTA.IOService.newURI(aWin.location.href, aWin.document.characterSet, null)),
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
					yield true;
				}
				if (recognizeTextLinks()) {
					let set = aWin.document.evaluate(
						'//*[not(ancestor-or-self::a) and not(ancestor-or-self::style) and not(ancestor-or-self::script)]/text()',
						aWin.document,
						null,
						XPathResult.ORDERED_NODE_ITERATOR_TYPE,
						null
					);
					for each (let y in getTextLinks(set, links, true)) {
						yield true;
					}
				}
				
				// we were asked to honor the selection, but we didn't actually have one.
				// so reset this flag so that we can continue processing frames below.
				honorSelection = false;
			}
			
			debug.log("adding links to array");
			for (let y in addLinksToArray(links, aURLs, aWin.document)) {
				yield true;
			}
			for each (let e in [images, videos, embeds, inputs]) {
				for (let y in addImagesToArray(e, aImages, aWin.document)) {
					yield true;
				}				
			}
			for (let y in addImagesToArray(
				videos.filter(function(e) !!e.poster).map(function(e) new TextLinks.FakeLink(e.poster)),
				aImages,
				aWin.document
			)) {
				yield true;
			}
		}
		catch (ex) {
			debug.log('addLinks', ex);
		}
		
		// do not process further as we just filtered the selection
		if (honorSelection) {
			return;
		}
		
		// recursively process any frames
		if (aWin.frames) {
			for (let i = 0, e = aWin.frames.length; i < e; ++i) {
				for (let y in arguments.callee(aWin.frames[i], aURLs, aImages)) {
					yield true;
				}
			}
		}
	}
	addLinks.__defineGetter__('__ch', function() {
		let _ch = Cc['@downthemall.net/contenthandling;3']
			.getService(Ci.dtaIContentHandling);
		delete addLinks.__ch;
		return (addLinks.__ch = _ch);
	});
	
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
			if (all == undefined && turbo && Preferences.getExt('rememberoneclick', false)) {
				all = Preferences.getExt('lastalltabs', false);
			}
			if (turbo && all != undefined) {
				Preferences.setExt('lastalltabs', all);
			}
			
			function unique(i) {
				return i.filter(function(e) (e = e.url.url.spec) && !((e in this) || (this[e] = null)), {});
			}		
			
			if (turbo) {
				debug.log("findLinks(): DtaOneClick request from the user");
			}
			else {
				debug.log("findLinks(): DtaStandard request from the user");
			}

			let wt = document.documentElement.getAttribute('windowtype');
			let windows = findWindowsNavigator(all);

			let urls = [];
			let images = [];

			// long running fetching may confuse users, hence give them a hint that
			// stuff is happening
			let _updateInterval = setInterval(function(isStarter) {
				if (isStarter) {
					clearInterval(_updateInterval);
					_updateInterval = setInterval(arguments.callee, 150, false);
				}
				if (urls.length + images.length) {
					notifyProgress(getFormattedString('processing', urls.length, images.length));
				}
				else {
					notifyProgress(getString('preparing'));
				}
			}, 1750, true);

			let cothreads = {};
			Components.utils.import('resource://dta/cothread.jsm', cothreads);
			
			new cothreads.CoThreadInterleaved(
				(function() {
					debug.log("findLinks(): running");
					for each (let win in windows) {
						debug.log("findLinks(): running...");
						for (let y in addLinks(win, urls, images, !all)) {
							yield true;
						}
					}
					
					urls = unique(urls);
					yield true;
					images = unique(images);
					yield true;
					
					debug.log("findLinks(): done running...");
					
				})(),
				100
			).run(function() {
				// clean up the "hint" notification from above
				clearInterval(_updateInterval);
				notifyProgress();

				debug.log("findLinks(): finishing...");
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
						debug.log('findLinks', ex);
						DTA.saveLinkArray(window, urls, images, getString('errorinformation'));
					}
					return;
				}
				DTA.saveLinkArray(window, urls, images);				
			});
		}
		catch(ex) {
			debug.log('findLinks', ex);
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
			debug.log('findSingleLink: ', ex);
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
			debug.log('findSingleLink: ', ex);
		}		
	}
	
	function _findSingleMedia(turbo, tag) {
		let ctx = contextMenu();
		try {
			function isMedia(n) 'tagName' in n && n.tagName == tag;
			
			let cur = ctx.target;
			while (cur && !isMedia(cur)) {
				let cn = cur.getElementsByTagName(tag);
				if (cn.length) {
					cur = cn[0];
					break;
				}
				cur = cur.parentNode;
			}
			
			if (!cur.src) {
				cur = cur.getElementsByTagName('source')[0];
			}
			saveSingleLink(turbo, cur.src, cur);
			return;
		}
		catch (ex) {
			try {
				if (ctx.mediaURL) {
					saveSingleLink(turbo, ctx.mediaURL, ctx.target);
				}
			}
			catch (ex) {
				notifyError(getString('error'), getString('errornodownload'));
				debug.log('_findSingleMedia: ', ex);
			}
		}		
	}
	function findSingleVideo(turbo) {
		_findSingleMedia(turbo, 'video');
	}
	function findSingleAudio(turbo) {
		_findSingleMedia(turbo, 'audio');
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
				debug.log('saveSingleLink', ex);
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
					debug.log('findSingleLink', ex);
					notifyError(getString('error'), getString('errorinformation'));
				}
			}
			DTA.saveSingleLink(window, window, false, action, ref, desc);
		}
		catch (ex) {
			debug.log('findForm', ex);
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
			let items = Preferences.getExt("ctxmenu", "1,1,0").split(",").map(function(e) parseInt(e));
			let showCompact = Preferences.getExt("ctxcompact", false);
			
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
			debug.log("DTAContext(): ", ex);
		}		 
	}
	
	function onToolsShowing(evt) {
		try {
			
			// get settings
			let menu = Preferences.getExt("toolsmenu", "1,1,1").split(",").map(function(e){return parseInt(e);});
			
			// all hidden...
			let hidden = Preferences.getExt("toolshidden", false);
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
			debug.log("DTATools(): ", ex);
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
		
		this._detachObserver = Preferences.addObserver('extensions.dta.selectbgimages', this);
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
			if (Preferences.getExt('selectbgimages', false)) {
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

	function DropProcessor(func, multiple) {
		this.func = func;
		if (multiple) {
			this.canHandleMultipleItems = true;
		}
	};
	DropProcessor.prototype = {
		getSupportedFlavours: function() {
			if (!this._flavors) {
				this._flavors = new FlavourSet();
				this._flavors.appendFlavour('text/x-moz-url');
			}	
			return this._flavors;
		},
		onDragOver: function() {},
		onDrop: function (evt, dropdata, session) {
			if (!dropdata) {
				return;
			}
			let url = null;
			try {
				url = transferUtils.retrieveURLFromData(dropdata.data, dropdata.flavour.contentType);
				if (!DTA.isLinkOpenable(url)) {
					throw new Components.Exception("Link cannot be opened!");
				}
				url = DTA.IOService.newURI(url, null, null);
			}
			catch (ex) {
				DTA.Debug.log("Failed to process drop", ex);
				return;
			}
			let doc = document.commandDispatcher.focusedWindow.document;
			let ref = doc ? DTA.getRef(doc) : null;		
			
			if (url) {
				url = new DTA.URL(DTA.getLinkPrintMetalink(url) || url);
				this.func(url, ref);			
			}
		}
	};

	addEventListener('load', function() {
		removeEventListener('load', arguments.callee, true);	
		
		ctxBase = $('dtaCtxCompact');
		toolsBase = $('dtaToolsMenu');
		toolsMenu = $('dtaToolsPopup');
		toolsSep = $('dtaToolsSep');

		let ctx = ctxBase.parentNode;
		let menu = toolsBase.parentNode;
		
		function $t() {
			let rv = [];
			for (let i = 0, e = arguments.length; i < e; ++i) {
				let id = arguments[i];
				let element = document.getElementById(id);
				if (element) {
						rv.push(element);
						continue;
				}
				if (id in paletteItems) {
					rv.push(paletteItems[id]);
					continue;
				}
			}
			return rv.length == 1 ? rv[0] : rv;
		}		
		
		function initMenus(evt) {
			function bindEvt(evt, fn) function(e) e.addEventListener(evt, fn, true); 
			function bindCtxEvt(ctx, evt, fn) {
				$(ctx, ctx + "-direct").forEach(bindEvt(evt, fn));
			}
			
			ctx.removeEventListener('popupshowing', arguments.callee, true);
			menu.removeEventListener('popupshowing', arguments.callee, true);
			
			try {
				let cont = $('dtaCtxSubmenu');
		
				for each (let id in ['SepBack', 'Pref', 'SepPref', 'TDTA', 'DTA', 'TDTASel', 'DTASel', 'SaveLinkT', 'SaveLink', 'SaveImgT', 'SaveImg', 'SaveVideoT', 'SaveVideo', 'SaveAudioT', 'SaveAudio', 'SaveFormT', 'SaveForm', 'SepFront']) {
					compact[id] = $('dtaCtx' + id);
					let node = $('dtaCtx' + id).cloneNode(true);
					node.setAttribute('id', node.id + "-direct");
					ctx.insertBefore(node, ctxBase.nextSibling);
					direct[id] = node;
				}
		
				// prepare tools
				for each (let e in ['DTA', 'TDTA', 'Manager']) {
					tools[e] = $('dtaTools' + e);
				}
				
				
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
				
				$('dtaCtxPref', 'dtaCtxPref-direct', 'dtaToolsPrefs').forEach(bindEvt('command', function() DTA.showPreferences()));

				$('dtaToolsAbout').addEventListener(
					'command',
					function() DTA.Mediator.showAbout(window),
					true
				);
				
				ctx.addEventListener('popupshowing', onContextShowing, true);
				menu.addEventListener('popupshowing', onToolsShowing, true);
				
			}
			catch (ex) {
				Components.utils.reportError(ex);
				debug.log("DCO::init()", ex);
			}
			evt.target == ctx ? onContextShowing(evt) : onToolsShowing(evt);
		}
		
		ctx.addEventListener('popupshowing', initMenus, true);
		menu.addEventListener('popupshowing', initMenus, true);
	
		addEventListener("keydown", onKeyDown, false);
		addEventListener("keyup", onKeyUp, false);
		addEventListener("blur", onBlur, true);	
		
		/* Toolbar buttons */
		
		// Santas little helper, palette items + lookup
		let paletteItems = {};
		try {
			let palette = $('navigator-toolbox').palette;			
			for (let c = palette.firstChild; c; c = c.nextSibling) {
				if (c.id) {
					paletteItems[c.id] = c;
				}
			}
		}
		catch (ex) {
			debug.log("Failed to parse palette", ex);
		}
		
		try {
			let DropTDTA = new DropProcessor(function(url, ref) { DTA.saveSingleLink(window, true, url, ref); });
			let DropDTA = new DropProcessor(function(url, ref) { DTA.saveSingleLink(window, false, url, ref); });	
			
			let b = $t('dta-button');
			b.addEventListener('command', function(event) {
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
			}, true);
			b.addEventListener('dragover', function(event) nsDragAndDrop.dragOver(event, DropDTA), true);
			b.addEventListener('dragdrop', function(event) nsDragAndDrop.drop(event, DropDTA), true);
			
			b = $t('dta-turbo-button');
			b.addEventListener('command', function(event) {
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
			}, true);
			b.addEventListener('dragover', function(event) nsDragAndDrop.dragOver(event, DropTDTA), true);
			b.addEventListener('dragdrop', function(event) nsDragAndDrop.drop(event, DropTDTA), true);
			
			$t('dta-turboselect-button').addEventListener('command', function(event) { toggleOneClick(event); }, true);
			$t('dta-manager-button').addEventListener('command', function() DTA.openManager(window), true);
		}
		catch (ex) {
			debug.log("Init TBB failed", ex);
		}
		
		// "Show about" stuff
		try {
			let Version = {};
			Components.utils.import("resource://dta/version.jsm", Version);			
			Version = Version.Version;
			
			function openAbout() {
				Version.showAbout = false;
				setTimeout(function() DTA.Mediator.showAbout(window), 600);
			}
			
			function registerObserver() {
				Components.utils.import("resource://gre/modules/XPCOMUtils.jsm", Version);
				
				let os = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
				
				let obs = {
					QueryInterface: Version.XPCOMUtils.generateQI([Ci.nsIObserver,Ci.nsISupportsWeakReference]),									
					observe: function(s,t,d) {
						os.removeObserver(this, Version.TOPIC_SHOWABOUT);
						if (Version.showAbout) {
							openAbout();
						}
					}
				};
				
				os.addObserver(obs, Version.TOPIC_SHOWABOUT, true);
			}
			
			if (Version.showAbout === null) {
				registerObserver();
				return;
			}
			if (Version.showAbout === true) {
				openAbout();
				return;
			}
		}
		catch (ex) {
			DTA.Debug.log("Failed to process about", ex);
		}
	}, true); // load
	
	try {
		// DownloadHelper integration
		let _dh = {};
		Components.utils.import("resource://dta/support/downloadHelper.jsm", _dh);
	}
	catch (ex) {
		Cu.reportError(ex);
	}
})();