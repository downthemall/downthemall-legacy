/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

/* **
 * Lazy getters
 */
/* global DTA, ContentHandling, Preferences, isWindowPrivate, gFlashGotDMDialog */
lazy(this, 'DTA', () => require("api"));
lazy(this, 'ContentHandling', () => require("support/contenthandling").ContentHandling);
lazy(this, 'Preferences', () => require("preferences"));
lazy(this, "isWindowPrivate", () => require("support/pbm").isWindowPrivate);

/* **
 * Loader
 */
function load(window, document) {
	function $(...args) {
		if (args.length === 1) {
			return document.getElementById(args[0]);
		}
		let elements = [];
		for (let i = 0, e = args.length; i < e; ++i) {
			let id = args[i];
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

	try {
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

		const revertUI = () => {
			let nodes = normalBox.querySelectorAll("separator");
			for (let i = 0; i < nodes.length; ++i) {
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
			let stc = () => {
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
			};
			stc();
			window.setTimeout(() => stc(), 0);

			log(LOG_DEBUG, "save-as reverted!");
		};
		let url, referrer, mask, isPrivate;

		let download = turbo => {
			if (turbo) {
				ddDirectory.save();
			}
			let item = {
				"url": url,
				"referrer": referrer,
				"description": "",
				"isPrivate": isPrivate
			};

			DTA.saveSingleItem(window, turbo, item);
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

			// avoid users double-clicking or something
			download = function() {};
		};


		// Need to get behind the default load event
		const doOverlay = Preferences.getExt("downloadWin", true);

		if (!doOverlay && typeof(gFlashGotDMDialog) === 'undefined') {
			log(LOG_DEBUG, "not doing anything");
			// we do not actually overlay!
			return;
		}
		revertUI();

		// Overlay dialog.initDialog as it might be called... somewhen... after us,
		// reverting our revertUI changed, which causes
		// https://github.com/downthemall/downthemall/issues/36
		// dta-2 did not have this problem as it was quaranteed we run after
		// initDialog due to the different loading mechanism
		window.dialog = Object.create(dialog, {
			"initDialog": {
				enumerable: true,
				value: function(...args) {
					log(LOG_DEBUG, "initDialog called");
					try {
						return dialog.initDialog(...args);
					}
					finally {
						revertUI();
					}
				}
			}
		});

		if (!doOverlay) {
			// we do not actually overlay!
			// but we revert to help FlashGot ;)
			log(LOG_DEBUG, "not overlaying");
			return;
		}
		$('downthemallcontainer').collapsed = false;
		normal.disabled = false;

		isPrivate = isWindowPrivate(dialog.mContext);

		url = ContentHandling.getRedirect(dialog.mLauncher.source, isPrivate);
		try {
			referrer = dialog.mContext.QueryInterface(Ci.nsIWebNavigation).currentURI.spec;
		}
		catch(ex) {
			referrer = url.spec;
		}

		let ml = DTA.getLinkPrintMetalink(url);
		url = new DTA.URL(ml ? ml : url);

		ddDirectory.isPrivate = isPrivate;
		mask = DTA.getDropDownValue('renaming', isPrivate);
		if (!($("tdta").hidden = (!DTA.getDropDownValue('directory', isPrivate) || !mask))) {
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

		mode.addEventListener(
			'select',
			function() {
				let selMode = mode.selectedItem;
				remember.checked = false;
				if (normal === selMode || turbo === selMode) {
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
			if (selMode === normal || selMode === turbo) {
				if (remember.checked) {
					Preferences.setExt("saveasmode", selMode === normal ? 1 : 2);
				}
				else {
					Preferences.setExt("saveasmode", 0);
				}
				download(selMode === turbo);
				evt.stopPropagation();
				evt.preventDefault();
				return;
			}
			Preferences.setExt("saveasmode", 0);
		}, false); // dialogaccept
	} catch (ex) {
		log(LOG_ERROR, "failed to run save-as int", ex);
	}
}

exports.load = function(w, d) {
	w.setTimeout(load.bind(null, w, d), 0);
};
