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
 * The Original Code is DownThemAll asyncmovefile ChromeWorker Worker_Win32 module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2011
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
"use strict";

const MOVEFILE_REPLACE_EXISTING = 0x1;
const MOVEFILE_COPY_ALLOWED = 0x2;
const MOVEFILE_WRITE_THROUGH = 0x8;
const dwFlags = MOVEFILE_REPLACE_EXISTING | MOVEFILE_COPY_ALLOWED | MOVEFILE_WRITE_THROUGH;

var kernel32 = null;
var MoveFileEx = null;

onmessage = function(event) {
	let data = event.data;
	if (data == "close") {
		close();
		return;
	}

	try {
		data.result = MoveFileEx(data.src, data.dst, dwFlags);
	}
	catch (ex) {
		data.result = false;
	}
	postMessage(data);
}

try {
	kernel32 = ctypes.open("kernel32.dll");
	MoveFileEx = kernel32.declare(
		"MoveFileExW",
		ctypes.winapi_abi,
		ctypes.int, // BOOL retval,
		ctypes.jschar.ptr, // LPCTSTR lpExistingFileName,
		ctypes.jschar.ptr, // LPCTSTR lpNewFileName,
		ctypes.unsigned_int // DWORD dwFlags
		);
	postMessage(false);
}
catch (ex) {
	postMessage(ex);
	//close();
}
