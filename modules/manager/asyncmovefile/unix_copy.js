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
 * The Original Code is DownThemAll asyncmovefile ChromeWorker Worker_Unix_copy module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2012
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

var moveFile = (function() {
	var libc = null;
	for each (let p in ["libc.so.6", "libc.so"]) {
		try {
			libc = ctypes.open(p);
			break;
		}
		catch (ex) {}
	}
	if (!libc) {
		throw new Error("no libc");
	}
	
	const rename = libc.declare(
		"rename",
		ctypes.default_abi,
		ctypes.int, // retval
		ctypes.char.ptr, // old
		ctypes.char.ptr // new
		
		);
	
	const unlink = libc.declare(
		"unlink",
		ctypes.default_abi,
		ctypes.int, // retval
		ctypes.char.ptr // path
		);
	
	const open = libc.declare(
		"open",
		ctypes.default_abi,
		ctypes.int, // retval
		ctypes.char.ptr, // path
		ctypes.int, // flags
		ctypes.uint32_t // mode_t mode
		);
	
	const closeFd = libc.declare(
		"close",
		ctypes.default_abi,
		ctypes.int, // retval
		ctypes.int // fd
		);
	
	const read = libc.declare(
		"read",
		ctypes.default_abi,
		ctypes.ssize_t, // retval
		ctypes.int, // fd
		ctypes.voidptr_t, // buf
		ctypes.size_t // count
		);
	
	const write = libc.declare(
		"write",
		ctypes.default_abi,
		ctypes.ssize_t, // retval
		ctypes.int, // fd
		ctypes.voidptr_t, // buf
		ctypes.size_t // count
		);
	
	
	const BUFSIZE = 1<<16;
	const BUFFER = new ctypes.ArrayType(ctypes.char, BUFSIZE)();
	
	return function moveFile_unix_copy(src, dst, perms) {
		if (rename(src, dst) == 0) {
			return true;
		}
		
		// rename did not work; copy! :p
		let rv = false;
		let fds = open(src, 0x0, perms);
		if (fds == -1) {
			throw new Error("Failed to open source file: " + src);
		}
		try {
			let fdd = open(dst, 0x1 | 0x40 | 0x200, perms);
			if (fdd == -1) {
				throw new Error("Failed to open destination file: " + dst);
			}
			try {
				for (;;) {
					let size = read(fds, BUFFER, BUFSIZE);
					if (size == -1) {
						throw new Error("Failed to read some data");
					}
					else if (size == 0) {
						break; // done
					}
					let written = write(fdd, BUFFER, size);
					if (written - size != 0) {
						throw new Error("Failed to write some data: " + written + "/" + size);
					} 
				}
				rv = true;
			}
			finally {
				closeFd(fdd);
				if (!rv) {
					unlink(dst);
				}
			}
		}
		finally {
			closeFd(fds);
		}
		if (rv) {
			unlink(src);
		}
		return rv;
	}
})();