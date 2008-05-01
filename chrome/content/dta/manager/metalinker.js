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
 
function NSResolver(prefix) {
  if(prefix == 'html') {
    return 'http://www.w3.org/1999/xhtml';
  }
 	return 'http://www.metalinker.org/';
}
 
 var Metalinker = {
 	_getNodes: function ML__getNodes(elem, query) {
		var rv = [];
		var nodeSet = elem.ownerDocument.evaluate(
			query,
			elem,
			NSResolver,
			XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
			null
		);
		for (var j = 0; j < nodeSet.snapshotLength; ++j) {
			rv.push(nodeSet.snapshotItem(j));
		}
		return rv;
	},
	_getNode: function ML_getNode(elem, query) {
		var r = this._getNodes(elem, query);
		if (r.length) {
			return r.shift();
		}
		return null;
	},
 	_getSingle: function ML__getSingle(elem, query) {
 		var rv = this._getNode(elem, 'ml:' + query);
 		return rv ? rv.textContent.trim() : '';
 	},
 	_getLinkRes: function(elem, query) {
 		var rv = this._getNode(elem, 'ml:' + query);
 		if (rv) {
 			var n = this._getSingle(rv, "name"), l = this._checkURL(this._getSingle(rv, "url"));
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
			if (['http', 'https', 'ftp'].indexOf(url.scheme) != -1 && url.host.indexOf('.') == -1) {
				throw new Components.Exception("bad link!");
			}
			if (allowed instanceof Array && allowed.indexOf(url.scheme) == -1) {
				throw new Components.Exception("not allowed");
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
		var file = new FileFactory(download.destinationFile);
		
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
		
			var fiStream = new FileInputStream(aFile, 1, 0, false);
			var domParser = new DOMParser();
			var doc = domParser.parseFromStream(fiStream, null, aFile.fileSize, "application/xml");
			var root = doc.documentElement;
			fiStream.close();
			
			if (root.nodeName != 'metalink' || root.getAttribute('version') != '3.0') {
				throw new Error(_('mlinvalid'));
			}
	
			var aNum = Preferences.getDTA('numistance', 0);
			if (++aNum > 999) {
				aNum = 1;
			}
			Preferences.setDTA('numistance', aNum);
	
	
			var locale = this.locale.split('-').map(function(l) { return l.slice(0, 2).toLowerCase(); }).reverse();
			var downloads = [];
			var files = root.getElementsByTagName('file');
			for (var i = 0, e = files.length; i < e; ++i) {
				var file = files[i];
				var fileName = file.getAttribute('name').getUsableFileName();
				if (!fileName) {
					throw new Exception("File name not provided!");
				}
				var referrer = null;
				if (file.hasAttributeNS(NS_DTA, 'referrer')) {
					referrer = file.getAttributeNS(NS_DTA, 'referrer');
				}
				else {
					referrer = aReferrer;
				}
				var num = aNum;
				if (file.hasAttributeNS(NS_DTA, 'num')) {
					try {
						num = parseInt(file.getAttributeNS(NS_DTA, 'num'));
					} catch (ex) { /* no-op */ }
				}
				var startDate = new Date();
				if (file.hasAttributeNS(NS_DTA, 'date')) {
					try {
						startDate = new Date(parseInt(file.getAttributeNS(NS_DTA, 'num')));
					} catch (ex) { /* no-op */ }
				}				
					
				var urls = [];
				var urlNodes = this._getNodes(file, 'ml:resources/ml:url');
				for each (var url in urlNodes) {
					var type = url.getAttribute('type');
					var preference = 1;
					var charset = doc.characterSet;
					var usable = null;
					
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
					if (url.hasAttributeNS(NS_DTA, 'charset')) {
						charset = url.getAttributeNS(NS_DTA, 'charset');
					}
					if (url.hasAttributeNS(NS_DTA, 'usable')) {
						usable = url.getAttributeNS(NS_DTA, 'usable');
					}
					if (['http', 'https'].indexOf(type) != -1) {
						url = this._checkURL(url.textContent.trim());
						if (url) {
							urls.push(new DTA_URL(url, charset, usable, preference));
						}
					}
				}
				if (!urls.length) {
					continue;
				}
				var hash = null; 
				var hashes = this._getNodes(file, 'ml:verification/ml:hash');
				for each (h in hashes) {
					h = h.textContent.trim();
					try {
						h = new DTA_Hash(h, hashes[j].getAttribute('type'));
						hash = h;		
					}
					catch (ex) {
						Debug.log(h, ex);
					}
				}
				var desc = this._getSingle(file, 'description');
				if (!desc) {
					desc = this._getSingle(root, 'description');
				}
				var size = this._getSingle(file, 'size');
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
				var info = {
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
			if (!(ex instanceof Error)) {
				ex = new Error(_('mlerror', [ex.error]));
			}
			if (ex instanceof Error) {
				AlertService.show(_('mlerrortitle'), ex.message, false);
			}
			Debug.log("Metalinker::handleDownload", ex);
		}
 	},
 	_insertDownload: function(d) {
 		if (d.lang && d.lang.search(/^\w{2}(?:-\w{2})?$/) != -1) {
 			var locale = this.locale;
 			d.selected = locale.slice(0,2) == d.lang.slice(0,2);
 		}
 		var e = document.createElement('richlistitem');
 		e.setAttribute("class", "item");
 		e.download = d;
 		$('downloads').appendChild(e); 		
 	},
 	load: function ML_load() {
 		try {
 			var downloads = window.arguments[0];
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
 			'logo': 'chrome://dta/skin/icons/metalink_big.png',
 			'publisher': null,
 			'license': null
 		}
 		try {
 			var oi = window.arguments[1];
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
 		$('icon').src = info.logo;
 		if (info.publisher) {
 			var e = $('publisher');
 			e.value = info.publisher[0];
 			e.link = info.publisher[1]; 			
 		}
 		else {
 			$('boxPublisher').hidden = true;
 		}
 		if (info.license) {
 			var e = $('license');
 			e.value = info.license[0];
 			e.link = info.license[1]; 			
 		}
 		else {
 			$('boxLicense').hidden = true;
 		} 		
 	},
	browseDir: function() {

		// get a new directory
		var newDir = Utils.askForDir(
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
		DTA_Mediator.openTab(e.link);
	},
	select: function(type) {
		var f;
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
		}		
		for each (var node in document.getElementsByTagName('richlistitem')) {
			node.checked = f(node);
		}
	}
};