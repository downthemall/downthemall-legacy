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
		let _p = Services.ww.getNewAuthPrompter(window).
			QueryInterface(Ci.nsIAuthPrompt).
			QueryInterface(Ci.nsIAuthPrompt2);
		let restricted = new Map();
		let bind = key => _p[key].bind(_p);
		return {
			QueryInterface: function(iid) {
				_p.QueryInterface(iid);
				return this;
			},
			prompt: bind("prompt"),
			promptUsernameAndPassword: bind("promptUsernameAndPassword"),
			promptPassword: bind("promptPassword"),
			promptAuth: bind("promptAuth"),
			asyncAuthPrompt: function(channel, callback, context, level, info) {
				const key = uriToKey(channel.URI);
				if (restricted.has(key)) {
					log(LOG_DEBUG, "Restricted " + key);
					callback.onAuthCancelled(context, true);
					return {
						cancel: function() {}
					};
				}
				log(LOG_DEBUG, "Not restricted " + key);
				return _p.asyncPromptAuth(channel, callback, context, level, info);
			},
			restrictLogin: function(uri) {
				const key = uriToKey(uri);
				restricted.set(key, true);
			},
			allowLogin: function(uri) {
				const key = uriToKey(uri);
				log(LOG_DEBUG, "Lifting restriction " + key);
				restricted.delete(key, true);
			}
		};
	});

	/**
	 * Property providing nsIPrompt
	 */
	lazy(this,"prompter", function() {
		let _p = Services.ww
			.getNewPrompter(window)
			.QueryInterface(Ci.nsIPrompt);
		let bind = key => _p[key].bind(_p);

		return {
			QueryInterface: function(iid) {
				_p.QueryInterface(iid);
				return this;
			},
			alert: function(text, title) {
				log(LOG_INFO, "LoggedPrompter " + title + ": " + text);
			},
			alertCheck: function(text, title, cm, cs) {
				log(LOG_INFO, "LoggedPrompter " + title + ": " + text);
			},
			confirm: bind("confirm"),
			confirmCheck: bind("confirmCheck"),
			confirmEx: bind("confirmEx"),
			prompt: bind("prompt"),
			promptPassword: bind("promptPassword"),
			promptUsernameAndPassword: bind("promptUsernameAndPassword"),
			select: bind("select")
		};
	});
}
exports.LoggedPrompter = LoggedPrompter;
