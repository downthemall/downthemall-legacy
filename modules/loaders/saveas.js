/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

/* **
 * Lazy getters
 */
lazy(this, 'DTA', function() require("api"));
lazy(this, 'ContentHandling', function() require("support/contenthandling").ContentHandling);
lazy(this, 'Preferences', function() require("preferences"));

/* **
 * Loader
 */
exports.load = function load(window, document) {
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
				Cu.reportError("requested a non-existing element: " + id);
			}
		}
		return elements;
	}
	function revertUI() {
		['open'].forEach(
			function(e) {
				e = $(e);
				e.parentNode.collapsed = true;
				e.disabled = true;
			}
		);
		var nodes = normalBox.getElementsByTagName('separator');
		for (var i = 0; i < nodes.length; ++i) {
			nodes[i].collapsed = true;
		}

		basicBox.collapsed = true;
		normalBox.collapsed = false;

		// take care of FlashGot... for now.
		// need to negotiate with the author (and possible other extension authors)
		try {
			gFlashGotDMDialog.init();
			$("flashgot-basic").collapsed = true;
		}
		catch (ex) {
			// no op
		}

		// Workaround for bug 371508
		try {
			window.sizeToContent();
		}
		catch (ex) {
			log(LOG_DEBUG, "sizeToContent Bug: 371508", ex);
			try {
				var btn = document.documentElement.getButton('accept');
				window.innerHeight = btn.boxObject.y + 10;
			}
			catch (ex) {
				log(LOG_ERROR, "setting height failed", ex);
			}
		}
	}
	function download(turbo) {
		if (turbo) {
			ddDirectory.save();
		}
		DTA.saveSingleLink(window, turbo, url, referrer, "");
		let de = document.documentElement;
		try {
			de.removeAttribute('ondialogaccept');
		}
		catch (ex) {
			// no op
		}
		try {
			const NS_BINDING_ABORTED = 0x804b0002;
			dialog.mLauncher.cancel(NS_BINDING_ABORTED);
		}
		catch (ex) {}

		de.cancelDialog();
	}

	const dialog = window.dialog;

	const basicBox = $('basicBox');
	const normalBox = $('normalBox');
	const normal = $('downthemall');
	const turbo = $('turbodta');
	const turboExec = $('turbodtaexec');
	const mode = $('mode');
	const remember = $("rememberChoice");
	const settingsChange = $("settingsChange");
	const ddDirectory = $('tdtalist');

	let url, referrer, mask;

	window.setTimeout(function() {
		// Need to get behind the default load event
		const doRevert = basicBox && (!basicBox.collapsed || (normalBox && normalBox.collapsed));
		const doOverlay = Preferences.getExt("downloadWin", true);

		if (!doOverlay && typeof(gFlashGotDMDialog) == 'undefined') {
			// we do not actually overlay!
			return;
		}
		if (doRevert) {
			revertUI();
		}

		if (!doOverlay) {
			// we do not actually overlay!
			// but we revert to help FlashGot ;)
			return;
		}
		$('downthemallcontainer').collapsed = false;
		normal.disabled = false;

		url = ContentHandling.getRedirect(dialog.mLauncher.source);
		try {
			referrer = dialog.mContext.QueryInterface(Ci.nsIWebNavigation).currentURI.spec;
		}
		catch(ex) {
			referrer = url.spec;
		}

		let ml = DTA.getLinkPrintMetalink(url);
		url = new DTA.URL(ml ? ml : url);

		mask = DTA.getDropDownValue('renaming');
		if (!($("tdta").hidden = (DTA.getDropDownValue('directory') == '' || !mask))) {
			turbo.disabled = false;
			turboExec.disabled = false;
		}

		try {
			switch (Preferences.getExt('saveasmode', 0)) {
				case 1:
					mode.selectedItem = normal;
					break;
				case 2:
					mode.selectedItem = turbo.disabled ? normal : turbo;
					break;
			}
			if (Preferences.getExt('saveasmode', 0)) {
				remember.checked = true;
				remember.disabled = false;
			}
		}
		catch (ex) {
			// no op
		}
	}, 0);

	mode.addEventListener(
		'select',
		function() {
			let selMode = mode.selectedItem;
			remember.checked = false;
			if (normal == selMode || turbo == selMode) {
				remember.disabled = false;
			}
		},
		false
	);
	ddDirectory.addEventListener('command', function() {
		mode.selectedItem = turbo;
	}, true);

	turboExec.addEventListener('command', function() {
		download(true);
	}, true);

	window.addEventListener('dialogaccept', function(evt) {
		let selMode = mode.selectedItem;
		if (selMode == normal || selMode == turbo) {
			if (remember.checked) {
				Preferences.setExt("saveasmode", selMode == normal ? 1 : 2);
			}
			else {
				Preferences.setExt("saveasmode", 0);
			}
			download(selMode == turbo);
			evt.stopPropagation();
			evt.preventDefault();
			return;
		}
		Preferences.setExt("saveasmode", 0);
	}, false); // dialogaccept
}
