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
 * The Original Code is DownThemAll.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
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
 
let Prompts = {};
Components.utils.import('resource://dta/prompts.jsm', Prompts);

ServiceGetter(this, "Clipboard", "@mozilla.org/widget/clipboard;1", "nsIClipboard");
ServiceGetter(this, "Fixups", "@mozilla.org/docshell/urifixup;1", "nsIURIFixup");

const Transferable = new Components.Constructor("@mozilla.org/widget/transferable;1", "nsITransferable");

var dropDowns = {};

function QueueItem(url, num, desc, hash) {
	this.url = url;
	this.numIstance = num;
	this.referrer = $('URLref').value,
	this.description = desc;
	this.title = '';
	this.mask = Dialog.ddRenaming.value;
	this.dirSave = Dialog.ddDirectory.value;
	if (hash) {
		this.url.hash = hash;
	}
}

function Literal(str) {
	this.str = str;
	this.first = this.last = this.str;
	this.length = 1;
}
Literal.prototype = {
	join: function(str) {
		yield str + this.str;
	},
	toString: function() {
		return this.str;
	}
};

function Range() {
};
Range.prototype = {
	init: function(name, start, stop, step) {
		stop += -Math.abs(step)/step;
		stop += step - ((stop - start) % step);
		
		this.name = name;
		this.start = start;
		this.stop = stop;
		this.step = step;
		this.length = Math.floor((stop - start) / step);
		this.first = this._format(this.start);
		this.last = this._format(this.stop - this.step);
	},
	join: function(str) {
		for (let i in Utils.range(this.start, this.stop, this.step)) {
			yield (str + this._format(i));
		}
	}
};

function NumericRange(name, start, stop, step, strl) {
	this._format = function(val) {
		let rv = String(Math.abs(val));
		while (rv.length < this.strl) {
			rv = '0' + rv;
		}
		if (val < 0) {
			return '-' + rv;
		}
		return rv;
	};
	this.strl = strl;
	
	this.init(name, start, stop + (step > 0 ? 1 : -1), step);
};
NumericRange.prototype = Range.prototype;
function CharRange(name, start, stop, step) {
	this._format = String.fromCharCode;

	this.init(name, start, stop + (step > 0 ? 1 : -1), step);
};
CharRange.prototype = Range.prototype;

function BatchGenerator(link) {
	this.url = link.url;
	let url = link.usable;
	this._length = 1;
	this._pats = [];
	var i;
	while ((i = url.search(/\[.*?]/)) != -1) {
		if (i != 0) {
			this._pats.push(new Literal(url.substring(0, i)));
			url = url.slice(i);
		}
		let m;
		if ((m = url.match(/^\[(-?\d+):(-?\d+)(?::(-?\d+))?\]/)) != null) {
			url = url.slice(m[0].length);
			try {
				let start = new Number(m[1]);
				let stop = new Number(m[2]);
				let step = stop > start ? 1 : -1;
				if (m.length > 3 && typeof(m[3]) != 'undefined') {
					step = new Number(m[3]);
				}
				this._checkRange(start, stop, step);
				if (start == stop) {
					this._pats.push(new Literal(m[1]));
					continue;
				}
				var x = m[Math.abs(start) > Math.abs(stop) ? 2 : 1];
				var sl = x.length;
				if (x.slice(0,1) == '-') {
					--sl;
				}
				this._pats.push(new NumericRange(m[0], start, stop, step, sl));
			}
			catch (ex) {
				Debug.log(ex);
				this._pats.push(new Literal(m[0]));
			}
			continue;
		}
		
		if ((m = url.match(/^\[([a-z]):([a-z])(?::(-?\d))?\]/)) || (m = url.match(/\[([A-Z]):([A-Z])(?::(-?\d))?\]/))) {
			url = url.slice(m[0].length);
			try {
				let start = m[1].charCodeAt(0);
				let stop = m[2].charCodeAt(0);
				let step = stop > start ? 1 : -1;
				if (m.length > 3 && typeof(m[3]) != 'undefined') {
					step = new Number(m[3]);
				}
				this._checkRange(start, stop, step);
				if (start == stop) {
					this._pats.push(new Literal(m[1]));
					continue;
				}
				this._pats.push(new CharRange(m[0], start, stop, step));
			}
			catch (ex) {
				Debug.log(ex);
				this._pats.push(new Literal(m[0]));
			}
			continue;
		}
		if ((m = url.match(/^\[.*?]/)) != null) {
			url = url.slice(m[0].length);
			this._pats.push(new Literal(m[0]));
			continue;
		}
		throw new Components.Exception("Failed to parse the expression");
	}
	if (url.length) {
		this._pats.push(new Literal(url));
	}
	// join the literals if required!
	for (i = this._pats.length - 2; i >= 0; --i) {
		if ((this._pats[i] instanceof Literal) && (this._pats[i + 1] instanceof Literal)) {
			this._pats[i] = new Literal(this._pats[i].str + this._pats[i + 1].str);
			this._pats.splice(i + 1, 1);
		}
	}
	for each (let i in this._pats) {
		this._length *= i.length;
	}
}
BatchGenerator.prototype = {
	_checkRange: function(start, end, step) {
		if (!step || (stop - start) / step < 0) {
			throw 'step invalid!';
		}
	},
	_process: function(pats) {
		if (pats.length == 0) {
			yield '';
		}
		else {
			let pat = pats.pop();
			for (let i in this._process(pats)) {
				for (let j in pat.join(i)) {
					yield j;
				}
			}
		}
	},
	getURLs: function() {
		for (let i in this._process(this._pats)) {
			yield i;
		}
	},
	get length() {
		return this._length;
	},
	get parts() {
		return this._pats
			.filter(function(e) { return !(e instanceof Literal); })
			.map(function(e) { return e.name; })
			.join(", ");
	},
	get first() {
		return this._pats.map(
			function(p) {
				return p.first;
			}
		).join('');
	},
	get last() {
		return this._pats.map(
			function(p) {
				return p.last;
			}
		).join('');
	}
};


var Dialog = {
	load: function DTA_load() {
		try {
			this.ddDirectory = $("directory");
			if (!this.ddDirectory.value) {
				this.ddDirectory.value = DefaultDownloadsDirectory.path;
			}			
			this.ddRenaming = $("renaming");			
			var address = $('address');
			
			var hash = null;
			if (window.arguments) {
				var a = window.arguments[0];
				var url = a.url;
				if (!('url' in a))
					;
				else if (typeof(a.url) == 'string') {
					address.value = a.url;
				}
				else if (typeof(a.url) == 'object' && 'url' in a.url) {
					// we've got a DTA.URL.
					// In this case it is not safe to modify it because of encoding
					// issues.
					address.value = a.url.usable;
					// JS does not preserve types between windows (as each window gets an
					// own sandbox)
					// This hack makes our URL a DTA.URL again ;)
					address._realURL = a.url;
					address.readOnly = true;
					$('batcheslabel').style.display = 'none';
					$('batches').collapsed = true;
				}
				var referrer = DTA.isLinkOpenable(a.referrer) ? a.referrer : null;
				if (referrer) {
					try {
						referrer = decodeURIComponent(referrer);
					} catch (ex) {}
					$("URLref").value	 = referrer;
				}
				if (a.mask) {
					this.ddRenaming.value = a.mask;
				}
				hash = a.url.hash;
				$('description').value = a.description;
			}
			// check if there's some URL in clipboard
			else {
				let trans = new Transferable();
				try {
					trans.addDataFlavor("text/unicode");
					Clipboard.getData(trans, Clipboard.kGlobalClipboard);
					
					let str = {}, length = {};
					trans.getTransferData(
						"text/unicode",
						str,
						length
					);
					if (length.value) {
						str = str.value
							.QueryInterface(Ci.nsISupportsString);
						str = str.data;
						if (str.length && DTA.isLinkOpenable(str)) {
							hash = DTA.getLinkPrintHash(str);
							address.value = str.replace(/#.*$/, '');
							address.select();
						}
					}
				}
				catch (ex) {
					Debug.log("Not able to gather data from the clipboard!", ex);
				}
			}
			if (hash) {
				$('hash').value = hash;
			}
			
			window.sizeToContent();
		}
		catch(ex) {
			Debug.log("load():", ex);
		}		
	},
	download: function DTA_download(start) {
		
		var errors = [];
		
		// check the directory
		var dir = this.ddDirectory.value.trim();
		if (!dir.length || !Utils.validateDir(dir)) {
			errors.push('directory');
		}
		
		// check mask
		var mask = this.ddRenaming.value;
		if (!mask.length) {
			errors.push('renaming');
		}
		
		var address = $('address');
		var url = address.value;
		if ('_realURL' in address) {
			url = address._realURL;
		}
		else {
			try {
				if (url == '') {
					throw new Components.Exception("Empty url");
				}
				let uri = Fixups.createFixupURI(url, 0);
				try {
					url = decodeURIComponent(uri.spec);
				}
				catch (ex) {
					url = uri.spec;
				}
				var hash = DTA.getLinkPrintHash(url);
				if (hash) {
					$('hash').value = hash;
				}
				url = url.replace(/#.*$/, '');
				address.value = url;
				url = new DTA.URL(IOService.newURI(url, null, null));				
			}
			catch (ex) {
				errors.push('address');
			}
		}
		
		var hash = null;
		if (!$('hash').isValid) {
			errors.push('hash');
		}
		else {
			hash = $('hash').value;
		}

		$('directory', 'renaming', 'address', 'hash').forEach(
			function(e) {
				// reset the styles
				if (e.hasAttribute('error')) {
					e.removeAttribute('error');
				}
			}
		);
		
		if (errors.length) {
			errors.forEach(
				function(e) {
					$(e).setAttribute('error', 'true');
				}
			);
			return false;
		}		

		var num = Preferences.getExt("counter", 0);
		if (++num > 999) {
			num = 1;
		}			
		
		try {
			var batch = new BatchGenerator(url);
		}
		catch (ex) {
			Debug.log("Cannot create batch", ex);
			return;
		}
	
		var rv = !('_realURL' in address) && batch.length > 1;
		if (rv) {
			var message = _(
				'tasks',
				[batch.length, batch.parts, batch.first, batch.last]
			);
			if (batch.length > 1000) {
				message += _('manytasks');
			}
			rv = Prompts.confirm(window, _('batchtitle'), message, _('batchtitle'), Prompts.CANCEL, _('single'));
			if (rv == 1) {
				return false;
			}
			rv = rv == 0;
		}
		var desc = $('description').value;
		if (rv) {
			var g = batch.getURLs();
			batch = function() {
				for (let i in g) {
					yield new QueueItem(new DTA.URL(IOService.newURI(i, null, null)), num, desc);
				}
			}();
		}
		else {
			batch = [new QueueItem(url, num, desc, hash)];
		}
		DTA.sendLinksToManager(window, start, batch);

		Preferences.setExt("counter", num);
		Preferences.setExt("lastqueued", !start);
	
		['ddRenaming', 'ddDirectory'].forEach(function(e) { Dialog[e].save(); });
		
		self.close();
		
		return true;
	},
	browseDir: function DTA_browseDir() {
		// let's check and create the directory
		var newDir = Utils.askForDir(
			this.ddDirectory.value,
			_("validdestination")
		);
		if (newDir) {
			this.ddDirectory.value = newDir;
		}
	}
}
