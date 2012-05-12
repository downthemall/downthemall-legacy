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
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
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

const Prompts = require("prompts");
const {LoggedPrompter} = require("support/loggedprompter");

LoggedPrompter = new LoggedPrompter(window).prompter;

this.__defineGetter__(
	'mirrors',
	function() {
		delete this.mirrors;
		return (this.mirrors = $('mirrors'));
	}
);

this.__defineGetter__(
	'allMirrors',
	function() {
		for (let m = 0; m < mirrors.itemCount; ++m) {
			yield mirrors.getItemAtIndex(m);
		}
	}
);


function load() {
	removeEventListener('load', arguments.callee, true);
	if (window.arguments && window.arguments.length) {
		let downloads = Utils.naturalSort(window.arguments[0], function(e) e.url.host + "/" + e.url.spec);
		for each (let a in downloads) {
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
		window.arguments[0].splice(0);
	}
	addEventListener('dialogaccept', accept, true);

	with (mirrors) {
		addEventListener('select', select, true);
		addEventListener('MirrorChanging', changingMirror, true);
	}
	select();
}

function accept() {
	if (!window.arguments || !window.arguments.length) {
		return;
	}
	let rv = window.arguments[0];
	for (let m in allMirrors) {
		rv.push(new DTA.URL(m.mirror.toURL(m.charset), m.preference));
	}
	return true;
}

function select() {
	let removeDisabled = !mirrors.selectedCount || (mirrors.itemCount - mirrors.selectedCount) < 1;
	$('cmdRemove', 'mirrorRemove').forEach(function(e) e.setAttribute("disabled", removeDisabled));
}

function changingMirror(event) {
	for (let m in allMirrors) {
		if (event.target == m) {
			continue;
		}
		if (event.newValue == m.mirror) {
			Prompts.alert(window, _('duplicatetitle'), _('duplicatetext'));
			event.preventDefault();
			return;
		}
	}
	// clear the state
	event.target.removeAttribute('state');
}

function addMirror() {
	let url = '';
	try {
		let trans = new Instances.Transferable();
		trans.addDataFlavor("text/unicode");
		Services.clipbrd.getData(trans, Services.clipbrd.kGlobalClipboard);

		let str = {}, length = {};
		trans.getTransferData(
			"text/unicode",
			str,
			length
		);
		if (length.value && (str.value instanceof Ci.nsISupportsString)) {
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
	for each (let item in mirrors.selectedItems) {
		mirrors.removeChild(item);
	}
	select();
}

function checkMirrors() {
	let button = $('mirrorCheck');

	let pending = [];
	let running = 0;
	let bad = [];
	let requests = {};
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
		QueryInterface: XPCOMUtils.generateQI([Ci.nsIInterfaceRequestor]),
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

	function makeRequest(m) {
		let req = new XMLHttpRequest();
		req.mirror = m;
		req.addEventListener("load", function() {
			finishRequest(req);
		}, false);
		req.addEventListener("error", function() {
			finishRequest(req);
		}, false);
		requests[m.mirror] = req;
		try {
			req.open('HEAD', m.mirror);
			req._callbacks = new Callbacks(req);
			req.send(null);
		}
		catch (ex) {
			finishRequest(req);
		}
	}

	function finishRequest(req, error) {
		let m = req.mirror;
		let state = 'bad';
		delete requests[m.mirror];
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
		if (state == 'bad') {
			bad.push(m);
		}
		if (--running == 0) {
			finish();
		}
		else if (pending.length) {
			makeRequest(pending.shift());
		}
	}
	function finish() {
		if (numGoodLengths > 1) {
			let max;
			let maxCl;
			for (let cl in good) {
				if (!max || good[cl].length > max) {
					max = good[cl].length;
					maxCL = cl;
				}
			}
			for (let cl in good) {
				if (cl == maxCL) {
					continue;
				}
				for each (let m in good[cl]) {
					log(LOG_INFO, m.mirror + " has a cl of " + cl + " but the majority of mirrors uses " + maxCL);
					m.setAttribute('state', 'bad');
					m.setAttribute('error', _('sizecheckerror'));
					bad.push(m);
				}
			}
		}
		if (bad.length && (mirrors.itemCount - bad.length) > 0 && 1 == Prompts.confirm(
			window,
			_('removebadmirrors.caption'),
			_('removebadmirrors.message', [bad.length]),
			_('removebadmirrors.keep'), // XXX swap
			_('removebadmirrors.remove')
		)) {
			for each (let b in bad) {
				b.parentNode.removeChild(b);
			}
		}
		button.disabled = false;
	}
	function timeout() {
		for each (let req in requests) {
			log(LOG_INFO, req.mirror.mirror + " is a timeout");
			req.abort();
			finishRequest(req);
		}
	}

	for (let m in allMirrors) {
		if (m.hasAttribute('state')) {
			if (m.getAttribute('state') == 'bad') {
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
