/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/* global _, DTA, $, $$, Utils, Preferences, getDefaultDownloadsDirectory, unloadWindow */
/* jshint browser:true */
var prompts = require("prompts");
var Version = require("version");
var {isWindowPrivate} = require("support/pbm");

var dropDowns = {};

/* global BatchGenerator */
XPCOMUtils.defineLazyGetter(window, "BatchGenerator", function() {
	const {BatchGenerator} = require("support/batchgen");
	return BatchGenerator;
});


var Dialog = {
	load: function() {
		try {
			let isPrivate = this.isPrivate = isWindowPrivate(window.opener);
			if (window.arguments) {
				isPrivate = this.isPrivate = window.arguments[0].isPrivate;
			}
			this.ddDirectory = $("directory");
			this.ddDirectory.isPrivate = isPrivate;
			this.ddRenaming = $("renaming");
			this.ddRenaming.isPrivate = isPrivate;

			if (!this.ddDirectory.value) {
				log(LOG_DEBUG, "Using default download directory, value was " + this.ddDirectory.value);
				getDefaultDownloadsDirectory((function(path) {
					this.ddDirectory.value = path;
				}).bind(this));
			}
			var address = $('address');
			var filename = $("filename");
			(function() {
				let menu = document.getAnonymousElementByAttribute(
					address,
					"anonid",
					"textbox-input-box"
					);
				if (!menu) {
					return;
				}

				menu = document.getAnonymousElementByAttribute(
						menu,
					"anonid",
					"input-box-contextmenu"
					);
				if (!menu) {
					return;
				}

				let batches = $("batches");
				let nodes = Array.slice(batches.childNodes);
				for (let n of nodes) {
					menu.appendChild(n);
				}
				menu.addEventListener("popupshowing", function() {
					let hidden = true;
					if (~address.selectionStart) {
						let text = address.value.substring(address.selectionStart, address.selectionEnd);
						hidden = !/^\d+$/.test(text);
					}
					for (let n of nodes) {
						n.hidden = hidden;
					}
				}, false);
				$("create-batch-descriptor").addEventListener("command", function() {
					let {selectionStart, selectionEnd} = address;
					let value = address.value;
					let text = value.substring(selectionStart, selectionEnd);
					let start = "1";
					while (start.length < text.length) {
						start = "0" + start;
					}
					text = "[" + start + ":" + text + "]";
					address.value = value.substring(0, selectionStart) + text +
						value.substring(selectionEnd, value.length);
					address.setSelectionRange(selectionStart + 1, selectionEnd + 1);
				}, false);
			})();

			var hash = null;
			if (window.arguments) {
				var a = window.arguments[0];
				let url = a.url;
				if ("url" in a) {
					if (typeof(a.url) === 'string') {
						address.value = a.url;
					}
					else if (typeof(a.url) === 'object' && 'url' in a.url) {
						address._item = a;
						// we've got a DTA.URL.
						// In this case it is not safe to modify it because of encoding
						// issues.
						address.value = a.url.usable;
						if ("fileName" in a) {
							filename.value = a.fileName;
						}
						address.readOnly = true;
						$('batcheslabel').style.display = 'none';
						$('batches').collapsed = true;
						hash = a.url.hash;
					}
				}
				try {
					let referrer = (new DTA.URL(Services.io.newURI(a.referrer, null, null))).url.spec;
					try {
						referrer = decodeURIComponent(referrer);
					} catch (ex) {}
					$("URLref").value	= referrer;
				}
				catch (ex) {
					// no op
				}
				if (a.mask) {
					this.ddRenaming.value = a.mask;
				}
				$('description').value = a.description;
			}
			// check if there's some URL in clipboard
			else {
				let trans = new Instances.Transferable();
				try {
					trans.addDataFlavor("text/unicode");
					Services.clipbrd.getData(trans, Services.clipbrd.kGlobalClipboard);

					let str = {}, len = {};
					trans.getTransferData("text/unicode", str, len);
					if (len.value && (str.value instanceof Ci.nsISupportsString)) {
						let url = new DTA.URL(Services.io.newURI(str.value.data, null, null));
						if (url.hash) {
							hash = url.hash;
							delete url.hash;
						}
						address.value = url.spec;
						address.select();
					}
				}
				catch (ex) {
					log(LOG_DEBUG, "Not able to gather data from the clipboard!", ex);
				}
			}
			if (hash) {
				$('hash').value = hash;
			}
			window.sizeToContent();
		}
		catch(ex) {
			log(LOG_ERROR, "load():", ex);
		}
	},
	download: function(start) {

		var errors = [];

		// check the directory
		var dir = this.ddDirectory.value.trim();
		dir = this.ddDirectory.value = !!dir ? Utils.addFinalSlash(dir) : '';
		if (!dir.length || !Utils.validateDir(dir)) {
			errors.push('directory');
		}

		// check mask
		var mask = this.ddRenaming.value.trim();
		mask = this.ddRenaming.value = mask || '';
		if (!mask.length) {
			errors.push('renaming');
		}

		var address = $('address');
		var hasItem = ("_item" in address);
		let url = null;
		let hash = null;
		if (!hasItem) {
			url = address.value;
			try {
				if (!url) {
					throw new Components.Exception("Empty url");
				}
				let uri = Services.fixups.createFixupURI(url, 0);
				try {
					url = decodeURIComponent(uri.spec);
				}
				catch (ex) {
					url = uri.spec;
				}
				url = new DTA.URL(Services.io.newURI(url, null, null));
				if (url.hash) {
					$('hash').value = hash;
				}
				address.value = url;
			}
			catch (ex) {
				errors.push('address');
			}
		}

		if (!$('hash').isValid) {
			errors.push('hash');
		}
		else {
			hash = $('hash').value;
		}

		$('directory', 'renaming', 'address', 'hash').forEach(
			function(e) {
				// reset the styles
				if (e.hasAttribute('invalid')) {
					e.removeAttribute('invalid');
				}
			}
		);

		if (errors.length) {
			errors.forEach(
				function(e) {
					$(e).setAttribute('invalid', 'true');
				}
			);
			return false;
		}

		if (hasItem) {
			return this.downloadItem(start);
		}
		return this.downloadPlain(start, url, hash);
	},
	downloadPlain: function(start, url, hash) {
		let num = DTA.currentSeries();
		let batch;
		try {
			batch = new BatchGenerator(url);
		}
		catch (ex) {
			log(LOG_ERROR, "Cannot create batch", ex);
			return false;
		}

		let rv = batch.length > 1;
		if (rv) {
			let message = _("batch.tasks") + "\n" +
				_("batch.tasks.2", [batch.length]) + "\n\n" +
				_("batch.tasks.3") + "\n" + batch.parts + "\n\n" +
				batch.first + "\n..\n" + batch.last;
			if (batch.length > 1000) {
				message += "\n\n" + _('batch.manytasks');
			}
			rv = prompts.confirm(
				window,
				_('batchtitle'),
				message,
				_('batchdownload'),
				prompts.CANCEL,
				_('singledownload'));
			if (rv === 1) {
				return false;
			}
			rv = !rv;
		}

		let mask = this.ddRenaming.value;
		let dir = this.ddDirectory.value;
		let isPrivate = this.isPrivate;

		let downloads = (function() {
			let filename = $("filename").value || null;
			let desc = $('description').value;
			let ref = $('URLref').value;
			let URL = DTA.URL;
			let newURI = Services.io.newURI;

			function QueueItem(url, fn) {
				this.url = new URL(newURI(url, null, null));
				if (fn) {
					this.fileName = fn;
				}
				if (!rv && hash) {
					this.url.hash = hash;
				}
			}
			QueueItem.prototype = {
				description: desc,
				referrer: $('URLref').value,
				numIstance: num,
				mask: mask,
				dirSave: dir,
				isPrivate: isPrivate
			};

			if (rv) {
				return (function() {
					for (let i in batch.getURLs()) {
						yield new QueueItem(i);
					}
				})();
			}

			return batch = [new QueueItem(url, filename)];
		})();
		return this.sendDownloads(start, downloads, isPrivate);
	},
	downloadItem: function(start) {
		let item = $("address")._item;
		item.fileName = $("filename").value || null;
		item.description = $('description').value;
		item.referrer = $('URLref').value;
		item.numIstance = DTA.currentSeries();
		item.mask = this.ddRenaming.value;
		item.dirSave = this.ddDirectory.value;

		return this.sendDownloads(start, [item], item.isPrivate);
	},
	sendDownloads: function(start, downloads, isPrivate) {
		DTA.incrementSeries();
		let clq = start;
		if (!clq) {
			clq = Preferences.getExt("confirmlastqueued", 0);
			if (clq === 0) {
				let res = prompts.confirm(
					window,
					_("rememberpref"),
					_("rememberlastqueued"),
					prompts.YES,
					prompts.NO,
					null,
					0,
					false,
					_("dontaskagain"));
				clq = res.button + 1;
				if (res.checked) {
					Preferences.setExt("confirmlastqueued", clq);
				}
			}
			clq = clq === 1;
		}
		if (clq) {
			Preferences.setExt("lastqueued", !start);
		}

		this.ddRenaming.save($("renamingOnce").checked);
		this.ddDirectory.save();

		DTA.sendLinksToManager(window, start, downloads);

		close();
		return false;
	},
	browseDir: function() {
		// let's check and create the directory
		Utils.askForDir(
			this.ddDirectory.value,
			_("valid.destination"),
			function (newDir) {
				if (newDir) {
					Dialog.ddDirectory.value = newDir;
				}
			});
	}
};

unloadWindow(window, function() {
	log(LOG_DEBUG, "closed an addurl window");
	close();
});
