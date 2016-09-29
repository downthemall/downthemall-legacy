/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/* globals addEventListener, removeEventListener, setTimeout, content */

function Flasher(elem) {
	this.elem = elem;
	this.doc = elem.ownerDocument;
	this.init();
};
Flasher.prototype = {
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
		if (parent.nodeName !== 'IMG') {
			let boxen = parent.getElementsByTagName('*');
			for (let i = 0; i < boxen.length; ++i) {
				let box = boxen[i];
				if (!!box.style.float || box.style.position === 'fixed' || box.style.position === 'absolute') {
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
		let pos = (this.elem.style.position && this.elem.style.position === 'fixed') ? 'fixed' : 'absolute';
		while (parent) {
			ot += parent.offsetTop;
			ol += parent.offsetLeft;
			if (parent.style.position === 'fixed') {
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
		setTimeout(() => this.fade(), this.FINTERVAL);
		return true;
	},
	hide: function() {
		setTimeout(() => this.fade(), this.FWAIT);
	}
};

function Highlighter(elem) {
	this.elem = elem;
	this.doc = elem.ownerDocument;
	this.init();
};
Highlighter.prototype = {
	BACKGROUND: 'red',
	OPACITY: 0.4,
	RADIUS: 9,
	WIDTH: 3,

	calcPosition: Flasher.prototype.calcPosition,

	init: function() {
		let doc = this.doc;
		let elem = doc.documentElement;
		const div = () => doc.createElement('div');

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


function Selector(bgimages, handler) {
	this._callback = evt => {
		return this.onClickOneClick(evt);
	};
	this._handler = handler;

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
		if (url && url.primitiveType === content.CSSPrimitiveValue.CSS_URI) {
			return {elem: e, url: url.getStringValue()};
		}
		return this.getBgImage(e.parentNode);
	},
	findElemUnderCursor: function (e, n, a) {
		if (n === 'bgimg') {
			return this.getBgImage(e);
		}
		if (!e || !e.localName) {
			return null;
		}
		if (e.localName.toLowerCase() === n && e[a]) {
			if (n === "a") {
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
				if (!this._handler(doc, m)) {
					return false;
				}
				this.detachHilight();
				new Flasher(m.elem).hide();
				return true;
			}
			catch (ex) {
				log(LOG_ERROR, "processRegular", ex);
			}
			return false;
		}
		function highlightElement(e) {
			let m = this.findElemUnderCursor(target, e[0], e[1]);
			if (!m) {
				return false;
			}
			if (this._hilight && this._hilight.elem === m.elem) {
				return true;
			}
			this.detachHilight();
			this._hilight = new Highlighter(m.elem);
			return true;
		}

		if (evt.type === 'click') {
			if (evt.button === 0 && !!target &&
				target.nodeType === 1 &&
				(!target.namespaceURI || target.namespaceURI === 'http://www.w3.org/1999/xhtml')) {
				if (this._searchee.some(processRegular, this)) {
					this.cancelEvent(evt);
				}
			}
		}
		else if (evt.type === 'mousemove') {
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

exports.Selector = Selector;
