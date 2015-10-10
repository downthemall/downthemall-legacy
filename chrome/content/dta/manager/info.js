/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/* global _, $, Tooltip, DTA, Utils, Preferences, setTimeoutOnlyFun, toURL */
/* global COMPLETE, FINISHING */
/* jshint browser:true */

var {defer} = require("support/defer");
var {TimerManager} = require("support/timers");
var Timers = new TimerManager();

function discard() {
	if (opener) {
		opener.removeEventListener("unload", discard, false);
	}
	removeEventListener("unload", discard, false);
	close();
}
opener.addEventListener("unload", discard, false);
addEventListener("unload", discard, false);

var Dialog = {
	downloads: null,
	get isFullyDisabled() {
		return $('directory', 'renaming', 'hash').every(
			function(e) {
				return e.hasAttribute('disabled');
			}
		);
	},
	load: function() {
		try {
			Tooltip.init();
			// d is an Array of Downloads
			this.downloads = window.arguments[0];
			if (this.downloads.length === 1) {
				let d = this.downloads[0];
				$("infoIcon").src = d.largeIcon;
				$("infoURL").value = d.urlManager.spec;
				$("infoDest").value = d.destinationFile;
				$("infoDate").value = d.startDate.toLocaleString();
				$("infoPrivate").hidden = !d.isPrivate;
				$("mirrorsText").value = _("mirrorsText.2", [d.urlManager.length], d.urlManager.length);
				$("clearReferrer").hidden = true;
				document.title = d.destinationName;

				if (d.referrer) {
					$('sourcePage')._value = $("sourcePage").value = d.referrer.spec;
				}
				if (!d.isOf(FINISHING | COMPLETE)) {
					$('sourcePage').removeAttribute('readonly');
				}

				$('renaming').value = d.mask;
				$('directory').value = d.pathName;
				if (d.hashCollection) {
					$('hash').value = d.hashCollection.full;
				}
				$('description').value = d.description;
				this.item = d;
				Tooltip.start(d);
			}
			else {
				// more than just one download
				$('infoDest').value = document.title;
				for (let e of $('infoURL', 'infoSize', 'sourcePage', 'mirrorsText')) {
					e.value = "---";
					e.disabled = true;
				}
				$("infoPrivate").hidden = true;

				$('mirrorRow').collapsed = true;
				$("hash").setAttribute('readonly', 'true');
				$("hash").setAttribute('disabled', 'true');

				let mask = this.downloads[0].mask;
				$('renaming').value =
					this.downloads.every(function(e, i, a) { return e.mask === mask; }) ?
					mask :
					'';

				let dir = String(this.downloads[0].pathName);
				$('directory').value =
					this.downloads.every(function(e) e.pathName === dir) ?
					dir :
					"";
				$('canvasTab').parentElement.removeChild($('canvasTab'));
				$('canvasBox').parentElement.removeChild($('canvasBox'));
				$('tabs').selectedIndex = 0;
			}
			if (this.downloads.every(function(d) { return d.isOf(COMPLETE | FINISHING); })) {
				for (let e of $('directory', 'renaming', 'mask', 'browsedir')) {
					e.setAttribute('readonly', 'true');
					e.setAttribute('disabled', 'true');
				}
			}
			if (this.isFullyDisabled) {
				$('dTaDownloadInfo').buttons = 'accept';
			}
		}
		catch(ex) {
			log(LOG_ERROR, 'load', ex);
		}
		setTimeoutOnlyFun(function() {
			window.sizeToContent();
			addEventListener("resize", function() Dialog.resize(), true);
		}, 0);
	},
	clearReferrer: function() {
		var sp = $("sourcePage");
		sp.removeAttribute("readonly");
		sp.disabled = false;
		sp.value = "";
		sp.focus();
	},
	accept: function() {
		if (this.isFullyDisabled) {
			return true;
		}
		if (!this.check()) {
			return false;
		}

		let win = window.arguments[1];

		let directory = $('directory').value.trim();
		directory = !!directory ? Utils.addFinalSlash(directory) : '';
		$('directory').value = directory;

		let mask = $('renaming').value.trim();
		mask = mask || '';
		$('renaming').value = mask;

		let description = $('description').value || "";

		let sp = $('sourcePage');
		let newRef = null;
		if (!sp.hasAttribute('readonly') && sp._value !== sp.value) {
			newRef = sp.value || "";
		}

		if (this.downloads.length === 1) {
			let d = this.downloads[0];
			if ($('hash').isValid) {
				var h = $('hash').value;
				if (!h) {
					d.hashCollection = null;
				}
				else if (!d.hashCollection ||
					h.sum !== d.hashCollection.full.sum ||
					h.type !== d.hashCollection.full.type) {
					d.hashCollection = new DTA.HashCollection(h);
					if (h && d.state === COMPLETE) {
						// have to manually start this guy ;)
						d.verifyHash();
					}
				}
			}
		}

		for (let d of this.downloads) {
			if (!d.isOf(COMPLETE | FINISHING)) {
				if (directory) {
					d.pathName = directory;
				}
				if (mask) {
					d.mask = mask;
				}
			}
			if (description) {
				d.description = description;
			}
			if (newRef !== null) {
				try {
					d.referrer = newRef ? toURL(newRef) : null;
					delete d._referrerUrlManager;
				}
				catch (ex) {
					log(LOG_ERROR, "failed to set referrer to", newRef);
				}
			}
			d.save();
		}
		return true;
	},
	unload: function() {
		Tooltip.stop();
		Timers.killAllTimers();
		return true;
	},
	browseDir: function() {
		// let's check and create the directory
		Utils.askForDir(
			$('directory').value,
			_("valid.destination"),
			function(newDir) {
				if (newDir) {
					$('directory').value = newDir;
				}
			}
		);
	},
	manageMirrors: function() {
		if (this.downloads.length !== 1) {
			// only manage single downloads
			return;
		}
		let download = this.downloads[0];
		let mirrors = download.urlManager.toArray();
		window.openDialog(
			'chrome://dta/content/dta/mirrors.xul',
			null,
			"chrome,dialog,resizable,modal,centerscreen",
			mirrors
		);
		if (mirrors.length) {
			download.replaceMirrors(mirrors);
			$("mirrorsText").value = _("mirrorsText.2", [download.urlManager.length], download.urlManager.length);
			log(LOG_INFO, "New mirrors set " + mirrors);
		}
	},
	check: function() {
		var dir = $('directory').value.trim();
		if (!dir.length || !$('renaming').value.trim().length) {
			return false;
		}
		if (!Utils.validateDir(dir)) {
			window.alert(_(dir.length ? 'alert.invaliddir' : 'alert.nodir'));
			Utils.askForDir(null, _("valid.destination"), function (newDir) {
				$('directory').value = newDir ? newDir : '';
			});
			return false;
		}
		if (!$('hash').isValid) {
			window.alert(_('alert.hash'));
			return false;
		}
		return true;
	},
	resize: function() {
		Tooltip.start(this.item);
		return true;
	}
};
addEventListener("load", function() Dialog.load(), true);
addEventListener('unload', function() Dialog.unload(), true);
