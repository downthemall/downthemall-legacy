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
 * Portions created by the Initial Developer are Copyright (C) 2008
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

const ConverterOutputStream = Construct('@mozilla.org/intl/converter-output-stream;1', 'nsIConverterOutputStream', 'init');

var ImEx = {
	exportToHtml: function(downloads, file) {
		// do not localize?!
		let title = "DownThemAll: exported on " + (new Date).toUTCString();
		
		let doctype = document.implementation.createDocumentType('html', '-//W3C//DTD XHTML 1.0 Strict//EN', 'http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd');
		let doc = document.implementation.createDocument('http://www.w3.org/1999/xhtml', 'html', doctype);
		let root = doc.documentElement;
		
		{
			let head = doc.createElement('head');
			
			let n = doc.createElement('title');
			n.textContent = title;
			head.appendChild(n);
			
			n = doc.createElement('meta')
			n.setAttribute('http-equiv', 'content-type');
			n.setAttribute('content', 'application/xhtml+xml;charset=utf-8');
			head.appendChild(n);
			
			n = doc.createElement('link');
			n.setAttribute('rel', 'stylesheet');
			n.setAttribute('type', 'text/css');
			n.setAttribute('href', 'chrome://dta/skin/common/exporthtml.css');
			head.appendChild(n);
			
			root.appendChild(head);
		}
		{
			let addDesc = function(key, value, element) {
				let div = doc.createElement('div');
				
				div.appendChild(doc.createTextNode(key + ": "));
				
				let b = doc.createElement('strong');
				b.textContent = value;
				div.appendChild(b);
				
				element.appendChild(div);				
			};
		
		
			let body = doc.createElement('body');
			
			let n = doc.createElement('h1');
			n.textContent = title;
			body.appendChild(n);
			
			let list = doc.createElement('ol');
			for (let d in downloads) {
				let url = d.urlManager.url.spec;
				if (d.hash) {
					url += '#hash(' + d.hash.type + ":" + d.hash.sum + ")";
				}
				let desc = d.description;
				if (!desc) {
					desc = d.fileName;
				}
				let li = doc.createElement('li');

				let div = doc.createElement('div');
				n = doc.createElement('a');
				n.setAttribute('href', url);
				n.textContent = desc;
				div.appendChild(n);
				li.appendChild(div);
				
				addDesc('URL', d.urlManager.usable, li);
				if (d.referrer) {
					addDesc('Referrer', d.referrer.spec, li);				
				}
				if (d.hash) {
					addDesc(d.hash.type, d.hash.sum.toLowerCase(), li);
				}					
				list.appendChild(li);
			}			
			body.appendChild(list);
			
			let foot = doc.createElement('p');
			foot.appendChild(doc.createTextNode('Exported by '));
			n = doc.createElement('a');
			n.setAttribute('href', 'http://www.downthemall.net/');
			n.textContent = 'DownThemAll! ' + DTA.VERSION;
			foot.appendChild(n);
			body.appendChild(foot);		
			
			root.appendChild(body);
		}
		

		let fs = new FileOutputStream(file, 0x02 | 0x08 | 0x20, Prefs.permissions, 0);
		new XMLSerializer().serializeToStream(doc, fs, 'utf-8');
		fs.close();	
	},
	exportToTxt: function(downloads, file) {
		let cs = ConverterOutputStream(
			new FileOutputStream(file, 0x02 | 0x08 | 0x20, Prefs.permissions, 0),
			null,
			0,
			null
		);
		for (let d in downloads) {
			let url = d.urlManager.url.spec;
			if (d.hash) {
				url += '#hash(' + d.hash.type + ":" + d.hash.sum + ")";
			}
			url += "\r\n";
			cs.writeString(url); 
		}
		cs.close();
	},
	exportToMetalink: function(downloads, file) {
		let doc = document.implementation.createDocument(NS_METALINKER, 'metalink', null);
		let root = doc.documentElement;
		root.setAttribute('type', 'static');
		root.setAttribute('version', '3.0');
		root.setAttribute('generator', 'DownThemAll! ' + DTA.BASE_VERSION + ' <http://downthemall.net/>');
		root.setAttributeNS(NS_DTA, 'version', DTA.VERSION);
		root.setAttribute('pubdate', new Date().toUTCString());
		
		root.appendChild(doc.createComment("metalink as exported by DownThemAll!\r\nmay contain DownThemAll! specific information in the DownThemAll! namespace: " + NS_DTA));  
		
		let files = doc.createElementNS(NS_METALINKER, 'files');
		for (let d in downloads) {
			let f = doc.createElementNS(NS_METALINKER, 'file');
			f.setAttribute('name', d.fileName);
			f.setAttributeNS(NS_DTA, 'num', d.numIstance);
			f.setAttributeNS(NS_DTA, 'startDate', d.startDate.getTime());
			if (d.referrer) {
				f.setAttributeNS(NS_DTA, 'referrer', d.referrer.spec);
			}
			
			if (d.description) {
				let n = doc.createElementNS(NS_METALINKER, 'description');
				n.textContent = d.description;
				f.appendChild(n);
			} 
			let r = doc.createElementNS(NS_METALINKER, 'resources');
			for (let u in d.urlManager.all) {
				let n = doc.createElementNS(NS_METALINKER, 'url');
				let t = u.url.spec.match(/^(\w+):/);
				n.setAttribute('type', t[1]);
				n.setAttribute('preference', u.preference);
				n.setAttributeNS(NS_DTA, 'usable', u.usable);
				n.setAttributeNS(NS_DTA, 'charset', u.charset);
				n.textContent = u.url.spec;
				r.appendChild(n);
			}
			if (d.hash) {
				let v = doc.createElementNS(NS_METALINKER, 'verification');
				let h = doc.createElementNS(NS_METALINKER, 'hash');
				h.setAttribute('type', d.hash.type.toLowerCase());
				h.textContent = d.hash.sum.toLowerCase();
				v.appendChild(h);
				f.appendChild(v);
			}
			f.appendChild(r);
			
			if (d.totalSize > 0) {
				let s = doc.createElementNS(NS_METALINKER, 'size');
				s.textContent = d.totalSize;
				f.appendChild(s);
			}
			
			files.appendChild(f);
			
		}
		root.appendChild(files);
		
		let fs = new FileOutputStream(file, 0x02 | 0x08 | 0x20, Prefs.permissions, 0);
		let xml = '<?xml version="1.0"?>\r\n';
		fs.write(xml, xml.length);
		new XMLSerializer().serializeToStream(doc, fs, 'utf-8');
		fs.close();
	},
	
	importFromTxt: function(file) {
		// Open the file in a line reader
		let is = new FileInputStream(file, 0x01, 0, 0);
		let ls = is.QueryInterface(Ci.nsILineInputStream);
		let line = {};
		let links = [];
		while(ls.readLine(line)) {
			try {
				// try to parse the URI and and see if it is of the correct type.
				let url = line.value.trim().toURI();
				if (['http', 'https', 'ftp'].indexOf(url.scheme) == -1) {
					throw new Exception("Invalid url!");
				}
				links.push({
					'url': new DTA_URL(url),
					'referrer': '',
					'description': 'imported from ' + file.leafName 
				});
			}
			catch (ex) {
				Debug.log("not processing line " + line.value, ex);
			}
		}
		is.close();
		if (links.length) {
			DTA_AddingFunctions.saveLinkArray(false, links, []);
		}
	},
	importFromMetalink: function(file) {
		DTA_include("dta/manager/metalinker.js");
		Metalinker.handleFile(file);
	}
};