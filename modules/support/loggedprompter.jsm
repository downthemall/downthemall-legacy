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
 * The Original Code is DownThemAll Logged Prompter module.
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

const EXPORTED_SYMBOLS = ['LoggedPrompter'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const module = Cu.import;
const Exception = Components.Exception;

module("resource://dta/glue.jsm");

XPCOMUtils.defineLazyGetter(this, "Logger", function() {
	let _u = {};
	module("resource://dta/utils.jsm", _u);
	return _u.Logger;
});

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
	XPCOMUtils.defineLazyGetter(
		this,
		'authPrompter',
		function() {
			return Services.ww
				.getNewAuthPrompter(window)
				.QueryInterface(Ci.nsIAuthPrompt);
		}
	);

	/**
	 * Property providing nsIPrompt
	 */
	XPCOMUtils.defineLazyGetter(
		this,
		'prompter',
		function() {
			let _p = Services.ww
				.getNewPrompter(window)
				.QueryInterface(Ci.nsIPrompt);

			// Log any alerts instead of showing a dialog.
			// Everything else pass thru to the actual prompter.
			let _dp = {
				QueryInterface: XPCOMUtils.generateQI([Ci.nsIPrompt]),
				alert: function(title, text) {
					if (Logger.enabled) {
						Logger.log(text, title)
					}
				},
				alertCheck: function(title, text, cm, cv) {
					if (Logger.enabled) {
						Logger.log(text, title);
					}
				},
				confirm: function(title, text) _p.confirm(title, text),
				confirmCheck: function(title, text, cm, cv) _p.confirmCheck(title, text, cm, cv),
				confirmEx: function(title, text, bflags, bt0, bt1, bt2, cm, cv) _p.confirmEx(title, text, bflags, bt0, bt1, bt2, cm, cv),
				prompt: function(title, text, value, cm, cv) _p.prompt(title, text, value, cm, cv),
				promptPassword: function(title, text, password, cm, cv) _p.promptPassword(title, text, password, cm, cv),
				promptUsernameAndPassword: function(title, text, un, pw, cm, cv) _p.promptUsernameAndPassword(title, text, un, pw, cm, cv),
				select: function(title, text, count, list, selection) _p.select(title, text, count, list, selection)
			}
			return _dp;
		}
	);
}
