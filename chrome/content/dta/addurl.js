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
 * The Original Code is downTHEMall.
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
 
 const Cc = Components.classes;
 const Ci = Components.interfaces;

var dropDowns = {};
var strbundleB, strbundle;

function downloadElement(url, num) {
	if (!(url instanceof DTA_URL) || !DTA_AddingFunctions.isLinkOpenable(url)) {
		throw new Components.Exception('invalid url');
	}
	this.url = url;
	this.numIstance = num;
	this.refPage = $('URLref').value,
	this.description = window.arguments ? window.arguments[0] : '';
	this.ultDescription = '';
	this.mask = Dialog.ddRenaming.current;
	this.dirSave = Dialog.ddDirectory.current;
}

function Literal(str) {
	this.str = str;
}
function NumericRange(name, start, end, step, strl) {
	this.name = name;
	this.start = start;
	this.end = end;
	this.step = step;
	this.length = Math.floor((end - start) / step + 1);;
	this.strl = strl;
};
NumericRange.prototype = {
	join: function(str) {
		var rv = [];
		if (this.step > 0) {
			for (var i = this.start; i <= this.end; i += this.step) {
				rv.push(str + this.format(i));
			}
		} else {
			for (var i = this.start; i >= this.end; i += this.step) {
				rv.push(str + this.format(i));
			}
		}
		return rv;
	},
	format: function(i) {
		var rv = String(Math.abs(i));
		while (rv.length < this.strl) {
			rv = '0' + rv;
		}
		if (i < 0) {
			rv = '-' + rv;
		}
		return rv;
	}
};
function CharRange(name, start, end, step) {
	this.name = name;
	this.start = start;
	this.end = end;
	this.step = step;
	this.length = Math.floor((end - start) / step + 1);
};	
CharRange.prototype = {
	join: function(str) {
		var rv = [];
		if (this.step > 0) {
			for (var i = this.start; i <= this.end; i += this.step) {
				rv.push(str + String.fromCharCode(i));
			}
		} else {
			for (var i = this.start; i >= this.end; i += this.step) {
				rv.push(str + String.fromCharCode(i));
			}
		}
		return rv;
	}
}
function BatchGenerator(link) {
	if (!(link instanceof DTA_URL)) {
		throw new Components.Exception("invalid argument. Type not DTA_URL");
	}
	this.url = link.url;
	var url = this.url;
	this._length = 1;
	this._pats = [];
	var i;
	while ((i = url.search(/\[.*?]/)) != -1) {
		if (i != 0) {
			this._pats.push(new Literal(url.substring(0, i)));
			url = url.slice(i);
		}
		var m;
		if ((m = url.match(/\[(-?\d+):(-?\d+)(?::(-?\d+))?\]/))) {
			url = url.slice(m[0].length);
			try {
				var f = new Number(m[1]);
				var t = new Number(m[2]);
				var s = 1;
				if (m.length > 3 && typeof(m[3]) != 'undefined') {
					s = new Number(m[3]);
				}
				this._checkRange(f, t, s);
				if (f == t) {
					this._pats.push(new Literal(m[1]));
					continue;
				}
				var x = m[f > t ? 2 : 1];
				var sl = x.length;
				if (x.slice(0,1) == '-') {
					--sl;
				}
				this._pats.push(new NumericRange(m[0], f, t, s, sl));
			}
			catch (ex) {
				this._pats.push(new Literal(m[0]));
			}
			continue;
		}
		
		if ((m = url.match(/\[([a-z]):([a-z])(?::(-?\d))?\]/)) || (m = url.match(/\[([A-Z]):([A-Z])(?::(-?\d))?\]/))) {
			url = url.slice(m[0].length);
			try {
				var f = m[1].charCodeAt(0);
				var t = m[2].charCodeAt(0);
				var s = 1;
				if (m.length > 3 && typeof(m[3]) != 'undefined') {
					var s = new Number(m[3]);
				}
				this._checkRange(f, t, s);
				if (f == t) {
					this._pats.push(new Literal(m[1]));
					continue;
				}
				this._pats.push(new CharRange(m[0], f, t, s));
			}
			catch (ex) {
				this._pats.push(new Literal(m[0]));
			}
			continue;
		}
		if ((m = url.match(/\[.*?\]/))) {
			url = url.slice(m[0].length);
			this._pats.push(new Literal(m[0]));
		}
	}
	if (url.length) {
		this._pats.push(new Literal(url));
	}
	// join the literals if required!
	for (i = this._pats.length - 2; i >= 0; --i) {
		if ((this._pats[i] instanceof Literal) && (this._pats[i+1] instanceof Literal)) {
			this._pats[i] = new Literal(this._pats[i].str + this._pats[i+1].str);
			this._pats = this._pats.slice(0, i + 1).concat(this._pats.slice(i + 2));
		}
	}
	for (i = 0; i < this._pats.length; ++i) {
		var pat = this._pats[i];
		if (!(pat instanceof Literal)) {
			this._length *= pat.length;
		}
	}
}
BatchGenerator.prototype = {
	_checkRange: function(start, end, step) {
		if (!step) {
			throw 'step invalid!';
		}
		if ((start > end && step > 0) || (start < end && step < 0)) {
			throw 'negative range!';
		}
	},
	_processRange: function(pat, a) {
		if (!a.length) {
			a = [''];
		}
		var rv = [];
		for (var i = 0; i < a.length; ++i) {
			rv = rv.concat(pat.join(a[i]));
		}
		return rv;
	},
	_processLiteral: function(pat, rv) {
		if (!rv.length) {
			return [pat.str];
		}
		for (var i = 0; i < rv.length; ++i) {
			rv[i] = rv[i] + pat.str;
		}
		return rv;
	},
	getURLs: function(generator) {
		var rv = [];
		for (var i = 0; i < this._pats.length; ++i) {
			var pat = this._pats[i];
			if (pat instanceof Literal) {
				rv = this._processLiteral(pat, rv);
			}
			else {
				rv = this._processRange(pat, rv);
			}
		}
		for (var i = 0; i < rv.length; ++i) {
			rv[i] = generator(rv[i]);
		}
		return rv;
	},
	get length() {
		return this._length;
	},
	get parts() {
		var rv = [];
		for (var i = 0; i < this._pats.length; ++i) {
			var pat = this._pats[i];
			if (pat instanceof Literal) {
				continue;
			}
			rv.push(pat.name);
		}
		return rv.join("\n");
	}
};


var Dialog = {
	
	load: function DTA_load() {
		try {
			strbundleB = $("strings");
			strbundle = $("string");
		
			this.ddDirectory = new DTA_DropDown("directory", "directory", "directoryitems", []);
			this.ddRenaming = new DTA_DropDown(
				"renaming",
				"renaming",
				"renamingitems",
				["*name*.*ext*", "*num*_*name*.*ext*", "*url*-*name*.*ext*", "*name* (*text*).*ext*", "*name* (*hh*-*mm*).*ext*"]
			);
			
			var address = $('URLaddress');			
			
			if (window.arguments) {
				var a = window.arguments[0];
				var url = a.url;
				if (!('url' in a));
				else if (typeof(a.url) == 'string') {
					address.value = a.url;
				}
				else if (typeof(a.url) == 'object' && 'url' in a.url) {
					// we've got a DTA_URL.
					// In this case it is not save to modify it because of encoding issues.
					address.value = a.url.usable;
					// JS does not preserve types between windows (as each window gets an own sandbox)
					// This hack makes our URL a DTA_URL again ;)
					address._realURL = new DTA_URL(a.url.url, a.url.charset);					
					address.readOnly = true;
					$('batcheslabel').style.display = 'none';
					$('batches').collapsed = true;
					window.sizeToContent();
					// XXX reflect in css that URL is readonly
				}
				var refPage = DTA_AddingFunctions.isLinkOpenable(a.referrer) ? a.referrer : null;
				if (refPage) {
					try	{
						refPage = decodeURIComponent(refPage);
					} catch (ex) {}
					$("URLref").value	 = refPage;
				}
				if (a.mask) {
					$("renaming").current = a.mask;
				}
			}
			else {
				// check if there's some URL in clipboard
				var clip = Cc["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard);
				var trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
				try {
					trans.addDataFlavor("text/unicode");
					clip.getData(trans, clip.kGlobalClipboard);
					
					var str = {}, length = {};
					trans.getTransferData(
						"text/unicode",
						str,
						length
					);
					if (length.value) {
						str = str.value.QueryInterface(Ci.nsISupportsString);
						str = str.data;
						if (str.length && DTA_AddingFunctions.isLinkOpenable(str)) {
							address.value = str;
							address.select();
						}
					}
				}
				catch (ex) {
					Debug.dump("Not able to gather data from the clipboard!");
				}
			}

			this.check();
		} catch(ex) {
			Debug.dump("load():", ex);
		}		
	},
	check: function DTA_check() {
		var disable = $('URLaddress', 'directory', 'renaming')
			.some(function(e) {
				// reset the styles
				var style = e.inputField.style;
				style.backgroundColor = 'transparent';
				style.color = 'windowText';
				
				return e.value.length == 0;
			});
		
		// enable/disable the buttons;
		['accept', 'extra1']
			.forEach(function(e) { document.documentElement.getButton(e).setAttribute('disabled', disable);});
	},
	
	download: function DTA_download(queue) {
		
		var errors = [];
		
		// check the directory
		var f = new filePicker();
		var dir = this.ddDirectory.current.trim();
		if (!dir.length || !f.createValidDestination(dir)) {
			errors.push('directory');
		}
		
		// check mask
		var mask = this.ddRenaming.current;
		if (!mask.length) {
			errors.push('renaming');
		}
		
		var address = $('URLaddress');
		var url = address.value;
		if ('_realURL' in address) {
			url = address._realURL;
		}
		else if (url.length && DTA_AddingFunctions.isLinkOpenable(url)) {
			url = new DTA_URL(url);
		}
		else {
			errors.push('URLaddress');
		}
		
		if (errors.length) {
			errors.forEach(function(e) { var style = $(e).inputField.style; style.backgroundColor = 'red'; style.color = 'white'; });
			return false;
		}		

		var num = Preferences.getDTA("counter", 0);
		if (++num > 999) {
			num = 1;
		}			
		
		var batch = new BatchGenerator(url);
		if (batch.length > 1) {
			
			var message = strbundleB.getFormattedString(
				'tasks',
				[batch.length, batch.parts]
			);
			if (batch.length > 1000) {
				message += strbundleB.getString('manytasks');
			}
			
			var prompter = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
			var rv = prompter.confirmEx(
				window,
				"Download Batch",
				message,
				127 + (2 << 8) + (127 << 16),
				"Batch",
				null,
				"Single URL",
				null,
				{}
			);
			if (rv == 0) {
				batch = batch.getURLs(function(aURL) { return new downloadElement(new DTA_URL(aURL), num); });
			}
			else if (rv == 2) {
				batch = [new downloadElement(url, num)];
			}
			else {
				return false;
			}
		}
		else {
			batch = [new downloadElement(url, num)];
		}
		DTA_AddingFunctions.sendToDown(queue, batch);

		Preferences.setDTA("counter", num);
	
		['ddRenaming', 'ddDirectory'].forEach(function(e) { Dialog[e].save(); });
		
		self.close();
		
		return true;
	},
	browseDir: function DTA_browseDir() {
		// let's check and create the directory
		var f = new filePicker();
		var newDir = f.getFolder(
			this.ddDirectory.current,
			strbundle.getString("validdestination")
		);
		if (newDir) {
			$("directory").current = newDir;
		}
		this.check();
	}
}

// XXX: make a real xbl binding out of this :p
DTA_include("chrome://dta/content/dta/maskbutton.js");