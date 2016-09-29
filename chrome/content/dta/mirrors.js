/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/* jshint browser:true */
"use strict";
/* global _, DTA, $, $$, Utils, Preferences, getDefaultDownloadsDirectory, unloadWindow */
/* global toURI, toURL, setTimeoutOnlyFun */
var Prompts = require("prompts");

var {LoggedPrompter} = require("support/loggedprompter");
LoggedPrompter = new LoggedPrompter(window).prompter;

/* global mirrors */
this.__defineGetter__(
	'mirrors',
	function() {
		delete this.mirrors;
		return (this.mirrors = $('mirrors'));
	}
);

/* global allMirrors */
this.__defineGetter__(
	'allMirrors',
	function*() {
		for (let m = 0; m < mirrors.itemCount; ++m) {
			yield mirrors.getItemAtIndex(m);
		}
	}
);

function accept() {
	if (!window.arguments || !window.arguments.length) {
		return;
	}
	let rv = window.arguments[0];
	for (let m of allMirrors) {
		rv.push(new DTA.URL(toURL(m.mirror, m.charset), m.preference));
	}
	return true;
}

function select() {
	let removeDisabled = !mirrors.selectedCount || (mirrors.itemCount - mirrors.selectedCount) < 1;
	$('cmdRemove', 'mirrorRemove').forEach(e => e.setAttribute("disabled", removeDisabled));
}

function changingMirror(event) {
	for (let m of allMirrors) {
		if (event.target === m) {
			continue;
		}
		if (event.newValue === m.mirror) {
			Prompts.alert(window, _('duplicatetitle'), _('duplicatetext'));
			event.preventDefault();
			return;
		}
	}
	// clear the state
	event.target.removeAttribute('state');
}

function load() {
	removeEventListener('load', load, true);
	if (window.arguments && window.arguments.length) {
		let downloads = Utils.naturalSort(window.arguments[0], e => e.url.host + "/" + e.url.spec);
		for (let a of downloads) {
			try {
				let mirror = document.createElement('richlistitem');
				mirror.setAttribute('mirror', a.url.spec);
				mirror.setAttribute('preference', a.preference);
				mirror.url = a;
				mirrors.appendChild(mirror);
			}
			catch (ex) {
				log(LOG_ERROR, "Failed to add" + a, ex);
			}
		}
		// clear the array; we'll reuse it for return values
		window.arguments[0].length = 0;
	}
	addEventListener('dialogaccept', accept, true);

	mirrors.addEventListener('select', select, true);
	mirrors.addEventListener('MirrorChanging', changingMirror, true);
	select();
	window.sizeToContent();
}

function addMirror() {
	let url = '';
	try {
		let trans = new Instances.Transferable();
		trans.addDataFlavor("text/unicode");
		Services.clipbrd.getData(trans, Services.clipbrd.kGlobalClipboard);

		let str = {}, len = {};
		trans.getTransferData("text/unicode", str, len);
		if (len.value && (str.value instanceof Ci.nsISupportsString)) {
			url = (new DTA.URL(Services.io.newURI(str.value.data, null, null))).url.spec;
		}
	}
	catch (ex) {
		log(LOG_ERROR, "cb", ex);
	}
	let mirror = document.createElement('richlistitem');
	mirror.setAttribute('preference', 50);
	mirror.setAttribute('editing', true);
	$('mirrors').appendChild(mirror);
	mirror.textbox.value = url;
	mirror.textbox.select();
	mirror.addEventListener(
		'MirrorEditDone',
		function() {
			if (!mirror.getAttribute('mirror')) {
				mirror.parentNode.removeChild(mirror);
			}
		},
		true
	);
}

function removeMirrors() {
	for (let item of mirrors.selectedItems) {
		mirrors.removeChild(item);
	}
	select();
}

function checkMirrors() {
	let button = $('mirrorCheck');

	let pending = [];
	let running = 0;
	let bad = [];
	let requests = new Set();
	let good = {};
	let numGoodLengths = 0;

	function addGood(cl, m) {
		if (!(cl in good)) {
			good[cl] = [];
			numGoodLengths++;
		}
		good[cl].push(m);
		m._cl = cl;
	}

	function Callbacks(req) {
		this._old = req.channel.notificationCallbacks;
		req.channel.notificationCallbacks = this;
	}
	Callbacks.prototype = {
		QueryInterface: QI([Ci.nsIInterfaceRequestor]),
		getInterface: function(iid) {
			if (iid.equals(Ci.nsIPrompt)) {
				return LoggedPrompter;
			}
			if (this._old) {
				return this._old.getInterface(iid);
			}
			throw Components.results.NS_ERROR_NO_INTERFACE;
		}
	};

	/* jshint -W003 */
	function finish() {
		if (numGoodLengths > 1) {
			let max;
			let maxCL;
			for (let cl in good) {
				if (!max || good[cl].length > max) {
					max = good[cl].length;
					maxCL = cl;
				}
			}
			for (let cl in good) {
				if (cl === maxCL) {
					continue;
				}
				for (let m of good[cl]) {
					log(LOG_INFO, m.mirror + " has a cl of " + cl + " but the majority of mirrors uses " + maxCL);
					m.setAttribute('state', 'bad');
					m.setAttribute('error', _('sizecheckerror'));
					bad.push(m);
				}
			}
		}
		if (bad.length && (mirrors.itemCount - bad.length) > 0 &&
				Prompts.confirm(
					window,
					_('removebadmirrors.caption'),
					_('removebadmirrors.message', [bad.length]),
					_('removebadmirrors.keep'), // XXX swap
					_('removebadmirrors.remove')
			)) {
			for (let b of bad) {
				b.parentNode.removeChild(b);
			}
		}
		button.disabled = false;
	}


	function finishRequest(req, error) {
		let m = req.mirror;
		let state = 'bad';
		requests.delete(req);
		error = error || _('genericcheckerror');
		try {
			error = req.statusText || error;
		}
		catch (ex) {
			// no op
		}
		try {
			let cl = req.channel.QueryInterface(Ci.nsIPropertyBag2).getPropertyAsUint64('content-length');
			if (req.channel instanceof Ci.nsIFTPChannel) {
				if (cl > 0) {
					state = 'good';
					error = _('mirrorok');
					addGood(cl, m);
				}
			}
			else if (req.status >= 200 && req.status < 300) {
				state = 'good';
				error = _('mirrorok');
				addGood(cl, m);
			}
		}
		catch (ex) {
			log(LOG_ERROR, "Check Request failed", ex);
		}
		m.setAttribute("state", state);
		m.setAttribute("error", error);
		if (state === 'bad') {
			bad.push(m);
		}
		if (!--running) {
			finish();
		}
		else if (pending.length) {
			makeRequest(pending.shift());
		}
	}

	function makeRequest(m) {
		let req = new XMLHttpRequest();
		req.mirror = m;
		req.addEventListener("load", function() {
			finishRequest(req);
		}, false);
		req.addEventListener("error", function() {
			finishRequest(req);
		}, false);
		requests.add(req);
		try {
			req.open('HEAD', m.mirror);
			req._callbacks = new Callbacks(req);
			req.send(null);
		}
		catch (ex) {
			finishRequest(req);
		}
	}
	/* jshint +W003 */

	function timeout() {
		for (let req of requests) {
			log(LOG_INFO, req.mirror.mirror + " is a timeout");
			req.abort();
			finishRequest(req);
		}
	}

	for (let m of allMirrors) {
		if (m.hasAttribute('state')) {
			if (m.getAttribute('state') === 'bad') {
				bad.push(m);
			}
			else {
				addGood(m._cl, m);
			}
			// skip already tested mirrors
			continue;
		}
		pending.push(m);
	}
	if ((running = pending.length) > 0) {
		button.disabled = true;
		for (let i = 0, e = Math.min(running, 16); i < e; ++i) {
			makeRequest(pending.shift());
		}
	}
	else {
		finish();
	}
	setTimeoutOnlyFun(timeout, 20000);
}

addEventListener('load', load, true);
unloadWindow(window, function() {
	log(LOG_DEBUG, "closed a mirror window");
	close();
});
