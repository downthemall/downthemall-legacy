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
 * The Original Code is downTHEMall.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007
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
 
var Dialog = {
	load: function() {
		this.result = window.arguments[0];
		this.dd = new DTA_DropDown(
			"renaming",
			"renaming",
			"renamingitems",
			["*name*.*ext*", "*num*_*name*.*ext*", "*url*-*name*.*ext*", "*name* (*text*).*ext*", "*name* (*hh*-*mm*).*ext*"]
		);
	},
	accept: function() {
		if (this.dd.current.length) {
			this.result.value = this.dd.current;
		}
	}
};

// Renaming tags reference popup stuff
var listObserver = { 
  onDragStart: function (evt,transferData,action){
    var txt=evt.target.getAttribute("value");
    transferData.data=new TransferData();
    transferData.data.addDataForFlavour("text/unicode",txt);
  }
};
function appendTag(event) {
	var text = document.getElementById('renaming');
	var s = text.inputField.selectionStart;
	text.value = text.value.substring(0, s) + event.target.getAttribute("value") + text.value.substring(text.inputField.selectionEnd, text.value.length);
	text.inputField.setSelectionRange(s + event.target.getAttribute("value").length, s + event.target.getAttribute("value").length);
}