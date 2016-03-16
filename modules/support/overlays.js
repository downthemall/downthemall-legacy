/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {defer} = require("./defer");
const obs = require("./observers");

/**
 * Specialized unloader that will trigger whenever either the window gets
 * unloaded or the add-on is shut down
 */
exports.unloadWindow = function unloadWindow(window, fn) {
	let args = arguments;
	let handler = unload(function() {
		window.removeEventListener('unload', handler, false);
		try {
			fn.apply(null, args);
		}
		catch (ex) {
			log(LOG_ERROR, "failed to run window unloader", ex);
		}
	});
	window.addEventListener('unload', handler, false);
	return handler;
};

// Watch for new browser windows opening then wait for it to load
var watchers = new Map();
function runOnLoad(window) {
	window.addEventListener("DOMContentLoaded", function windowWatcher_onload() {
		window.removeEventListener("DOMContentLoaded", windowWatcher_onload, false);
		let _w = watchers.get(window.location.toString());
		if (!_w || !_w.length) {
			return;
		}
		for (let i = _w.length; ~--i;) {
			_w[i](window);
		}
	}, false);
}
function windowWatcher(window,t,d) {
	runOnLoad(window);
}
obs.add(windowWatcher, "chrome-document-global-created");
// Make sure to stop watching for windows if we're unloading
unload(function() {
	watchers = null;
});

/**
 * Apply a callback to each open and new browser windows.
 */
exports.watchWindows = function watchWindows(location, callback) {
	// Wrap the callback in a function that ignores failures
	function watcher(window) {
		try {
			callback(window, window.document);
		}
		catch(ex) {
			log(LOG_ERROR, "window watcher failed", ex);
		}
	}
	let _w = watchers.get(location);
	if (!_w) {
		watchers.set(location, _w = []);
	}
	_w.push(watcher);

	// Add functionality to existing windows
	let windows = Services.wm.getEnumerator(null);
	while (windows.hasMoreElements()) {
		// Only run the watcher immediately if the browser is completely loaded
		let w = windows.getNext();
		if (w.document.readyState === "complete" && w.location.toString() === location) {
			watcher(w);
		}
	}
};
const overlayCache = new Map();
/**
 * Register a new overlay (XUL)
 */
exports.registerOverlay = function registerOverlay(src, location, callback) {
	function inject(xul, window, document) {
		function $(id) {
			return document.getElementById(id);
		}
		function $$(q) {
			return document.querySelector(q);
		}

		// loadOverlay for the poor
		function addNode(target, node) {
			// helper: insert according to position
			function insertX(nn, attr, callback) {
				if (!nn.hasAttribute(attr)) {
					return false;
				}
				let places = nn.getAttribute(attr)
					.split(',')
					.map(p => p.trim())
					.filter(p => !!p);
				for (let p of places) {
					let pn = $$('#' + target.id + ' > #' + p);
					if (!pn) {
						continue;
					}
					callback(pn);
					return true;
				}
				return false;
			}

			// bring the node to be inserted into the document
			let nn = document.importNode(node, true);

			// try to insert according to insertafter/before
			if (!insertX(nn, 'insertafter', function(pn) { pn.parentNode.insertBefore(nn, pn.nextSibling); }) &&
				!insertX(nn, 'insertbefore', function(pn) { pn.parentNode.insertBefore(nn, pn); })) {
				// just append
				target.appendChild(nn);
			}
			return nn;
		}

		try {
			// store unloaders for all elements inserted
			let unloaders = [];

			// apply styles
			if (window instanceof Ci.nsIInterfaceRequestor) {
				let winUtils = window.getInterface(Ci.nsIDOMWindowUtils);
				for (let data of xul.styles) {
					try {
						let uri = Services.io.newURI(data, null, null);
						winUtils.loadSheet(uri, Ci.nsIDOMWindowUtils.AUTHOR_SHEET);
						unloaders.push(function() {
							winUtils.removeSheet(uri, Ci.nsIDOMWindowUtils.AUTHOR_SHEET);
						});
					}
					catch (ex) {
						log(LOG_ERROR, "failed to load sheet: " + data, ex);
					}
				}
			}

			// Add all overlays
			for (let node of xul.nodes) {
				let id = node.getAttribute("id");
				let target = $(id);
				if (!target && id === "BrowserToolbarPalette") {
					target = $("navigator-toolbox");
					target = target && target.palette;
				}
				if (!target) {
					log(LOG_DEBUG, "no target for " + id + ", not inserting");
					continue;
				}

				// set attrs
				for (let [,a] in new Iterator(node.attributes)) {
					let k = a.name;
					if (k === "id" || k === "insertbefore" || k === "insertafter") {
						continue;
					}
					target.setAttribute(k, a.value);
				}

				// insert all children
				for (let n = node.firstChild; n; n = n.nextSibling) {
					if (n.nodeType !== n.ELEMENT_NODE) {
						continue;
					}
					let nn = addNode(target, n);
					unloaders.push(() => nn.parentNode.removeChild(nn));
				}
			}

			// install per-window unloader
			if (unloaders.length) {
				exports.unloadWindow(window, () => unloaders.forEach(u => u()));
			}

			if (callback) {
				defer(() => callback(window, document));
			}
		}
		catch (ex) {
			log(LOG_ERROR, "failed to inject xul", ex);
		}
	}

	if (overlayCache.has(src)) {
		exports.watchWindows(location, inject(null, overlayCache.get(src)));
		return;
	}

	let _r = new Instances.XHR();
	_r.onload = function() {
		let doc = _r.responseXML;

		// clean the document a bit
		let emptyNodes = doc.evaluate("//text()[normalize-space(.) = '']", doc, null, 7, null);
		for (let i = 0, e = emptyNodes.snapshotLength; i < e; ++i) {
			let n = emptyNodes.snapshotItem(i);
			n.parentNode.removeChild(n);
		}

		// prepare all elements to be inserted
		let xul = {styles: [], nodes: []};
		for (let n = doc.firstChild; n; n = n.nextSibling) {
			if (n.nodeType !== 7 || n.target !== "xml-stylesheet") {
				continue;
			}
			xul.styles.push(n.data.replace(/^.*href=(["'])(.*?)\1.*$/, "$2"));
		}
		for (let n = doc.documentElement.firstChild; n; n = n.nextSibling) {
			if (n.nodeType !== n.ELEMENT_NODE || !n.hasAttribute("id")) {
				continue;
			}
			xul.nodes.push(n);
		}
		if (!xul.styles.length && !xul.nodes.length) {
			log(LOG_ERROR, "There is only XUL ... but there wasn't" + _r.responseText);
			return;
		}
		overlayCache.set(src, xul);
		exports.watchWindows(location, inject.bind(null, xul));
	};
	_r.onerror = _r.onabort = function() {
		log(LOG_ERROR, "Failed to load " + src);
	};
	_r.overrideMimeType("application/xml");
	_r.open("GET", src);
	let sec = Cc['@mozilla.org/scriptsecuritymanager;1'].getService(Ci.nsIScriptSecurityManager);
	try {
		_r.channel.owner = sec.getSystemPrincipal();
	}
	catch (ex) {
		log(LOG_ERROR, "Failed to set system principal");
	}
	_r.send();
};

/* vim: set et ts=2 sw=2 : */
