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

if (!("OS" in this)) {
	throw new Error("OS constants not yet available");
}
var moveFile = (function() {
	var libc = null;
	for each (let p in ["libSystem.dylib", "libsystem.B.dylib", "libc.so.6", "libc.so"]) {
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

	const pipe_t = ctypes.ArrayType(ctypes.int, 2);
	const pipe = libc.declare(
		"pipe",
		ctypes.default_abi,
		ctypes.int, // retval
		pipe_t // pipefd
		);

	const splice = (function() {
		try {
			return libc.declare(
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
		}
		catch (ex) {
			return null;
		}
	})();

	const BUFSIZE = 1<<17;
	const BUFFER = new ctypes.ArrayType(ctypes.char, BUFSIZE)();
	const SPLICE_F_MORE = 4;

	const ERROR_SPLICE = new Error("Failed to splice");
	const ERROR_READ = new Error("Failed to read");
	const ERROR_WRITE = new Error("Failed to write");

	const {
		O_RDONLY,
		O_WRONLY,
		O_CREAT,
		O_TRUNC
	} = OS.Constants.libc;

	return function moveFile_unix(src, dst, perms) {
		function move_splice(fds, fdd) {
			let pfd = new pipe_t();
			if (pipe(pfd) == -1) {
				throw new Error("Failed to create pipe");
			}
			let [pread, pwrite] = pfd;
			for(let alreadyWritten = false;; alreadyWritten = true) {
				let size = splice(fds, null, pwrite, null, BUFSIZE, 0);
				if (size == -1) {
					throw (alreadyWritten ? ERROR_READ : ERROR_SPLICE);
				}
				else if (size == 0) {
					break;
				}
				let written = splice(pread, null, fdd, null, size, (size - BUFSIZE == 0) ? 0 : SPLICE_F_MORE);
				if (written - size != 0) {
					throw (alreadyWritten ? ERROR_WRITE : ERROR_SPLICE);
				}
			}
		}
		function move_copy(fds, fdd) {
			for (;;) {
				let size = read(fds, BUFFER, BUFSIZE);
				if (size == -1) {
					throw ERROR_READ;
				}
				else if (size == 0) {
					break; // done
				}
				let written = write(fdd, BUFFER, size);
				if (written - size != 0) {
					throw ERROR_WRITE;
				}
			}
		}

		function copy(impl) {
			let fds = open(src, O_RDONLY, perms);
			if (fds == -1) {
				throw new Error("Failed to open source file: " + src);
			}
			try {
				let fdd = open(dst, O_WRONLY | O_CREAT | O_TRUNC, perms);
				if (fdd == -1) {
					throw new Error("Failed to open destination file: " + dst);
				}
				try {
					impl(fds, fdd);
				}
				catch (ex) {
					unlink(dst);
					throw ex;
				}
				finally {
					closeFd(fdd);
				}
			}
			finally {
				closeFd(fds);
			}
		}

		if (rename(src, dst) == 0) {
			log("moved " + src + " to " + dst + " using rename");
			return true;
		}

		let rv = false;
		try {
			if (!splice) {
				throw ERROR_SPLICE;
			}
			copy(move_splice);
			log("moved " + src + " to " + dst + " using splice");
			rv = true;
		}
		catch (ex if ex === ERROR_SPLICE) {
			try {
				copy(move_copy);
				log("moved " + src + " to " + dst + " using copy");
				rv = true;
			}
			catch (ex) {
				log(ex);
			}
		}
		catch (ex) {
			log(ex);
		}
		if (rv) {
			unlink(src);
		}
		return rv;
	}
})();
