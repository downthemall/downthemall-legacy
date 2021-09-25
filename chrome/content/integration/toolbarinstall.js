/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/*global window, close, document, opener, removeEventListener, addEventListener */

var all = ['dta-button', 'dta-turbo-button', 'dta-turboselect-button', 'dta-manager-button'];

function $(id) {
	return document.getElementById(id);
}
function $o(id) {
	return opener.document.getElementById(id);
}

function discard() {
	if (opener) {
		opener.removeEventListener("unload", discard, false);
	}
	removeEventListener("unload", discard, false);
	close();
}

opener.addEventListener("unload", discard, false);
addEventListener("unload", discard, false);

addEventListener("load", function load() {
	removeEventListener("load", load, false);

	all.forEach(b => $(b).checked = !!$o(b));
	window.sizeToContent();

}, false);

addEventListener("dialogaccept", function accept() {
	removeEventListener("dialogaccept", accept, true);

	let newActive = all.filter(b => $(b).checked);

	if (opener.CustomizableUI) {
		for (let b of all) {
			let placement = opener.CustomizableUI.getPlacementOfWidget(b);
			if (newActive.indexOf(b) === -1) {
				// Remove
				if (placement) {
					opener.CustomizableUI.removeWidgetFromArea(b);
				}
			}
			else {
				if (!placement) {
					// New and not placed yet
					placement = {area: 'nav-bar', position: undefined};
					opener.CustomizableUI.addWidgetToArea(b, placement.area, placement.position);
					opener.CustomizableUI.ensureWidgetPlacedInWindow(b, opener);
				}
			}
		}
		return;
	}

	let tb = $o('nav-bar');
	for (let b of all) {
		let btn = $o(b);
		if (newActive.indexOf(b) !== -1 && !btn) {
			// add the button
			let currentSet = tb.currentSet.split(',');

			// find the best position
			let spliceIdx = -1;
			let dist = (1<<30);
			for (let rb of all) {
				let cidx = currentSet.indexOf(rb);
				if (cidx === -1) {
					continue;
				}
				let cdiff = all.indexOf(rb) - all.indexOf(b);
				let cdist = Math.abs(cdiff);
				if (cdist < dist) {
					dist = cdist;
					spliceIdx = cdiff < 0 ? cidx + 1 : cidx;
				}
			}

			// insert button at the best position
			if (spliceIdx !== -1) {
				currentSet.splice(spliceIdx, 0, b);
			}
			else {
				currentSet.push(b);
			}
			tb.currentSet = currentSet.join(",");
			tb.setAttribute("currentset", tb.currentSet);
			opener.document.persist(tb.id, "currentset");
		}
		else if (newActive.indexOf(b) === -1 && btn) {
			// Remove a button again
			// Note that the toolbar is not necessarily nav-bar
			let tbb = btn.parentNode;
			/* jshint -W083 */
			tbb.currentSet = tbb.currentSet
				.split(',')
				.filter(id => id !== b)
				.join(",");
			tbb.setAttribute("currentset", tbb.currentSet);
			opener.document.persist(tbb.id, "currentset");
		}
	}

	try {
		var evt = document.createEvent("Events");
		evt.initEvent("aftercustomization", true, true);
		tb.toolbox.dispatchEvent(evt);
		if ("BrowserToolboxCustomizeDone" in opener) {
			opener.BrowserToolboxCustomizeDone(true);
		}
	} catch(ex) {}
}, true);
