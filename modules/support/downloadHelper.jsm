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
 * The Original Code is DownThemAll DownloadHelper module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2009
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

const EXPORTED_SYMBOLS = ["available", "processors"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

module("resource://dta/glue.jsm");

const available = ("dhICore" in Ci) && ("dhIProcessor" in Ci);

if (available) {
	const core = Cc["@downloadhelper.net/core;1"].getService(Ci.dhICore);

	function ProcessorImpl(turbo, name, title, description) {
		this.init(name, title, description);
		this.turbo = !!turbo;
	}
	ProcessorImpl.prototype = {
		init: function(name, title, description) {
			this.__defineGetter__("name", function() name);
			this.__defineGetter__("title", function() title);
			this.__defineGetter__("description", function() description);
			core.registerProcessor(this);
		},

		QueryInterface: XPCOMUtils.generateQI([Ci.dhIProcessor, Ci.sehISecretHelperProcessorExtra]),

		get provider() { return "DownThemAll!"; },
		get enabled() { return true; },

		canHandle: function(desc) desc.has("media-url") || desc.has("links"),

		requireDownload: function(desc) false,
		preDownload: function(desc) false,

		handle: function(props) {
			module("resource://dta/utils.jsm");
			module("resource://dta/api.jsm");
			try {
				if (props.has('links')) {
					this.handleLinks(props);
				}
				else {
					this.handleSingle(props);
				}
			}
			catch (ex) {
				if (Logger.enabled) {
					Logger.log("failed to handle", ex);
				}
				throw ex;
			}
		},
		getWindow: function(props) {
			return ('window' in props) ? props.window : null;
		},
		createItem: function(props) {
			module("resource://dta/api.jsm");
			let win = this.getWindow(props);
			let doc = ('document' in props) ? props.document : null;
			let url = new URL(Services.io.newURI(props.mediaUrl, doc ? doc.characterSet : null, null));
			let item = {
				url: url,
				referrer: props.documentUrl || props.pageUrl || null,
			};
			if (props.youtubeTitle) {
				item.description = props.youtubeTitle;
				item.ultDescription = props.label || null;
			}
			else if (props.snName) {
				item.description = props.snName;
				item.ultDescription = props.label || null;
			}
			else {
				item.description = props.label || null;
			}
			if (item.description && props.fileExtension) {
				item.fileName = item.destinationName = item.description + "." + props.fileExtension;
			}
			return item;
		},
		handleLinks: function(desc) {
			let links = desc.get('links', Ci.nsIArray).enumerate();
			let urls = [];
			for (let link in new SimpleIterator(links, Ci.nsIProperties)) {
				let props = new Properties(link, desc);
				let item = null;
				try {
					urls.push(this.createItem(props));
				}
				catch (ex) {
					continue;
				}
			}
			if (!urls.length) {
				return;
			}

			let win = this.getWindow(new Properties(desc));
			if (urls.length == 1) {
				saveSingleItem(win, this.turbo, urls[0]);
				return;
			}
			if (this.turbo) {
				turboSaveLinkArray(win, urls, []);
			}
			else {
				saveLinkArray(win, urls, []);
			}
		},
		handleSingle: function(props)	{
			props = new Properties(props);
			let item = this.createItem(props);
			saveSingleItem(this.getWindow(props), this.turbo, item);
		}
	};

	const processors = [];

	let _str = Services.strings
		.createBundle('chrome://dta/locale/downloadHelper.properties');
	function getString(n) {
		try {
			return _str.GetStringFromName(n);
		}
		catch (ex) {
			Cu.reportError("locale error: " + n + ex);
			return '<error>';
		}
	};
	processors.push(new ProcessorImpl(false, "dta-regular", getString('dta-regular'), getString('dta-regular-desc')));
	processors.push(new ProcessorImpl(true, "dta-turbo", getString('dta-turbo'), getString('dta-turbo-desc')));
}
