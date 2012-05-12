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
 * The Original Code is DownThemAll API integration loader.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
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

const EXPORTED_SYMBOLS = ["load"];
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const module = Cu.import;

module("resource://dta/glue2.jsm");

/* **
 * Lazy getters
 */
XPCOMUtils.defineLazyGetter(this, 'DTA', function() {
	let rv = {};
	module("resource://dta/api.jsm", rv);
	Object.freeze(rv);
	return rv;
});
XPCOMUtils.defineLazyGetter(this, 'Version', function() require("version"));
XPCOMUtils.defineLazyGetter(this, 'Preferences', function() require("preferences"));
this.__defineGetter__('recognizeTextLinks', function() Preferences.getExt("textlinks", true));
XPCOMUtils.defineLazyGetter(this, 'TextLinks', function() require("support/textlinks"));
XPCOMUtils.defineLazyGetter(this, "ContentHandling", function() require("support/contenthandling").ContentHandling);
XPCOMUtils.defineLazyGetter(this, 'CoThreads', function() require("cothreads"));
XPCOMUtils.defineLazyGetter(
	this,
	'getString_str',
	function() Services.strings.createBundle('chrome://dta/locale/menu.properties')
);

/* **
 * Helpers and tools
 */
function getString(n) {
	try {
		return getString_str.GetStringFromName(n);
	}
	catch (ex) {
		if (DTA.Logger.enabled) {
			DTA.Logger.log("locale error: " + n, ex);
		}
		return '<error>';
	}
}
function getFormattedString(n) {
	let args = Array.slice(arguments);
	args.shift();
	try {
		return getString_str.formatStringFromName(n, args, args.length);
	}
	catch (ex) {
		if (DTA.Logger.enabled) {
			DTA.Logger.log("locale error: " + n, ex);
		}
		return '<error>';
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
				rv.push(extractDescription(c));
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
		if (DTA.Logger.enabled) {
			DTA.Logger.log('extractDescription', ex);
		}
	}
	return trimMore(rv.join(" "));
}

function addLinksToArray(lnks, urls, doc) {
	if (!lnks || !lnks.length) {
		return;
	}

	let ref = DTA.getRef(doc);

	for each (let link in lnks) {
		try {
			let url = new DTA.URL(Services.io.newURI(link.href, doc.characterSet, null));

			let title = '';
			if (link.hasAttribute('title')) {
				title = trimMore(link.getAttribute('title'));
			}
			if (!title && link.hasAttribute('alt')) {
				title = trimMore(link.getAttribute('alt'));
			}
			urls.push({
				'url': url,
				'referrer': ref,
				'description': extractDescription(link),
				'title': title
			});
			let ml = DTA.getLinkPrintMetalink(url.url);
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
		catch (ex) {
			// no op
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
		try {
			let url = new DTA.URL(DTA.composeURL(doc, l.src));

			let desc = '';
			if (l.hasAttribute('alt')) {
				desc = trimMore(l.getAttribute('alt'));
			}
			else if (l.hasAttribute('title')) {
				desc = trimMore(l.getAttribute('title'));
			}
			images.push({
				'url': url,
				'referrer': ref,
				'description': desc
			});
		}
		catch (ex) {
			// no op
		}
		yield true;
	}
}

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

function filterInSitu(arr, cb, tp) {
	tp = tp || null;

	// courtesy of firefox-sync
	let i, k, e;
	for (i = 0, k = 0, e = arr.length; i < e; i++) {
		let a = arr[k] = arr[i]; // replace filtered items
		if (a && cb.call(tp, a, i, arr)) {
			k += 1;
		}
	}
	arr.length = k; // truncate
	return arr;
}

function filterMapInSitu(arr, filterStep, mapStep, tp) {
	tp = tp || null;
	let i, k, e;
	for (i = 0, k = 0, e = arr.length; i < e; i++) {
		let a = arr[i]; // replace filtered items
		if (a && filterStep.call(tp, a, i, arr)) {
			arr[k] = mapStep.call(tp, a, i, arr);
			k += 1;
		}
	}
	arr.length = k; // truncate
	return arr;
}

//recursively add stuff.
function addLinks(aWin, aURLs, aImages, honorSelection) {
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
		filterInSitu(function(e) !!e.src);
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
			if (DTA.Logger.enabled) {
				DTA.Logger.log("selection only");
			}
			[links, images, videos, embeds, inputs].forEach(function(e) filterInSitu(e, function(n) sel.containsNode(n, true)));
			if (recognizeTextLinks) {
				let copy = aWin.document.createElement('div');
				for (let i = 0; i < sel.rangeCount; ++i) {
					let r = sel.getRangeAt(i);
					copy.appendChild(r.cloneContents());
				}
				yield true;

				let cdoc = aWin.document.implementation.createDocument ('http://www.w3.org/1999/xhtml', 'html', null);
				copy = cdoc.adoptNode(copy);
				cdoc.documentElement.appendChild(cdoc.adoptNode(copy));
				yield true;

				let set = cdoc.evaluate(
					'//*[not(ancestor-or-self::a) and not(ancestor-or-self::style) and not(ancestor-or-self::script)]/text()',
					copy.ownerDocument,
					null,
					aWin.XPathResult.ORDERED_NODE_ITERATOR_TYPE,
					null
				);
				yield true;

				for (let y in getTextLinks(set, links, true)) {
					yield true;
				}
				cdoc = null;
				copy = null;
				yield true;
			}
		}
		else {
			if (Preferences.getExt('listsniffedvideos', false)) {
				let sniffed = Array.map(
					ContentHandling.getSniffedVideosFor(Services.io.newURI(aWin.location.href, aWin.document.characterSet, null)),
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
			if (recognizeTextLinks) {
				let set = aWin.document.evaluate(
					'//*[not(ancestor-or-self::a) and not(ancestor-or-self::style) and not(ancestor-or-self::script)]/text()',
					aWin.document,
					null,
					aWin.XPathResult.ORDERED_NODE_ITERATOR_TYPE,
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

		if (DTA.Logger.enabled) {
			DTA.Logger.log("adding links to array");
		}
		for (let y in addLinksToArray(links, aURLs, aWin.document)) {
			yield true;
		}
		for each (let e in [images, videos, embeds, inputs]) {
			for (let y in addImagesToArray(e, aImages, aWin.document)) {
				yield true;
			}
		}
		for (let y in addImagesToArray(
			filterMapInSitu(videos, function(e) !!e.poster, function(e) new TextLinks.FakeLink(e.poster)),
			aImages,
			aWin.document
		)) {
			yield true;
		}
	}
	catch (ex) {
		if (DTA.Logger.enabled) {
			DTA.Logger.log('addLinks', ex);
		}
	}

	// do not process further as we just filtered the selection
	if (honorSelection) {
		return;
	}

	// recursively process any frames
	if (aWin.frames) {
		for (let i = 0, e = aWin.frames.length; i < e; ++i) {
			for (let y in addLinks(aWin.frames[i], aURLs, aImages)) {
				yield true;
			}
		}
	}
}

/* **
 * LOADER
 */
function load(window, outerEvent) {
	let document = window.document;
	let setTimeoutOnlyFun = function setTimeoutOnlyFun(c) {
		if (typeof(c) != "function") {
			throw new Error("do not call me with a string!");
		}
		return window.setTimeout.apply(window, arguments);
	};
	let setIntervalOnlyFun = function setIntervalOnlyFun(c) {
		if (typeof(c) != "function") {
			throw new Error("do not call me with a string!");
		}
		return window.setInterval.apply(window, arguments);
	};
	let clearInterval = window.clearInterval;
	let gBrowser = window.gBrowser;

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
				if (DTA.Logger.enabled) {
					DTA.Logger.log("requested a non-existing element: " + id);
				}
			}
		}
		return elements;
	}

	let _selector = null;


	function _notify(title, message, priority, mustAlert, timeout) {
		if ('PopupNotifications' in window) {
			_notify = function(title, message, priority, mustAlert, timeout) {
				try {
					timeout = timeout || 2500;
					let notification = window.PopupNotifications.show(
							gBrowser.selectedBrowser,
							'downthemall',
							message,
							'downthemall-notification-icon',
							null,
							null,
							{timeout: timeout}
							);
					setTimeoutOnlyFun(function() {
						window.PopupNotifications.remove(notification);
					}, timeout);
				}
				catch (ex) {
					alert(ex);
					// no op
				}
			}
		}
		else {
			_notify = function(title, message, priority, mustAlert, timeout) {
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
					setTimeoutOnlyFun(function() {
						nb.removeNotification(notification);
					}, timeout);
				}
				catch (ex) {
					if (mustAlert) {
						require("prompts").alert(window, title, message);
					}
				}
			}
		}
		return _notify(title, message, priority, mustAlert, timeout);
	}

	function notifyError(title, message) _notify(title, message, 'PRIORITY_CRITICAL_HIGH', true, 1500);
	function notifyInfo(message) { if (!_selector) _notify('', message, 'PRIORITY_INFO_MEDIUM', false) };
	function notifyProgress(message) {
		try {
			let _n = null;
			if ('PopupNotifications' in window) {
				return (notifyProgress = function(message) {
					if (!message && _n) {
						window.PopupNotifications.remove(_n);
						_n = null;
						return;
					}
					if (!message) {
						return;
					}
					_n = window.PopupNotifications.show(
						gBrowser.selectedBrowser,
						'downthemall',
						message,
						'downthemall-notification-icon'
						);
				})(message);
			}
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
			if (DTA.Logger.enabled) {
				DTA.Logger.log("np", ex);
			}
			notifyProgress = function() {}
		}
	}

	function selectButton() {
		return $('dta-turboselect-button') || {checked: false};
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

	function unique(i) filterInSitu(
		i,
		function(e) (e = e.url.url.spec) && !((e in this) || (this[e] = null)),
		Object.create(null)
		);

	function findLinks(turbo, all) {
		try {
			if (all == undefined && turbo && Preferences.getExt('rememberoneclick', false)) {
				all = Preferences.getExt('lastalltabs', false);
			}
			if (turbo && all != undefined) {
				Preferences.setExt('lastalltabs', all);
			}



			if (turbo && DTA.Logger.enabled) {
				DTA.Logger.log("findLinks(): DtaOneClick request from the user");
			}
			else if (DTA.Logger.enabled) {
				DTA.Logger.log("findLinks(): DtaStandard request from the user");
			}

			let wt = document.documentElement.getAttribute('windowtype');
			let windows = findWindowsNavigator(all);

			let urls = [];
			let images = [];

			// long running fetching may confuse users, hence give them a hint that
			// stuff is happening
			let intervalfunc;
			let _updateInterval = setIntervalOnlyFun(intervalfunc = (function(isStarter) {
				if (isStarter) {
					clearInterval(_updateInterval);
					_updateInterval = setIntervalOnlyFun(intervalfunc, 150, false);
				}
				if (urls.length + images.length) {
					notifyProgress(getFormattedString('processing', urls.length, images.length));
				}
				else {
					notifyProgress(getString('preparing'));
				}
			}), 1750, true);

			new CoThreads.CoThreadInterleaved(
				(function() {
					if (DTA.Logger.enabled) {
						DTA.Logger.log("findLinks(): running");
					}
					for each (let win in windows) {
						if (DTA.Logger.enabled) {
							DTA.Logger.log("findLinks(): running...");
						}
						for (let y in addLinks(win, urls, images, !all)) {
							yield true;
						}
					}

					unique(urls);
					yield true;
					unique(images);
					yield true;

					if (DTA.Logger.enabled) {
						DTA.Logger.log("findLinks(): done running...");
					}

				})(),
				100
			).start(function() {
				// clean up the "hint" notification from above
				clearInterval(_updateInterval);
				notifyProgress();

				if (DTA.Logger.enabled) {
					DTA.Logger.log("findLinks(): finishing...");
				}
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
						if (DTA.Logger.enabled) {
							DTA.Logger.log('findLinks', ex);
						}
						DTA.saveLinkArray(window, urls, images, getString('errorinformation'));
					}
					return;
				}
				DTA.saveLinkArray(window, urls, images);
			});
		}
		catch(ex) {
			if (DTA.Logger.enabled) {
				DTA.Logger.log('findLinks', ex);
			}
		}
	}

	function findSingleLink(turbo) {
		try {
			if (!window.gContextMenu.onSaveableLink) {
				return;
			}
			let cur = window.gContextMenu.target;
			while (!("tagName" in cur) || !cur.tagName.match(/^a$/i)) {
				cur = cur.parentNode;
			}
			saveSingleLink(turbo, cur.href, cur);
			return;
		}
		catch (ex) {
			notifyError(getString('error'), getString('errorcannotdownload'));
			if (DTA.Logger.enabled) {
				DTA.Logger.log('findSingleLink: ', ex);
			}
		}
	}

	function findSingleImg(turbo) {
		try {
			let cur = window.gContextMenu.target;
			while (!("tagName" in cur) || !cur.tagName.match(/^img$/i)) {
				cur = cur.parentNode;
			}
			saveSingleLink(turbo, cur.src, cur);
		}
		catch (ex) {
			notifyError(getString('error'), getString('errorcannotdownload'));
			if (DTA.Logger.enabled) {
				DTA.Logger.log('findSingleLink: ', ex);
			}
		}
	}

	function _findSingleMedia(turbo, tag) {
		let ctx = window.gContextMenu;
		try {
			function isMedia(n) 'tagName' in n && n.tagName.toLowerCase() == tag;

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
				notifyError(getString('error'), getString('errorcannotdownload'));
				if (DTA.Logger.enabled) {
					DTA.Logger.log('_findSingleMedia: ', ex);
				}
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
		url = Services.io.newURI(url, elem.ownerDocument.characterSet, null);
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
				if (DTA.Logger.enabled) {
					DTA.Logger.log('saveSingleLink', ex);
				}
				notifyError(getString('error'), getString('errorinformation'));
			}
		}
		DTA.saveSingleLink(window, false, url, ref, desc);
	}
	function findForm(turbo) {
		try {
			let ctx = window.gContextMenu;
			if (!('form' in ctx.target)) {
				throw new Components.Exception("No form");
			}
			let form = ctx.target.form;

			let action = DTA.URL(DTA.composeURL(form.ownerDocument, form.action));

			let charset = form.ownerDocument.characterSet;
			if (form.acceptCharset) {
				charset = form.acceptCharset;
			}
			if (charset.match(/utf-?(?:16|32)/i)) {
				charset = 'utf-8';
			}

			let values = [];

			for (let i = 0; i < form.elements.length; ++i) {
				if (form.elements[i].name ==  '') {
					continue;
				}
				let v = Services.ttsu.ConvertAndEscape(charset, form.elements[i].name) + "=";
				if (form.elements[i].value != '') {
					v += Services.ttsu.ConvertAndEscape(charset, form.elements[i].value);
				}
				values.push(v);
			}
			values = values.join("&");

			if (form.method.toLowerCase() == 'post') {
				let ss = new Instances.StringInputStream(values, -1);
				let ms = new Instances.MimeInputStream();
				ms.addContentLength = true;
				ms.addHeader('Content-Type', 'application/x-www-form-urlencoded');
				ms.setData(ss);

				let sis = new Instances.ScriptableInputStream();
				sis.init(ms);
				let postData = '';
				let avail = 0;
				while ((avail = sis.available()) != 0) {
					postData += sis.read(avail);
				}
				sis.close();
				ms.close();
				ss.close();

				action.postData = postData;
			}
			else {
				action.url.query = values;
				action.url.ref = '';
			}

			let ref = DTA.getRef(document.commandDispatcher.focusedWindow.document);
			let desc = extractDescription(form);

			if (turbo) {
				try {
					DTA.saveSingleLink(window, true, action, ref, desc);
					return;
				}
				catch (ex) {
					if (DTA.Logger.enabled) {
						DTA.Logger.log('findSingleLink', ex);
					}
					notifyError(getString('error'), getString('errorinformation'));
				}
			}
			DTA.saveSingleLink(window, window, false, action, ref, desc);
		}
		catch (ex) {
			if (DTA.Logger.enabled) {
				if (DTA.Logger.enabled) {
					DTA.Logger.log('findForm', ex);
				}
			}
		}
	}

	// these are only valid after the load event.
	let direct = {};
	let compact = {};
	let tools = {};

	let ctxBase = $('dtaCtxCompact');
	let toolsBase = $('dtaToolsMenu');
	let toolsMenu = $('dtaToolsPopup');
	let toolsSep = $('dtaToolsSep');

	let ctx = ctxBase.parentNode;
	let menu = toolsBase.parentNode;


	function onContextShowing(evt) {
		try {
			let ctx = window.gContextMenu;
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
			if (DTA.Logger.enabled) {
				DTA.Logger.log("DTAContext(): ", ex);
			}
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

			// show Add toolbar buttons if there are no buttons
			$('dtaToolsTBInstall').hidden = ['dta-button', 'dta-turbo-button', 'dta-turboselect-button', 'dta-manager-button']
				.some(function(b) !!$(b));
		}
		catch(ex) {
			if (DTA.Logger.enabled) {
				DTA.Logger.log("DTATools(): ", ex);
			}
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
	function onToolbarInstall(event) {
		// white list good locations
		// note that this is only performed to keep the number of event listeners down
		// The remote site does not get special privileges!
		try {
			if (!/^about:downthemall/.test(event.target.location)
					&& event.target.location.host != "about.downthemall.net") {
				return;
			}
		}
		catch (ex) {
			// might be another location where there is no .host
			return;
		}
		let tbinstall, tbunload, win = event.target;
		win.addEventListener("DTA:toolbarinstall", tbinstall = (function() {
			win.removeEventListener("DTA:toolbarinstall", tbinstall, true);
			win.removeEventListener("unload", tbunload, true)
			DTA.Mediator.showToolbarInstall(window);
		}), true);
		win.addEventListener("unload", tbunload = (function() {
			win.removeEventListener("DTA:toolbarinstall", tbinstall, true);
			win.removeEventListener("unload", tbunload, true)
		}), true);
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

			div.style.MozBorderRadius = this.RADIUS + 'px';
			div.style.zIndex = 2147483647;
			div.style.opacity = this.OPACITY;
			div.style.background = this.BACKGROUND;
			div.style.display = 'block';

			// put the div where it belongs
			let pos = this.calcPosition(this.elem);
			div.style.width = (pos.width + 2 * this.PADDING) + "px";
			div.style.height = (pos.height + 2 * this.PADDING) + "px";
			top = (pos.top - this.PADDING) + "px";
			left = (pos.left - this.PADDING) + "px";
			div.style.position = pos.position;

			// add the adding icon if the element covers enough space
			if (Math.min(pos.width, pos.height) >= 36) {
				div.style.backgroundImage = 'url(chrome://dta-public/skin/integration/added_large.png)';
			}
			if (Math.min(pos.width, pos.height) >= 18) {
				div.style.backgroundImage = 'url(chrome://dta-public/skin/integration/added_small.png)';
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
			setTimeoutOnlyFun(function() tp.fade(), this.FINTERVAL);
			return true;
		},
		hide: function() {
			let tp = this;
			setTimeoutOnlyFun(function() tp.fade(), this.FWAIT);
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
				div.style.zIndex = 2147483647;
				div.style.opacity = this.OPACITY;
				div.style.background = this.BACKGROUND;
				div.style.display = 'block';
				div.style.position = pos.position;
				div.style.width = this.WIDTH + 'px';
				div.style.height = this.WIDTH + 'px';
			}

			leftD.style.MozBorderRadiusTopleft = this.RADIUS + 'px';
			leftD.style.MozBorderRadiusBottomleft = this.RADIUS + 'px';
			leftD.style.left = (pos.left - this.WIDTH) + 'px';
			leftD.style.top = (pos.top - this.WIDTH) + 'px';
			leftD.style.height = (pos.height + this.WIDTH * 2) + 'px';

			rightD.style.MozBorderRadiusTopright = this.RADIUS + 'px';
			rightD.style.MozBorderRadiusBottomright = this.RADIUS + 'px';
			rightD.style.top = leftD.style.top;
			rightD.style.left = (pos.left + pos.width) + 'px';
			rightD.style.height = leftD.style.height;

			topD.style.left = pos.left + 'px';
			topD.style.top = (pos.top - this.WIDTH) + 'px';
			topD.style.width = pos.width + 'px';

			bottomD.style.left = pos.left + 'px';
			bottomD.style.top = (pos.top + pos.height) + 'px';
			bottomD.style.width = pos.width + 'px';
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
				this._flavors = new window.FlavourSet();
				this._flavors.appendFlavour('text/x-moz-url');
			}
			return this._flavors;
		},
		onDragOver: function() {},
		onDrop: function (evt, dropdata, session) {
			if (!dropdata) {
				return;
			}
			try {
				let url = window.transferUtils.retrieveURLFromData(dropdata.data, dropdata.flavour.contentType);
				url = Services.io.newURI(url, null, null);
				url = new DTA.URL(DTA.getLinkPrintMetalink(url) || url);
				let doc = document.commandDispatcher.focusedWindow.document;
				let ref = doc ? DTA.getRef(doc) : null;
				this.func(url, ref);
			}
			catch (ex) {
				if (DTA.Logger.enabled) {
					DTA.Logger.log("Failed to process drop", ex);
				}
			}
		}
	};

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
		function bindEvt(evt, fn) {
			return function (e) {
				e.addEventListener(evt, fn, true);
				unload(function() e.removeEventListener(evt, fn, true));
			}
		}
		function bindCtxEvt(ctx, evt, fn) {
			$(ctx, ctx + "-direct").forEach(bindEvt(evt, fn));
		}

		ctx.removeEventListener('popupshowing', initMenus, true);
		menu.removeEventListener('popupshowing', initMenus, true);

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

			bindEvt("command", function() DTA.openManager(window))($('dtaToolsManager'));

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

			$('dtaCtxPref', 'dtaCtxPref-direct', 'dtaToolsPrefs').forEach(
				bindEvt('command', function() DTA.Mediator.showPreferences(window))
			);

			bindEvt("command", function() DTA.Mediator.showAbout(window))($('dtaToolsAbout'));
			bindEvt("command", function() DTA.Mediator.showToolbarInstall(window))($('dtaToolsTBInstall'));
			bindEvt("popupshowing", onContextShowing)(ctx);
			bindEvt("popupshowing", onToolsShowing)(menu);
		}
		catch (ex) {
			Components.utils.reportError(ex);
			if (DTA.Logger.enabled) {
				DTA.Logger.log("DCO::init()", ex);
			}
		}
		evt.target == ctx ? onContextShowing(evt) : onToolsShowing(evt);
	}

	let unload = (function() {
		function unload_i(cb) {
			if (cb) {
				unloaders.push(cb);
				return;
			}

			while (unloaders.length) {
				let u = unloaders.pop();
				try {
					u();
				}
				catch (ex) {}
			}
			unloaders = [];
		}
		let unloaders = [];
		let listen;
		window.addEventListener("unload", listen = (function() {
			window.removeEventListener("unload", listen, false);
			unload_i();
			listen = null;
		}), false);

		return unload_i;
	})();

	ctx.addEventListener('popupshowing', initMenus, true);
	menu.addEventListener('popupshowing', initMenus, true);

	/*window.addEventListener("keydown", onKeyDown, false);
	unload(function() window.removeEventListener("keydown", onKeyDown, false));

	window.addEventListener("keyup", onKeyUp, false);
	unload(function() window.removeEventListener("keyup", onKeyUp, false));

	window.addEventListener("blur", onBlur, true);
	unload(function() window.removeEventListener("blur", onBlur, true));*/

	let appcontent = document.getElementById("appcontent");
	if (appcontent) {
		appcontent.addEventListener("DOMContentLoaded", onToolbarInstall, true);
		unload(function() appcontent.removeEventListener("DOMContentLoaded", onToolbarInstall, true));
	}

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
		if (DTA.Logger.enabled) {
			DTA.Logger.log("Failed to parse palette", ex);
		}
	}

	try {
		function dta_button_command(event) {
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
		}
		function dta_button_drag(event) nsDragAndDrop.dragOver(event, DropDTA);
		function dta_button_drop(event) nsDragAndDrop.drop(event, DropDTA);


		function dta_turbo_button_command(event) {
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
		}
		function dta_turbo_button_drag(event) nsDragAndDrop.dragOver(event, DropTDTA);
		function dta_turbo_button_drop(event) nsDragAndDrop.drop(event, DropTDTA);

		function dta_turboselect_button_command(event) { toggleOneClick(event); }
		function dta_manager_button_command() DTA.openManager(window);

		let DropTDTA = new DropProcessor(function(url, ref) { DTA.saveSingleLink(window, true, url, ref); });
		let DropDTA = new DropProcessor(function(url, ref) { DTA.saveSingleLink(window, false, url, ref); });

		let dta_button = $t('dta-button');
		dta_button.addEventListener('command', dta_button_command, true);
		unload(function() dta_button.removeEventListener('command', dta_button_command, true));
		dta_button.addEventListener('dragover', dta_button_drag, true);
		unload(function() dta_button.removeEventListener('dragover', dta_button_drag, true));
		dta_button.addEventListener('dragdrop', dta_button_drop, true);
		unload(function() dta_button.removeEventListener('dragdrop', dta_button_drop, true));


		let dta_turbo_button = $t('dta-turbo-button');
		dta_turbo_button.addEventListener('command', dta_turbo_button_command, true);
		unload(function() dta_turbo_button.removeEventListener('command', dta_turbo_button_command, true));
		dta_turbo_button.addEventListener('dragover', dta_turbo_button_drag, true);
		unload(function() dta_turbo_button.removeEventListener('dragover', dta_turbo_button_drag, true));
		dta_turbo_button.addEventListener('dragdrop', dta_turbo_button_drop, true);
		unload(function() dta_turbo_button.removeEventListener('dragdrop', dta_turbo_button_drop, true));

		let dta_turboselect_button = $t('dta-turboselect-button');
		dta_turboselect_button.addEventListener('command', dta_turboselect_button_command, true);
		unload(function() dta_turboselect_button.removeEventListener('command', dta_turboselect_button_command, true));
		unload(function() detachOneClick);

		let dta_manager_button = $t('dta-manager-button')
		dta_manager_button.addEventListener('command', dta_manager_button_command, true);
		unload(function() dta_manager_button.removeEventListener('command', dta_manager_button_command, true));

	}
	catch (ex) {
		if (DTA.Logger.enabled) {
			DTA.Logger.log("Init TBB failed", ex);
		}
	}

	if (outerEvent) {
		let target = outerEvent.target;
		let type = outerEvent.type;
		if (target === ctx || target == menu) {
			initMenus(outerEvent);
		}
		else if (type == "command" && target.id != "cmd_CustomizeToolbars") {
			target.doCommand();
		}
	}
}
