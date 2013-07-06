/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/* global ctypes */

var moveFile = (function() {
	const MOVEFILE_REPLACE_EXISTING = 0x1;
	const MOVEFILE_COPY_ALLOWED = 0x2;
	const MOVEFILE_WRITE_THROUGH = 0x8;
	const dwFlags = MOVEFILE_REPLACE_EXISTING | MOVEFILE_COPY_ALLOWED | MOVEFILE_WRITE_THROUGH;

	const kernel32 = ctypes.open("kernel32.dll");
	const MoveFileEx = kernel32.declare(
		"MoveFileExW",
		ctypes.winapi_abi,
		ctypes.int, // BOOL retval,
		ctypes.jschar.ptr, // LPCTSTR lpExistingFileName,
		ctypes.jschar.ptr, // LPCTSTR lpNewFileName,
		ctypes.unsigned_int // DWORD dwFlags
		);

	return function moveFile_win(src, dst, perms) MoveFileEx(src, dst, dwFlags);
})();
