/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/* global Proxy */

/**
 * Provides nsIPrompt/nsIAuthPrompt
 * The nsIPrompt implementation will log any alerts instead of actually displaying them
 *
 * @param window Associated window (that will be the parent of any prompt dialogs)
 */
function LoggedPrompter(window) {
	function uriToKey(uri) {
		return JSON.stringify([uri.scheme, uri.host]);
	}

	/**
	 * Property providing nsIAuthPrompt
	 */
	lazy(this, "authPrompter", function() {
		let _p = Services.ww.getNewAuthPrompter(window).QueryInterface(Ci.nsIAuthPrompt);
		let restricted = new Map();
		let proxy = Proxy.create({
			has: function(name) name in _p,
			hasOwn: function(name) name in _p,
			get: function(receiver, name) {
				log(LOG_DEBUG, "called: " + name);
				if (name === "QueryInterface") {
					return function(iid) {
						_p.QueryInterface(iid);
						return proxy;
					};
				}
				if (name === "restrictLogin") {
					return function(uri) {
						const key = uriToKey(uri);
						restricted.set(key, true);
					};
				}
				if (name === "allowLogin") {
					return function(uri) {
						const key = uriToKey(uri);
						log(LOG_DEBUG, "Lifting restriction " + key);
						restricted.delete(key, true);
					};
				}
				if (name === "asyncPromptAuth") {
					return function(channel, cb, ctx, level, info) {
						const key = uriToKey(channel.URI);
						if (restricted.has(key)) {
							log(LOG_DEBUG, "Restricted " + key);
							cb.onAuthCancelled(ctx, true);
							return {
								cancel: function() {}
							};
						}
						log(LOG_DEBUG, "Not restricted " + key);
						return _p.asyncPromptAuth(channel, cb, ctx, level, info);
					};
				}
				return _p[name];
			}
		});
		return proxy;
	});

	/**
	 * Property providing nsIPrompt
	 */
	lazy(this,"prompter", function() {
		let _p = Services.ww
			.getNewPrompter(window)
			.QueryInterface(Ci.nsIPrompt);

		// Log any alerts instead of showing a dialog.
		// Everything else pass thru to the actual prompter.
		let proxy = Proxy.create({
			has: function(name) name in _p,
			hasOwn: function(name) name in _p,
			get: function(receiver, name) {
				if (name === "QueryInterface") {
					return function(iid) {
						_p.QueryInterface(iid);
						return proxy;
					};
				}
				if (name === "alert") {
					return function(text, title) log(LOG_INFO, "LoggedPrompter " + title + ": " + text);
				}
				if (name === "alertCheck") {
					return function(text, title, cm, cs) log(LOG_INFO, "LoggedPrompter " + title + ": " + text);
				}
				return _p[name];
			}
		});
		return proxy;
	});
}
exports.LoggedPrompter = LoggedPrompter;
