/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const available = ("dhICore" in Ci) && ("dhIProcessor" in Ci);
if (available) {
	/* global api, getUsableFileNameWithFlatten, utils, bundle, isWindowPrivate */
	lazy(this, "api", function() require("api"));
	lazy(this, "getUsableFileNameWithFlatten", function() require("support/stringfuncs").getUsableFileNameWithFlatten);
	lazy(this, "utils", function() require("utils"));
	lazy(this, "bundle",
		function() new (require("utils").StringBundles)(["chrome://dta/locale/downloadHelper.properties"]));
	lazy(this, "isWindowPrivate", function() require("support/pbm").isWindowPrivate);

	const core = Cc["@downloadhelper.net/core;1"].getService(Ci.dhICore);

	let ProcessorImpl = function(turbo, name, title, description) {
		this.init(name, title, description);
		this.turbo = !!turbo;
	};
	ProcessorImpl.prototype = {
		init: function(name, title, description) {
			this.__defineGetter__("name", function() name);
			this.__defineGetter__("title", function() title);
			this.__defineGetter__("description", function() description);
			core.registerProcessor(this);
			unload((function() core.unregisterProcessor(this)).bind(this));
		},

		QueryInterface: QI([Ci.dhIProcessor, Ci.sehISecretHelperProcessorExtra]),

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
			let doc = ('document' in props) ? props.document : null;
			let win = this.getWindow(props) || (doc ? doc.defaultView : null);
			let url = new api.URL(Services.io.newURI(props.mediaUrl, doc ? doc.characterSet : null, null));
			let item = {
				url: url,
				isPrivate: win ? isWindowPrivate(win) : false,
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
				item.fileName = item.destinationName =
					getUsableFileNameWithFlatten(item.description + "." + props.fileExtension);
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
			api.setPrivateMode(win, urls);
			if (urls.length === 1) {
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

	processors.push(new ProcessorImpl(
		false, "dta-regular",
		bundle.getString('dta-regular'), bundle.getString('dta-regular-desc')
		));
	processors.push(new ProcessorImpl(
		true, "dta-turbo",
		bundle.getString('dta-turbo'), bundle.getString('dta-turbo-desc')
		));
}
