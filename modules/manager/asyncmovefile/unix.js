/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/* jshint eqeqeq:false */
/* global ctypes, importScripts, OS, getPosix */

if (!("OS" in this)) {
	throw new Error("OS constants not yet available");
}
var moveFile = (function() {
	importScripts("../worker_posix.js");
	const {
		rename,
		unlink,
		openFd,
		closeFd,
		read,
		write,
		pipe_t,
		pipe,
		splice
	} = getPosix();

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
			try {
				for(let alreadyWritten = false;; alreadyWritten = true) {
					let size = splice(fds, null, pwrite, null, BUFSIZE, 0);
					if (size == -1) {
						throw (alreadyWritten ? ERROR_READ : ERROR_SPLICE);
					}
					else if (size == 0) {
						break;
					}
					let written = splice(pread, null, fdd, null, size, !(size - BUFSIZE) ? 0 : SPLICE_F_MORE);
					if ((written - size) != 0) {
						throw (alreadyWritten ? ERROR_WRITE : ERROR_SPLICE);
					}
				}
			}
			finally {
				closeFd(pread);
				closeFd(pwrite);
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
				if ((written - size) != 0) {
					throw ERROR_WRITE;
				}
			}
		}

		function copy(impl) {
			let fds = openFd(src, O_RDONLY, perms);
			if (fds == -1) {
				throw new Error("Failed to open source file: " + src);
			}
			try {
				let fdd = openFd(dst, O_WRONLY | O_CREAT | O_TRUNC, perms);
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

		if (!rename(src, dst)) {
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
			catch (e) {
				log(e);
			}
		}
		catch (ex) {
			log(ex);
		}
		if (rv) {
			unlink(src);
		}
		return rv;
	};
})();
