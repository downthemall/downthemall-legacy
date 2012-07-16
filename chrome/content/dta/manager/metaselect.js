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
 * The Original Code is DownThemAll! MetaLink handler
 *
 * The Initial Developers of the Original Code is Nils Maier
 * Portions created by the Initial Developers are Copyright (C) 2007
 * the Initial Developers. All Rights Reserved.
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

const METALINK_LOGO = 'chrome://dta/skin/icons/metalink48.png';

const Version = require("version");

const MetaSelect = {
	_insertDownload: function(d) {
		try {
			if (d.lang && d.lang.search(/^\w{2}(?:-\w{2})?$/) != -1) {
				d.selected = Version.LOCALE.slice(0,2) == d.lang.slice(0,2);
			}
			let e = document.createElement('richlistitem');
			e.setAttribute("class", "item");
			e.download = d;
			$('downloads').appendChild(e);
		}
		catch (ex) {
			log(LOG_ERROR, "Failed to add download from metalink", ex);
		}
	},
	load: function ML_load() {
		$('cancelbutton').label = _('button-cancel');

		try {
			let downloads = window.arguments[0];
			if (downloads.length) {
				downloads.forEach(this._insertDownload, this);
			}
		}
		catch(ex) {
			log(LOG_ERROR, "Failed to load downloads from Metalink", ex);
			// no-op
		}
		let info = {
			'identity': _('mlidentity'),
			'description': _('mldescription'),
			'logo': null,
			'publisher': null,
			'license': null
		}
		try {
			let oi = window.arguments[1];
			for (x in info) {
				if (x in oi && oi[x]) {
					info[x] = oi[x];
				}
			}
		}
		catch (ex) {
			// no-op
		}
		$('identity').value = info.identity;
		$('desc').appendChild(document.createTextNode(info.description));
		let logo = new Image();
		logo.addEventListener("load", function() {
			let canvas = $('icon');
			try {
				canvas.width = canvas.clientWidth;
				canvas.height = canvas.clientHeight;
				let ctx = canvas.getContext('2d');

				let w = logo.naturalWidth;
				let h = logo.naturalHeight;
				let d = Math.max(canvas.width, w, h);

				if (d != canvas.width) {
					ctx.scale(canvas.width / d, canvas.height / d);
				}

				ctx.drawImage(logo, (d - w) /2, (d - h) / 2);
			}
			catch (ex) {
				log(LOG_ERROR, "Cannot load logo", ex);
				logo.src = METALINK_LOGO;
			}
		}, false);
		logo.addEventListener("error", function() {
			logo.src = METALINK_LOGO;
		}, false);
		logo.src = info.logo ? info.logo : METALINK_LOGO;
		if (info.publisher) {
			let e = $('publisher');
			e.value = info.publisher[0];
			e.link = info.publisher[1];
		}
		else {
			$('boxPublisher').hidden = true;
		}
		if (info.license) {
			let e = $('license');
			e.value = info.license[0];
			e.link = info.license[1];
		}
		else {
			$('boxLicense').hidden = true;
		}
	},
	browseDir: function() {
		// get a new directory
		let newDir = Utils.askForDir(
			$('directory').value, // initialize dialog with the current directory
			_("validdestination")
		);
		// alright, we got something new, so lets set it.
		if (newDir) {
			$('directory').value = newDir;
		}
	},
	download: function ML_download(start) {
		let [notifications, directory, mask] = $('notifications', 'directory', 'renaming');
		notifications.removeAllNotifications(true);

		function err(msg) {
			notifications.appendNotification(msg, 0, null, notifications.PRIORITY_CRITICAL_MEDIUM, null);
		}

		directory.value = directory.value.trim();
		mask.value = mask.value.trim();

		if (!mask.value) {
			err(_('alertmask'));
			return false;
		}
		if (!directory.value || !Utils.validateDir(directory.value)) {
			err(_(directory.value ? 'alertinvaliddir' : 'alertnodir'));
			return false;
		}

		let selected = false;
		Array.forEach(
			document.getElementsByTagName('richlistitem'),
			function(n) {
				n.download.dirSave = directory.value;
				n.download.mask = mask.value;
				n.download.selected = n.checked;
				selected |= n.checked;
			},
			this
		);
		if (!selected) {
			err(_('nolinks'));
			return false;
		}
		window.arguments[1].start = start;
		self.close();
		return true;
	},
	cancel: function ML_cancel() {
		Array.forEach(
			document.getElementsByTagName('richlistitem'),
			function(n) {
				n.download.selected = false;
			},
			this
		);
		self.close();
		if (window.arguments[2]) {
			window.arguments[2]();
		}
		return true;
	},
	openLink: function(e) {
		openUrl(e.link);
	},
	select: function(type) {
		let f;
		switch (type) {
		case 'all':
			f = function(node) { return true; }
		break;
		case 'none':
			f = function(node) { return false; }
		break;
		case 'invert':
			f = function(node) { return !node.checked; }
		break;
		default:
		return;
		}
		let nodes = document.getElementsByTagName('richlistitem');
		for (let i = 0, e = nodes.length, node; i < e; ++i) {
			node = nodes[i];
			node.checked = f(node);
		}
	}
};
addEventListener('load', function loadSelf() {
	removeEventListener('load', loadSelf, false);
	try {
		MetaSelect.load();
	}
	catch (ex) {
		log(LOG_ERROR, "Failed to load", ex);
	}
}, false);
opener.addEventListener("unload", function unloadOpener() {
	opener.removeEventListener("unload", unloadOpener, false);
	MetaSelect.cancel();
}, false);
addEventListener('close', function unloadSelf() {
	removeEventListener('close', unloadSelf, false);
	MetaSelect.cancel();
}, false);
