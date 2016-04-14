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
 * The Original Code is DownThemAll text links module.
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

var EXPORTED_SYMBOLS = ["getTextLinks", "FakeLink"];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;
var Exception = Components.Exception;

// Link matcher
var regLinks = /\b(?:(?:h(?:x+|tt)?ps?|ftp):\/\/|www\d?\.)[\d\w.-]+\.\w+\.?(?:\/[\d\w+&@#\/%?=~_|!:,.;\(\)-]*)?/ig;
// Match more exactly or more than 3 dots. Links are then assumed "cropped" and will be ignored. 
var regShortened = /\.{3,}/;
// http cleanup
var regHttp = /^h(?:x+|tt)?p(s?)/i;
// ftp cleanup
var regFtp = /^f(?:x|t)p/i;
// www (sans protocol) match
var regWWW = /^www/i;
// Right-trim (sanitize) link
var regDTrim = /[<>._#-]+$/;

/**
 * Parses a text looking for any URLs with supported protocols
 * 
 * @param text (string) Text to parse
 * @param fakeLinks (boolean) Whether an array of plain text links will be returned or an array of FakeLinks 
 * @return (array) results 
 */
function getTextLinks(text, fakeLinks) {
	return Array.map( 
		text.match(regLinks),
		function(e) {
			try {
				if (regShortened.test(e)) {
					return null;
				}
				if (regWWW.test(e)) {
					e = "http://" + e;
				}
				e = e.replace(regHttp, "http$1")
					.replace(regFtp, "ftp")
					.replace(regDTrim, "");
				return fakeLinks ? new FakeLink(e) : e.toString();
			}
			catch (ex) {
				return null;
			}
		},
		this
	).filter(function(e) !!e);
}

/**
 * Minimal Link representation (partially) implementing DOMElement
 * 
 * @param url (string) URL (href) of the Links 
 * @param title (string) Optional. Title/description
 * @see DOMElement
 */
function FakeLink(url, title) {
	this.src = this.href = url;
	if (!!title) {
		this.title = title;
	}
}
FakeLink.prototype = {
	childNodes: [],
	hasAttribute: function(attr) (attr in this),
	getAttribute: function(attr) (attr in this) ? this[attr] : null,
	toString: function() this.href
};