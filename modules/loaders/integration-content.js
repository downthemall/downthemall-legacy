/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

(function() {

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

let {Services} = Cu.import("resource://gre/modules/Services.jsm", {});
let isWindowPrivate = () => false;
try {
	let {PrivateBrowsingUtils} = Cu.import("resource://gre/modules/PrivateBrowsingUtils.jsm", {});
	isWindowPrivate = w => PrivateBrowsingUtils.isWindowPrivate(w);
}
catch (ex) {
	// no op
}

const require = function require_mini(m) {
	let scope = {
		exports: {}
	};
	let module = "chrome://dta-modules/content/" + m + ".js";
	Services.scriptloader.loadSubScript(module, scope);
	return scope.exports;
};

const TextLinks = require("support/textlinks");
const [LOG_DEBUG, LOG_INFO, LOG_ERROR] = [0, 1, 2];
const log = function(level, message, exception) {
	sendAsyncMessage("DTA:log", {
		level: level,
		message: message,
		exception: exception && {
			message: exception.message,
			fileName: exception.fileName,
			lineNumber: exception.lineNumber,
			stack: exception.stack
		}
	});
};

/* **
 * Helpers and tools
 */
const trimMore = function(t) {
	return t.replace(/^[\s_]+|[\s_]+$/gi, '').replace(/(_){2,}/g, "_");
};

const URL = function(u) {
	this.spec = u.spec;
	this.originCharset = u.originCharset;
};

const composeURL = function composeURL(doc, rel) {
	// find <base href>
	let base = doc.location.href;
	let bases = doc.getElementsByTagName('base');
	for (var i = 0; i < bases.length; ++i) {
		if (bases[i].hasAttribute('href')) {
			base = bases[i].getAttribute('href');
			break;
		}
	}
	return Services.io.newURI(rel, doc.characterSet, Services.io.newURI(base, doc.characterSet, null));
};

const getRef = function getRef(doc) {
	try {
		return new URL(Services.io.newURI(doc.URL, doc.characterSet, null));
	}
	catch (ex) {
		let b = doc.getElementsByTagName('base');
		for (let i = 0; i < b.length; ++i) {
			if (!b[i].hasAttribute('href')) {
				continue;
			}
			try {
				return new URL(composeURL(doc, b[i].getAttribute('href')));
			}
			catch (e) {
				continue;
			}
		}
	}
};

const extractDescription = function extractDescription(child) {
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

			if (c.nodeValue && c.nodeValue) {
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
		log(LOG_ERROR, 'extractDescription', ex);
	}
	return trimMore(rv.join(" "));
};

const addLinksToArray = function* addLinksToArray(lnks, urls, doc) {
	if (!lnks || !lnks.length) {
		return;
	}

	let ref = getRef(doc);

	let defaultDescription = trimMore(doc.title || "");

	for (let link of lnks) {
		try {
			let url = Services.io.newURI(link.href, doc.characterSet, null);

			let title = '';
			if (link.hasAttribute('title')) {
				title = trimMore(link.getAttribute('title'));
			}
			if (!title && link.hasAttribute('alt')) {
				title = trimMore(link.getAttribute('alt'));
			}
			const item = {
				'url': new URL(url),
				'referrer': ref && new URL(ref),
				'description': extractDescription(link),
				'defaultDescription': defaultDescription,
				'title': title
			};
			let fn = link.getAttribute("download");
			if (fn && (fn = fn.trim())) {
				item.fileName = fn;
			}
			urls.push(item);
		}
		catch (ex) {
			// no op
		}
		yield true;
	}
};

const addImagesToArray = function* addImagesToArray(lnks, images, doc)	{
	if (!lnks || !lnks.length) {
		return;
	}

	let ref = getRef(doc);
	let defaultDescription = trimMore(doc.title || "");

	for (let l of lnks) {
		try {
			let url = composeURL(doc, l.src);

			let desc = '';
			if (l.hasAttribute('alt')) {
				desc = trimMore(l.getAttribute('alt'));
			}
			else if (l.hasAttribute('title')) {
				desc = trimMore(l.getAttribute('title'));
			}
			images.push({
				'url': new URL(url),
				'referrer': ref && new URL(ref),
				'defaultDescription': defaultDescription,
				'description': desc
			});
		}
		catch (ex) {
			// no op
		}
		yield true;
	}
};

const getTextLinks = function getTextLinks(set, out, fakeLinks) {
	let rset = [];
	for (let r = set.iterateNext(); r; r = set.iterateNext()) {
		rset.push(r);
	}
	for (let r of rset) {
		try {
			r = r.textContent.replace(/^\s+|\s+$/g, "");
			if (r) {
				for (let link of TextLinks.getTextLinks(r, fakeLinks)) {
					out.push(link);
				}
				yield true;
			}
		}
		catch (ex) {
			// no op: might be an already removed node
		}
	}
};

const filterInSitu = function filterInSitu(arr, cb, tp) {
	tp = tp || null;

	// courtesy of firefox-sync
	let i, k, e;
	for (i = 0, k = 0, e = arr.length; i < e; i++) {
		let a = arr[k] = arr[i]; // replace filtered items
		if (a && cb.call(tp, a, i, arr)) {
			k += 1;
		}
	}
	arr.length = k;
	return arr;
};

const filterMapInSitu = function filterMapInSitu(arr, filterStep, mapStep, tp) {
	tp = tp || null;
	let i, k, e;
	for (i = 0, k = 0, e = arr.length; i < e; i++) {
		let a = arr[i]; // replace filtered items
		if (a && filterStep.call(tp, a, i, arr)) {
			arr[k] = mapStep.call(tp, a, i, arr);
			k += 1;
		}
	}
	arr.length = k;
	return arr;
};

const unique = i => {
	return filterInSitu(i, function(e) {
		let u = e.url.spec;
		let other = this[u];
		if (other) {
			if (!other.description) {
				other.description = e.description;
			}
			return false;
		}
		this[u] = e;
		return true;
	}, Object.create(null));
};

//recursively add stuff.
const addLinks = function* addLinks(aWin, aURLs, aImages, aLocations, honorSelection, recognizeTextLinks) {
	try {
		yield true;
		let links = Array.slice(aWin.document.querySelectorAll("a"));
		yield true;
		let images = Array.slice(aWin.document.querySelectorAll("img"));
		yield true;
		let videos = Array.slice(aWin.document.querySelectorAll("video, audio, video > source, audio > source"));
		filterInSitu(videos, function(e) !!e.src);
		yield true;

		let embeds = Array.slice(aWin.document.embeds);
		yield true;

		let rawInputs = Array.slice(aWin.document.querySelectorAll("input"));
		let inputs = [];
		for (let i = 0, e = rawInputs.length; i < e; ++i) {
			let rit = rawInputs[i].getAttribute('type');
			if (!rit || rit.toLowerCase() != 'image') {
				continue;
			}
			inputs.push(rawInputs[i]);
		}
		yield true;

		let sel = null;
		if (honorSelection && (sel = aWin.getSelection()) && !sel.isCollapsed) {
			log(LOG_INFO, "selection only");
			[links, images, videos, embeds, inputs].forEach(
					function(e) filterInSitu(e, function(n) sel.containsNode(n, true)));
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
					"//*[not(ancestor-or-self::a) and " +
					"not(ancestor-or-self::style) and " +
					"not(ancestor-or-self::script)]/text()",
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
			aLocations.push({
				url: new URL(Services.io.newURI(aWin.location.href, aWin.document.characterSet, null)),
				isPrivate: isWindowPrivate(aWin),
				title: aWin.document.title
			});
			if (recognizeTextLinks) {
				let set = aWin.document.evaluate(
					"//*[not(ancestor-or-self::a) and " +
					"not(ancestor-or-self::style) and " +
					"not(ancestor-or-self::script)]/text()",
					aWin.document,
					null,
					aWin.XPathResult.ORDERED_NODE_ITERATOR_TYPE,
					null
				);
				for (let y of getTextLinks(set, links, true)) {
					yield true;
				}
			}

			// we were asked to honor the selection, but we didn't actually have one.
			// so reset this flag so that we can continue processing frames below.
			honorSelection = false;
		}

		log(LOG_DEBUG, "adding links to array");
		for (let y of addLinksToArray(links, aURLs, aWin.document)) {
			yield true;
		}
		for (let e of [images, videos, embeds, inputs]) {
			for (let y of addImagesToArray(e, aImages, aWin.document)) {
				yield true;
			}
		}
		for (let y of addImagesToArray(
			filterMapInSitu(videos, function(e) !!e.poster, function(e) new TextLinks.FakeLink(e.poster)),
			aImages,
			aWin.document
		)) {
			yield true;
		}
	}
	catch (ex) {
		log(LOG_ERROR, "addLinks", ex);
	}

	// do not process further as we just filtered the selection
	if (honorSelection) {
		return;
	}

	// recursively process any frames
	if (aWin.frames) {
		for (let i = 0, e = aWin.frames.length; i < e; ++i) {
			for (let y of addLinks(aWin.frames[i], aURLs, aImages, aLocations, false, recognizeTextLinks)) {
				yield true;
			}
		}
	}
};

const handleFindLinks = message => {
	log(LOG_DEBUG, "FindLinks job received" + message.data.job);
	let urls = [];
	let images = [];
	let locations = [];
	let job = message.data.job;
	let honorSelection = message.data.honorSelection;
	let recognizeTextLinks = message.data.recognizeTextLinks;
	let win = content;
	if (honorSelection) {
		let fm = Cc["@mozilla.org/focus-manager;1"].getService(Ci.nsIFocusManager);
		let focusedWindow = {};
		fm.getFocusedElementForWindow(content, true, focusedWindow);
		if (focusedWindow.value && !focusedWindow.value.getSelection().isCollapsed) {
			win = focusedWindow.value || win;
		}
	}
	let gen = addLinks(win, urls, images, locations, honorSelection, recognizeTextLinks);
	let send = () => {
		try {
			sendAsyncMessage("DTA:findLinks:" + job, {
				urls: unique(urls),
				images: unique(images),
				locations: locations
			});
		}
		catch (ex) {
			log(LOG_ERROR, "findLinks, failed to send", ex);
		}
	};
	let lastUrls = 0, lastImages = 0;
	let runner = () => {
		log(LOG_DEBUG, "findLinks: Runner iteration");
		let deadline = +(new Date()) + 60;
		while (deadline >= +(new Date())) {
			try {
				let result = gen.next();
				if (result.done || !result.value) {
					send();
					return;
				}
			}
			catch (ex) {
				log(LOG_ERROR, "findLinks failed", ex);
				return;
			}
		}
		sendAsyncMessage("DTA:findLinks:progress:" + job, {
			urls: urls.length - lastUrls,
			images: images.length - lastImages
		});
		lastUrls = urls.length;
		lastImages = images.length;
		setTimeout(runner, 0);
	};
	setTimeout(runner, 0);
}

const handleGetLocations = m => {
	log(LOG_DEBUG, "GetLocations job received" + m.data.job);
	let locations = [];
	let collect = w => {
		locations.push({
			url: new URL(Services.io.newURI(w.location.href, w.document.characterSet, null)),
			isPrivate: isWindowPrivate(w),
			title: w.document.title
		});
		if (!w.frames) {
			return;
		}
		for (let i = 0, e = w.frames.length; i < e; ++i) {
			collect(w.frames[i]);
		}
	};
	collect(content);
	sendAsyncMessage("DTA:getLocations:" + m.data.job, locations);
};

const handleGetFocusedDetails = m => {
	log(LOG_DEBUG, "GetFocusedDetails job received" + m.data.job);
	let ref = getRef(content.document);
	sendAsyncMessage("DTA:getFocusedDetails:" + m.data.job, {title: content.title, ref: ref && new URL(ref)});
};

const handleGetFormData = m => {
	try {
		let ctx = m.objects.target;
		let form = ctx.form;
		if (!form) {
			throw new Error("no form");
		}
		let action = new URL(composeURL(form.ownerDocument, form.action));

		let values = [];
		for (let i = 0; i < form.elements.length; ++i) {
			if (!form.elements[i].name) {
				continue;
			}
			let v = encodeURIComponent(form.elements[i].name) + "=";
			if (form.elements[i].value) {
				v += encodeURIComponent(form.elements[i].value);
			}
			values.push(v);
		}
		action.values = values.join("&");
		action.method = form.method.toLowerCase() == 'post' ? "post" : "get";
		action.desc = extractDescription(form);
		action.title = ctx.ownerDocument.defaultView.title;
		action.ref = getRef(ctx.ownerDocument);
		sendAsyncMessage("DTA:getFormData:" + m.data.job, action);
	}
	catch (ex) {
		log(LOG_ERROR, "Failed to get form data", ex);
		sendAsyncMessage("DTA:getFormData:" + m.data.job, {exception: ex.message || ex});
	}
}

const handleSaveTarget = m => {
	try {
		let cur = m.objects.target;
		let doc = cur.ownerDocument;
		let rv;
		let what = m.data.args.what;
		while (cur && cur.localName.toLowerCase() != what) {
			if (what == "video" || what == "audio") {
				let cn = cur.getElementsByTagName(what);
				if (cn.length) {
					cur = cn[0];
					break;
				}
			}
			cur = cur.parentElement;
		}
		switch (what) {
			case "a": {
				rv = new URL(composeURL(doc, cur.href));
				rv.download = cur.getAttribute("download");
				break;
			}
			case "img":
				rv = new URL(composeURL(doc, cur.src));
				break;
			case "audio":
			case "video": {
				if (!cur.src && !cur.currentSrc) {
					cur = cur.getElementsByTagName('source')[0];
				}
				rv = new URL(composeURL(doc, cur.src || cur.currentSrc));
				break;
			}
			default:
				throw new Error("unhandled type " + m.data.args.what);
		}

		if (!rv || !cur) {
			throw new Error("Failed");
		}

		rv.title = doc.title || "";
		rv.desc = extractDescription(cur);
		rv.ref = getRef(doc);

		sendAsyncMessage("DTA:saveTarget:" + m.data.job, rv);
	}
	catch (ex) {
		log(LOG_ERROR, "Failed to get form data", ex);
		sendAsyncMessage("DTA:saveTarget:" + m.data.job, {exception: ex.message || ex});
	}
};

function Selector(bgimages) {
	this._callback = evt => {
		return this.onClickOneClick(evt);
	};

	addEventListener('click', this._callback, true);
	addEventListener('mouseup', this._callback, false);
	addEventListener('mousemove', this._callback, false);
	this.observe(bgimages);
}
Selector.prototype = {
	dispose: function() {
		removeEventListener('click', this._callback, true);
		removeEventListener('mouseup', this._callback, false);
		removeEventListener('mousemove', this._callback, false);
		this.detachHilight();
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
		if (url && url.primitiveType == content.CSSPrimitiveValue.CSS_URI) {
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
			if (n == "a") {
				return {elem: e, url: e[a], download: e.getAttribute("download")};
			}
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
				let rv = new URL(composeURL(doc, m.url));
				rv.title = doc.title || "";
				rv.desc = extractDescription(m.elem);
				rv.ref = getRef(doc);
				rv.download = m.download;

				sendAsyncMessage("DTA:selected", rv);
				this.detachHilight();
				new this.Flasher(m.elem).hide();
			}
			catch (ex) {
				log(LOG_ERROR, "processRegular", ex);
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
			if (evt.button === 0 && !!target &&
				target.nodeType == 1 &&
				(!target.namespaceURI || target.namespaceURI == 'http://www.w3.org/1999/xhtml')) {
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
	observe: function(bgimgs) {
		let searchee = [
			['a', 'href'],
			['img', 'src']
		];
		if (bgimgs) {
			searchee.push(['bgimg', 'bgimg']);
		}
		this._searchee = searchee;
	}
};

Selector.prototype.Flasher = function(elem) {
	this.elem = elem;
	this.doc = elem.ownerDocument;
	this.init();
};
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
		div.style.top = (pos.top - this.PADDING) + "px";
		div.style.left = (pos.left - this.PADDING) + "px";
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
};
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
		for (let div of this._divs) {
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
		for (let div of this._divs) {
			div.parentNode.removeChild(div);
		}
	}
};

let _sel = null;

const handleSelector = m => {
	if (_sel) {
		if (!m.data.enable) {
			_sel.dispose();
			_sel = null;
		}
		return;
	}

	if (!_sel && m.data.enable) {
		_sel = new Selector(m.data.bgimgs);
	}
};

const methods = new Map([
	["findLinks", handleFindLinks],
	["getLocations", handleGetLocations],
	["getFocusedDetails", handleGetFocusedDetails],
	["getFormData", handleGetFormData],
	["saveTarget", handleSaveTarget],
	["selector", handleSelector]
]);

(function() {
	try {
		const handleShutdown = m => {
			for (let e of methods.entries()) {
				removeMessageListener(`DTA:${e[0]}`, e[1]);
			}
			removeMessageListener("DTA:shutdown", handleShutdown);
		};
		for (let e of methods.entries()) {
			addMessageListener(`DTA:${e[0]}`, e[1]);
		}
		addMessageListener("DTA:shutdown", handleShutdown);
	}
	catch (ex) {
		log(LOG_ERROR, "ahue", ex);
	}
})();

sendAsyncMessage("DTA:new");

})();
