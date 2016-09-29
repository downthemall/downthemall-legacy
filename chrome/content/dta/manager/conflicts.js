/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/* jshint browser:true, globalstrict:true, strict:false */
/* global _, $ */

function load() {
	var w = window.arguments[0];

	$("s1").label = _('rename2.label', ['"' + w.newDest + '"']);
	$("text").appendChild(document.createTextNode(_('text2.label', ['"' + w.fn + '"'])));
	$("question").appendChild(document.createTextNode(_('question2.label', ['"' + w.url + '"'])));

	window.sizeToContent();
}
function accept() {
	try {
		window.arguments[1].resolve([$('choice').selectedIndex, $('context').selectedIndex]);
		return true;
	}
	catch (ex) {
		log(LOG_ERROR, "accept() : ", ex);
	}
	return false;
}
opener.addEventListener("unload", function unloadOpener() {
	opener.removeEventListener("unload", unloadOpener, false);
}, false);
