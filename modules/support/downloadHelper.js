/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const available = ("dhICore" in Ci) && ("dhIProcessor" in Ci);
if (available) {
	lazy(this, "api", function() require("api"));
	lazy(this, "utils", function() require("utils"));
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
			unload((function() core.unregisterProcessor(this)).bind(this));
		},

		QueryInterface: XPCOMUtils.generateQI([Ci.dhIProcessor, Ci.sehISecretHelperProcessorExtra]),

		get provider() { return "DownThemAll!"; },
		get enabled() { return true; },

		canHandle: function(desc) desc.has("media-url") || desc.has("links"),

		requireDownload: function(desc) false,
		preDownload: function(desc) false,

		handle: function(props) {
			try {
				if (props.has('links')) {
					this.handleLinks(props);
				}
				else {
					this.handleSingle(props);
				}
			}
			catch (ex) {
				log(LOG_ERROR, "failed to handle", ex);
				throw ex;
			}
		},
		getWindow: function(props) {
			return ('window' in props) ? props.window : null;
		},
		createItem: function(props) {
			let win = this.getWindow(props);
			let doc = ('document' in props) ? props.document : null;
			let url = new api.URL(Services.io.newURI(props.mediaUrl, doc ? doc.characterSet : null, null));
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
			for (let link in new utils.SimpleIterator(links, Ci.nsIProperties)) {
				let props = new utils.Properties(link, desc);
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

			let win = this.getWindow(new utils.Properties(desc));
			if (urls.length == 1) {
				api.saveSingleItem(win, this.turbo, urls[0]);
				return;
			}
			if (this.turbo) {
				api.turboSaveLinkArray(win, urls, []);
			}
			else {
				api.saveLinkArray(win, urls, []);
			}
		},
		handleSingle: function(props)	{
			props = new utils.Properties(props);
			let item = this.createItem(props);
			api.saveSingleItem(this.getWindow(props), this.turbo, item);
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
