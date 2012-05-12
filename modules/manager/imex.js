/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const DTA = require("api");
const Preferences = require("preferences");
const {getTextLinks} = require("support/textlinks");
const Version = require("version");
const {NS_DTA, NS_METALINKER3} = require("support/metalinker");
const {Logger, filterInSitu} = requireJSM("resource://dta/utils.jsm");

const XPathResult = Ci.nsIDOMXPathResult;

exports.parseTextFile = function parseTextFile(aFile) {
	function addLine(line) {
		try {
			// try to parse the URI and and see if it is of the correct type.
			line = line.value.replace(/^\s+|\s+$/g, '');
			lines.push(line);
		}
		catch (ex) {
			if (Logger.enabled) {
				Logger.log("not processing line " + line.value, ex);
			}
		}
	}

	if (Logger.enabled) {
		Logger.log("Parsing text file: " + aFile.spec);
	}
	// Open the file in a line reader
	let is = new Instances.FileInputStream(aFile, 0x01, 0, 0);
	let ls = is.QueryInterface(Ci.nsILineInputStream);
	let line = {};
	let lines = [];

	while(ls.readLine(line)) {
		addLine(line);
	}
	addLine(line);
	is.close();
	if (Logger.enabled) {
		Logger.log("Got lines: " + lines.length);
	}

	let links = [];
	for each (let l in getTextLinks(lines.join("\n"), false)) {
		l = Services.io.newURI(l, null, null);
		links.push({
			url: new DTA.URL(l),
			referrer: null,
			description: 'imported from ' + aFile.leafName
		});
	}
	if (Logger.enabled) {
		Logger.log("parsed text file, links: " + links.length);
	}
	return filterInSitu(links, function(e) (e = e.url.url.spec) && !((e in this) || (this[e] = null)), {});
}

exports.exportToTextFile = function exportToTextFile(aDownloads, aFile, aPermissions) {
	let fs = new Instances.FileOutputStream(aFile, 0x02 | 0x08 | 0x20, aPermissions, 0);
	let cs = new Instances.ConverterOutputStream(fs, null, 0, null);
	for (let d in aDownloads) {
		let url = d.urlManager.url.spec;
		if (d.hashCollection) {
			url += '#hash(' + d.hashCollection.full.type + ":" + d.hashCollection.full.sum + ")";
		}
		url += "\r\n";
		cs.writeString(url);
	}
	cs.close();
	try { fs.close(); } catch (ex) { /* no op */ }
}

exports.exportToHtmlFile = function exportToHtmlFile(aDownloads, aDocument, aFile, aPermissions) {
	// do not localize?!
	let title = "DownThemAll: exported on " + (new Date).toUTCString();

	let doctype = aDocument.implementation.createDocumentType('html', null, null);
	let document = aDocument.implementation.createDocument('http://www.w3.org/1999/xhtml', 'html', doctype);
	let root = document.documentElement;

	{
		let head = document.createElement('head');

		let n = document.createElement('title');
		n.textContent = title;
		head.appendChild(n);

		n = document.createElement('meta')
		n.setAttribute('http-equiv', 'content-type');
		n.setAttribute('content', 'application/xhtml+xml;charset=utf-8');
		head.appendChild(n);

		n = document.createElement('link');
		n.setAttribute('rel', 'stylesheet');
		n.setAttribute('type', 'text/css');
		n.setAttribute('href', 'chrome://dta-public/skin/exporthtml.css');
		head.appendChild(n);

		root.appendChild(head);
	}
	{
		let addDesc = function(key, value, element) {
			let div = document.createElement('div');
			div.className = 'desc';

			div.appendChild(document.createTextNode(key + ": "));

			let b = document.createElement('strong');
			b.textContent = value;
			div.appendChild(b);

			element.appendChild(div);
		};


		let body = document.createElement('body');

		let n = document.createElement('h1');
		n.textContent = title;
		body.appendChild(n);

		let list = document.createElement('ol');
		for (let d in aDownloads) {
			let url = d.urlManager.url.spec;
			if (d.hashCollection) {
				url += '#hash(' + d.hashCollection.full.type + ":" + d.hashCollection.full.sum + ")";
			}
			let desc = d.description;
			if (!desc) {
				desc = d.fileName;
			}
			let li = document.createElement('li');

			let div = document.createElement('div');
			n = document.createElement('a');
			n.setAttribute('href', url);
			n.textContent = desc;
			div.appendChild(n);
			li.appendChild(div);

			addDesc('URL', d.urlManager.usable, li);
			if (d.referrer) {
				addDesc('Referrer', d.referrer.spec, li);
			}
			if (d.hashCollection) {
				addDesc(d.hashCollection.full.type, d.hashCollection.full.sum.toLowerCase(), li);
			}
			list.appendChild(li);
		}
		body.appendChild(list);

		let foot = document.createElement('p');
		foot.appendChild(document.createTextNode('Exported by '));
		n = document.createElement('a');
		n.setAttribute('href', 'http://www.downthemall.net/');
		n.textContent = 'DownThemAll! ' + Version.VERSION;
		foot.appendChild(n);
		body.appendChild(foot);

		root.appendChild(body);
	}


	let fs = new Instances.FileOutputStream(aFile, 0x02 | 0x08 | 0x20, aPermissions, 0);
	Instances.domserializer.serializeToStream(document, fs, 'utf-8');
	fs.close();

}

exports.exportToMetalinkFile = function exportToMetalinkFile(aDownloads, aDocument, aFile, aPermissions) {
	let document = aDocument.implementation.createDocument(NS_METALINKER3, 'metalink', null);
	let root = document.documentElement;
	root.setAttribute('type', 'static');
	root.setAttribute('version', '3.0');
	root.setAttribute('generator', 'DownThemAll!/' + Version.BASE_VERSION);
	root.setAttributeNS(NS_DTA, 'version', Version.VERSION);
	root.setAttribute('pubdate', new Date().toUTCString());

	root.appendChild(document.createComment(
			"metalink as exported by DownThemAll! on "
			+ Version.APP_NAME + "/" + Version.APP_VERSION
			+ "\r\nMay contain DownThemAll! specific information in the DownThemAll! namespace: "
			+ NS_DTA
			));

	let files = document.createElementNS(NS_METALINKER3, 'files');
	for (let d in aDownloads) {
		let f = document.createElementNS(NS_METALINKER3, 'file');
		f.setAttribute('name', d.fileName);
		f.setAttributeNS(NS_DTA, 'num', d.numIstance);
		f.setAttributeNS(NS_DTA, 'startDate', d.startDate.getTime());
		if (d.referrer) {
			f.setAttributeNS(NS_DTA, 'referrer', d.referrer.spec);
		}

		if (d.description) {
			let n = document.createElementNS(NS_METALINKER3, 'description');
			n.textContent = d.description;
			f.appendChild(n);
		}
		let r = document.createElementNS(NS_METALINKER3, 'resources');
		for (let u in d.urlManager.all) {
			let n = document.createElementNS(NS_METALINKER3, 'url');
			let t = u.url.spec.match(/^(\w+):/);
			n.setAttribute('type', t[1]);
			n.setAttribute('preference', u.preference);
			n.setAttributeNS(NS_DTA, 'usable', u.usable);
			n.textContent = u.url.spec;
			r.appendChild(n);
		}
		if (d.hashCollection) {
			let v = document.createElementNS(NS_METALINKER3, 'verification');
			let h = document.createElementNS(NS_METALINKER3, 'hash');
			h.setAttribute('type', d.hashCollection.full.type.toLowerCase());
			h.textContent = d.hashCollection.full.sum.toLowerCase();
			v.appendChild(h);
			// XXX implement chunks
			f.appendChild(v);
		}
		f.appendChild(r);

		if (d.totalSize > 0) {
			let s = document.createElementNS(NS_METALINKER3, 'size');
			s.textContent = d.totalSize;
			f.appendChild(s);
		}

		files.appendChild(f);

	}
	root.appendChild(files);

	let fs = new Instances.FileOutputStream(aFile, 0x02 | 0x08 | 0x20, aPermissions, 0);
	let xml = '<?xml version="1.0"?>\r\n';
	fs.write(xml, xml.length);
	Instances.domserializer.serializeToStream(document, fs, 'utf-8');
	fs.close();
}
