/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

/**
 * Provides nsIPrompt/nsIAuthPrompt
 * The nsIPrompt implementation will log any alerts instead of actually displaying them
 *
 * @param window Associated window (that will be the parent of any prompt dialogs)
 */
function LoggedPrompter(window) {
	/**
	 * Property providing nsIAuthPrompt
	 */
	lazy(this, "authPrompter", function() Services.ww.getNewAuthPrompter(window).QueryInterface(Ci.nsIAuthPrompt));

	/**
	 * Property providing nsIPrompt
	 */
	lazy(this,"prompter", function() {
		let _p = Services.ww
			.getNewPrompter(window)
			.QueryInterface(Ci.nsIPrompt);

		// Log any alerts instead of showing a dialog.
		// Everything else pass thru to the actual prompter.
		return Proxy.create({
			has: function(name) name in _p,
			hasOwn: function(name) name in _p,
			get: function(receiver, name) {
				if (name == "alert") {
					return function(text, title) log(LOG_INFO, "LoggedPrompter " + title + ": " + text);
				}
				else if (name == "alertCheck") {
					return function(text, title, cm, cs) log(LOG_INFO, "LoggedPrompter " + title + ": " + text);
				}
				else {
					return _p[name];
				}
			}
		});
	});
}
exports.LoggedPrompter = LoggedPrompter;
