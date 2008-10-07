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

var METALINK_LOGO = 'chrome://dta/skin/icons/metalink48.png';
 
var NSResolver = {
	lookupNamespaceURI: function NSR_lookupNamespaceURI(prefix) {
		switch (prefix) {
		case 'html':
			return NS_HTML;
		case 'dta':
			return NS_DTA;
	  }
    return NS_METALINKER;		
	}
}; 

var Metalinker = {
 	_getNodes: function ML__getNodes(elem, query) {
		let rv = [];
		let doc = elem instanceof Document ? elem : elem.ownerDocument;
		let iterator = doc.evaluate(
			query,
			elem,
			NSResolver,
			XPathResult.ORDERED_NODE_ITERATOR_TYPE,
			null
		);
		for (let n = iterator.iterateNext(); n; n = iterator.iterateNext()) {
			rv.push(n);
		}
		return rv;
	},
	_getNode: function ML_getNode(elem, query) {
		let r = this._getNodes(elem, query);
		if (r.length) {
			return r.shift();
		}
		return null;
	},
 	_getSingle: function ML__getSingle(elem, query) {
 		let rv = this._getNode(elem, 'ml:' + query);
 		return rv ? rv.textContent.trim() : '';
 	},
 	_getLinkRes: function(elem, query) {
 		let rv = this._getNode(elem, 'ml:' + query);
 		if (rv) {
 			let n = this._getSingle(rv, 'name'), l = this._checkURL(this._getSingle(rv, 'url'));
 			if (n && l) {
 				return [n, l];
 			}
 		}
 		return null;
 	},
 	_checkURL: function ML__checkURL(url, allowed) {
 		try {
			url = url.toURI();
			if (url.scheme == 'file') {
				throw new Components.Exception("file protocol invalid");
			}
			// check for some popular bad links :p
			if (['http', 'https', 'ftp'].indexOf(url.scheme) == -1 || url.host.indexOf('.') == -1) {
				throw new Exception("bad link!");
			}
			if (allowed instanceof Array && allowed.indexOf(url.scheme) == -1) {
				throw new Exception("not allowed");
			}
			return url.spec;
 		}
 		catch (ex) {
 			// no-op
 		}
		return null; 		
 	},
 	get locale() {
 		return Preferences.get('general.useragent.locale', 'en-US');
 	},
 	handleDownload: function ML_handleDownload(download) {
		download.state = CANCELED;
		Tree.remove(download, false);
		let file = new FileFactory(download.destinationFile);
		
		this.handleFile(file, download.referrer);
		
		try {
			file.remove(false);
		} catch (ex) {
			Debug.log("failed to remove metalink file!", ex);
		}
	},
	handleFile: function ML_handleFile(aFile, aReferrer) {
		try {
			
			if (aReferrer && 'spec' in aReferrer) {
				aReferrer = aReferrer.spec;
			}		
		
			let fiStream = new FileInputStream(aFile, 1, 0, false);
			let domParser = new DOMParser();
			let doc = domParser.parseFromStream(fiStream, null, aFile.fileSize, "application/xml");
			let root = doc.documentElement;
			fiStream.close();
			
			if (root.nodeName != 'metalink' || root.getAttribute('version') != '3.0') {
				throw new Exception(_('mlinvalid'));
			}
			let aNum = Preferences.getExt('numistance', 0);
			if (++aNum > 999) {
				aNum = 1;
			}
			Preferences.setExt('numistance', aNum);
	
	
			let locale = this.locale.split('-').map(function(l) { return l.slice(0, 2).toLowerCase(); }).reverse();
			let downloads = [];
			let files = this._getNodes(doc, '//ml:files/ml:file');
			for each (let file in files) {
				let fileName = file.getAttribute('name').getUsableFileName();
				if (!fileName) {
					throw new Exception("File name not provided!");
				}
				let referrer = null;
				if (file.hasAttributeNS(NS_DTA, 'referrer')) {
					referrer = file.getAttributeNS(NS_DTA, 'referrer');
				}
				else {
					referrer = aReferrer;
				}
				let num = aNum;
				if (file.hasAttributeNS(NS_DTA, 'num')) {
					try {
						num = parseInt(file.getAttributeNS(NS_DTA, 'num'));
					}
					catch (ex) {
						/* no-op */
					}
				}
				let startDate = new Date();
				if (file.hasAttributeNS(NS_DTA, 'date')) {
					try {
						startDate = new Date(parseInt(file.getAttributeNS(NS_DTA, 'num')));
					}
					catch (ex) {
						/* no-op */
					}
				}				
					
				let urls = [];
				let urlNodes = this._getNodes(file, 'ml:resources/ml:url');
				for each (var url in urlNodes) {
					let preference = 1;
					let charset = doc.characterSet;
					if (url.hasAttributeNS(NS_DTA, 'charset')) {
						charset = url.getAttributeNS(NS_DTA, 'charset');
					}

					let uri = null;
					try {
						uri = this._checkURL(url.textContent.trim());
						if (!uri) {
							throw new Exception("Invalid url");
						}							
						uri = IOService.newURI(uri, charset, null);
					}
					catch (ex) {
						continue;
					}
					
					if (url.hasAttribute('preference')) {
						var a = new Number(url.getAttribute('preference'));
						if (isFinite(a) && a > 0 && a < 101) {
							preference = a;
						}
					}
					if (url.hasAttribute('location')) {
						var a = url.getAttribute('location').slice(0,2).toLowerCase();
						if (locale.indexOf(a) != -1) {
							preference = 100 + preference;
						}
					}
					urls.push(new DTA_URL(uri, preference));
				}
				if (!urls.length) {
					continue;
				}
				let hash = null; 
				for each (let h in this._getNodes(file, 'ml:verification/ml:hash')) {
					try {
						h = new DTA_Hash(h.textContent.trim(), h.getAttribute('type'));
						hash = h;		
					}
					catch (ex) {
						Debug.log("Failed to parse hash: " + h.textContent.trim() + "/" + h.getAttribute('type'), ex);
					}
				}
				let desc = this._getSingle(file, 'description');
				if (!desc) {
					desc = this._getSingle(root, 'description');
				}
				let size = this._getSingle(file, 'size');
				size = parseInt(size);
				if (isFinite(size)) {
					size = Utils.formatBytes(size);
				}
				else {
					size = '';
				}
				downloads.push({
					'url': new UrlManager(urls),
					'fileName': fileName,
					'referrer': referrer ? referrer : null,
					'numIstance': num,
					'description': desc,
					'startDate': startDate,
					'ultDescription': '',
					'hash': hash,
					'license': this._getLinkRes(file, "license"),
					'publisher': this._getLinkRes(file, "publisher"),
					'identity': this._getSingle(file, 'identity'),
					'copyright': this._getSingle(file, 'copyright'),
					'size': size,
					'version': this._getSingle(file, 'version'),
					'logo': this._checkURL(this._getSingle(file, 'logo')),
					'lang': this._getSingle(file, 'language'),
					'sys': this._getSingle(file, 'os'),
					'mirrors': urls.length, 
					'selected': true,
					'fromMetalink': true
				});
			}
			if (!downloads.length) {
				throw new Error(_('mlnodownloads'));
			}
			if (downloads.length) {
				let info = {
					'identity': this._getSingle(root, 'identity'),
					'description': this._getSingle(root, 'description'),
					'logo': this._checkURL(this._getSingle(root, 'logo')),
					'license': this._getLinkRes(root, "license"),
					'publisher': this._getLinkRes(root, "publisher"),
					'start': false
				};
				window.openDialog(
					'chrome://dta/content/dta/manager/metaselect.xul',
					'_blank',
					'chrome,centerscreen,dialog=yes,modal',
					downloads,
					info
				);
				downloads = downloads.filter(function(d) { return d.selected; });
				if (downloads.length) {
					startDownloads(info.start, downloads);
				}
			}
		}
		catch (ex) {
			Debug.log("Metalinker::handleDownload", ex);			
			if (!(ex instanceof Error)) {
				ex = new Error(_('mlerror', [ex.error]));
			}
			if (ex instanceof Error) {
				AlertService.show(_('mlerrortitle'), ex.message, false);
			}
		}
 	},
 	_insertDownload: function(d) {
 		if (d.lang && d.lang.search(/^\w{2}(?:-\w{2})?$/) != -1) {
 			let locale = this.locale;
 			d.selected = locale.slice(0,2) == d.lang.slice(0,2);
 		}
 		var e = document.createElement('richlistitem');
 		e.setAttribute("class", "item");
 		e.download = d;
 		$('downloads').appendChild(e); 		
 	},
 	load: function ML_load() {
 		try {
 			let downloads = window.arguments[0];
 			if (downloads.length) {
 				downloads.forEach(this._insertDownload, this);
 			}
 		}
 		catch(ex) {
 			// no-op
 		}
 		var info = {
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
		logo.onload = function() {
			let canvas = $('icon');
			try {
				canvas.width = canvas.clientWidth;
				canvas.height = canvas.clientHeight;
				let ctx = canvas.getContext('2d');
				
				let w = logo.naturalWidth;
				let h = logo.naturalHeight;
				let d = Math.max(w, h);
				
				ctx.scale(canvas.width / d, canvas.height / d);
				
				ctx.drawImage(logo, (d - w) /2, (d - h) / 2);								
			}
			catch (ex) {
				Debug.log("Cannot load logo", ex);
				logo.src = METALINK_LOGO;
			}
		};
		logo.onerror = function() {
			logo.src = METALINK_LOGO;
		};
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
		if ($('directory', 'renaming').some(
			function(e) {
				if (!e.value) {
					e.focus();
					e.style.border = "1px solid red";
					return true;
				}
				return false;
			}
		)) {
			return false;
		}
		
		Array.forEach(
			document.getElementsByTagName('richlistitem'),
			function(n) {
				n.download.dirSave =  $('directory').value;
				n.download.mask =  $('renaming').value;		
				n.download.selected = n.checked;
			},
			this
		);
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
		return true;
	},
	openLink: function(e) {
		DTA_Mediator.open(e.link);
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