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
 * The Original Code is DownThemAll!
 *
 * The Initial Developers of the Original Code is Nils Maier
 * Portions created by the Initial Developers are Copyright (C) 2007
 * the Initial Developers. All Rights Reserved.
 *
 * Contributor(s):
 *    Nils Maier <MaierMan@web.de>
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
 var FileHandling = {
 	get _uniqueList() {
 		let u = {};
 		for (d in Tree.selected) {
 			if (d.is(COMPLETE)) {
 				let f = d.destinationFile;
 				if (SYSTEMSLASH == "\\") {
 					f = f.toLowerCase();	
 				}
 				if (!(f in u)) {
 					u[f] = null;
 					yield d;
 				}
 			}
 		}
 	},
	openFolder: function() {
		for (d in this._uniqueList) {
			try {
				OpenExternal.reveal(d.destinationFile);
			} catch (ex) {
				Debug.dump('reveal', ex);
			}
		}
	},
	openFile: function() {
		var cur = Tree.current;
		if (cur && cur.is(COMPLETE)) {
			try {
				OpenExternal.launch(cur.destinationFile);
			}
			catch (ex) {
				Debug.dump('launch', ex);
			}
		}
	},
	deleteFile: function() {
		var list = [];
		
		for (d in this._uniqueList) {
			var file = new FileFactory(d.destinationFile);
			if (file.exists()) {
				list.push(d);
			}
		}
		if (!list.length) {
			return;
		}
		var msg = '';
		if (list.length < 25) {
			msg = _('deletetexts');
			list.forEach(
				function(d) {
					msg += "\n" + (new FileFactory(d.destinationFile)).leafName;
				}
			);				
		}
		else {
			msg = _('deletetextl', [list.length]);
		}
		if (!DTA_confirm(_('deletetitle'), msg, _('delete'), DTA_confirm.CANCEL, null, 1)) {
			list.forEach(
				function(d) {
					try {
						var file = new FileFactory(d.destinationFile);
						if (file.exists()) {
							file.remove(false);
						}
					}
					catch (ex) {
						// no-op
					}
				}
			);
		}
		Tree.remove();
	}
};