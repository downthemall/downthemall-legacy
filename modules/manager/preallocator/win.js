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
 * The Original Code is DownThemAll preallocation ChromeWorker Worker_Win32 module.
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

var prealloc = (function() {
	const kernel32 = ctypes.open("kernel32.dll");
	const CreateFile = kernel32.declare(
		"CreateFileW",
		ctypes.winapi_abi,
		ctypes.intptr_t, // HANDLE retval,
		ctypes.jschar.ptr, // LPCTSTR lpFileName,
		ctypes.unsigned_int, // DWORD dwDesiredAccess,
		ctypes.unsigned_int, // DWORD dwShareMode,
		ctypes.voidptr_t, // LPSECURITY_ATTRIBUTES lpSecurityAttributes,
		ctypes.unsigned_int, // DWORD dwCreationDisposition,
		ctypes.unsigned_int, // DWORD dwFlagsAndAttributes,
		ctypes.voidptr_t // HANDLE hTemplate
		);
	const CloseHandle = kernel32.declare(
		"CloseHandle",
		ctypes.winapi_abi,
		ctypes.int, // BOOL retval
		ctypes.intptr_t // HANDLE
		);
	const LARGE_INTEGER = new ctypes.StructType(
		"LARGE_INTEGER",
		[{"LowPart": ctypes.unsigned_int}, {"HighPart": ctypes.int}]
		);
	const SetFilePointerEx = kernel32.declare(
		"SetFilePointerEx",
		ctypes.winapi_abi,
		ctypes.int, // BOOL retval
		ctypes.intptr_t, // HANDLE hFile
		LARGE_INTEGER, // LARGE_INTEGER liDistanceToMove,
		ctypes.voidptr_t, // PLARGE_INTEGER lpNewFilePointer,
		ctypes.unsigned_int // DWORD dwMoveMethod
		);
	const SetEndOfFile = kernel32.declare(
		"SetEndOfFile",
		ctypes.winapi_abi,
		ctypes.int, // BOOL retval
		ctypes.intptr_t // HANDLE hFile
		);
	const DeviceIoControl = kernel32.declare(
		"DeviceIoControl",
		ctypes.winapi_abi,
		ctypes.int, // BOOL retval
		ctypes.intptr_t, // HANDLE hDevice,
		ctypes.unsigned_int, // DWORD dwIoControlCode,
		ctypes.voidptr_t, // LPVOID lpInBuffer,
		ctypes.unsigned_int, // DWORD nInBufferSize,
		ctypes.voidptr_t, // LPVOID lpOutBuffer,
		ctypes.unsigned_int, // DWORD nOutBufferSize,
		ctypes.unsigned_int.ptr, // LPDWORD lpBytesReturned,
		ctypes.voidptr_t // LPOVERLAPPED lpOverlapped
	);
	
	return function prealloc_win(file, size, perms, sparseOk) {
		var rv = false;
		try {
			let hFile = CreateFile(
				file,
				0x40000000, // GENERIC_WRITE
				0x1 | 0x2, // FILE_SHARE_READ | FILE_SHARE_WRITE
				null,
				0x4, // OPEN_ALWAYS
				0x80 | 0x08000000, // FILE_ATTRIBUTE_NORMAL | FILE_FLAG_SEQUENTIAL_SCAN
				null
				);
			if (!hFile || hFile == -1) {
				throw new Error("Failed to open file");
			}
			try {
				if (sparseOk) {
					log("allocating sparse");
					let returned = ctypes.unsigned_int(0);
					DeviceIoControl(
						hFile,
						0x900c4, // FSCTL_SET_SPARSE
						null,
						0,
						null,
						0,
						returned.address(),
						null
						);
				}
	
				for (;;) {
					let liSize = new LARGE_INTEGER;
					let liCurrent = new LARGE_INTEGER;
	
					// Get end of the file
					SetFilePointerEx(hFile, liSize, liCurrent.address(), 0x2);
	
					// See if we still need to preallocate
					let remainder = size - ctypes.Int64.join(liCurrent.HighPart, liCurrent.LowPart);
					if (remainder <= 0) {
						break;
					}
	
					// Calculate next seek
					let seek = Math.min(remainder, (1<<22));
	
					// Seek
					let i64Size = ctypes.Int64(seek);
					liSize.LowPart = ctypes.Int64.lo(i64Size);
					liSize.HighPart = ctypes.Int64.hi(i64Size);
					SetFilePointerEx(hFile, liSize, null, 0x1);
	
					// EOF
					SetEndOfFile(hFile);
				}
	
				// all good
				rv = true;
			}
			finally {
				CloseHandle(hFile);
			}
		}
		catch (ex) {
			log(ex)
		}
		return rv;
	};
})();