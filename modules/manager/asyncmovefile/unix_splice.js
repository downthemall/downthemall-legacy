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
 * The Original Code is DownThemAll asyncmovefile ChromeWorker Worker_Unix_splice module.
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

/* splice()ing is basically low-level sendfile() where the pipe acts as
 * the copy buffer.
 * This ways, there is no need for additional user-land buffers and it
 * also avoids passing the actual data between the kernel and the user land,
 * which might result in a massive performance improvement.
 */ 

var moveFile = (function() {
	const BUFSIZE = 1<<17;
	const SPLICE_F_MORE = 4;
	
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
	
	const pipe_t = ctypes.ArrayType(ctypes.int, 2);
	const pipe = libc.declare(
		"pipe",
		ctypes.default_abi,
		ctypes.int, // retval
		pipe_t // pipefd
		);
	
	const splice = libc.declare(
		"splice",
		ctypes.default_abi,
		ctypes.ssize_t, // retval
		ctypes.int, // fd_in
		ctypes.voidptr_t, // off_in,
		ctypes.int, // fd_out
		ctypes.voidptr_t, // off_out,
		ctypes.size_t, // len,
		ctypes.unsigned_int // flags
		);
	
	return function moveFile_unix_splice(src, dst, perms) {
		if (rename(src, dst) == 0) {
			return true;
		}
		
		// rename did not work; copy! :p
		let rv = false;
	
		let pfd = new pipe_t();
		if (pipe(pfd) == -1) {
			throw new Error("Failed to create pipe");
		}
		let [pread, pwrite] = pfd;
		
		try {
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
					for(;;) {
						let size = splice(fds, null, pwrite, null, BUFSIZE, 0);
						if (size == -1) {
							throw new Error("Failed to fill pipe");
						}
						else if (size == 0) {
							break;
						}
						let written = splice(pread, null, fdd, null, size, (size - BUFSIZE == 0) ? 0 : SPLICE_F_MORE);
						if (written - size != 0) {
							throw new Error("Failed to drain pipe");
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
		}
		finally {
			closeFd(pread);
			closeFd(pwrite);
		}
		if (rv) {
			unlink(src);
		}
		return rv;
	}
})();