/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/* global ctypes */

function getLibc() {
	for (let p of ["libSystem.dylib", "libsystem.B.dylib", "libc.so.6", "libc.so"]) {
		try {
			return ctypes.open(p);
		}
		catch (ex) {}
	}
	throw new Error("no libc");
}

function getPosix() {
	let libc = getLibc();
	let rv = {};
	rv.rename = libc.declare(
		"rename",
		ctypes.default_abi,
		ctypes.int, // retval
		ctypes.char.ptr, // old
		ctypes.char.ptr // new
		);

	rv.unlink = libc.declare(
		"unlink",
		ctypes.default_abi,
		ctypes.int, // retval
		ctypes.char.ptr // path
		);

	rv.openFd = libc.declare(
		"open",
		ctypes.default_abi,
		ctypes.int, // retval
		ctypes.char.ptr, // path
		ctypes.int, // flags
		ctypes.uint32_t // mode_t mode
		);

	rv.closeFd = libc.declare(
		"close",
		ctypes.default_abi,
		ctypes.int, // retval
		ctypes.int // fd
		);

	rv.read = libc.declare(
		"read",
		ctypes.default_abi,
		ctypes.ssize_t, // retval
		ctypes.int, // fd
		ctypes.voidptr_t, // buf
		ctypes.size_t // count
		);

	rv.write = libc.declare(
		"write",
		ctypes.default_abi,
		ctypes.ssize_t, // retval
		ctypes.int, // fd
		ctypes.voidptr_t, // buf
		ctypes.size_t // count
		);

	rv.pipe_t = ctypes.ArrayType(ctypes.int, 2);
	rv.pipe = libc.declare(
		"pipe",
		ctypes.default_abi,
		ctypes.int, // retval
		rv.pipe_t // pipefd
		);

	rv.splice = (function() {
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

	rv.ftruncate = (function() {
		try {
			return libc.declare(
				"ftruncate64",
				ctypes.default_abi,
				ctypes.int, // retval
				ctypes.int, // fd
				ctypes.int64_t // off64_t off
				);
		}
		catch (ex) {
			return libc.declare(
				"ftruncate",
				ctypes.default_abi,
				ctypes.int, // retval
				ctypes.int, // fd
				ctypes.off_t // off_t off
				);
		}
	})();

	rv.lseek = (function() {
		try {
			return libc.declare(
				"lseek64",
				ctypes.default_abi,
				ctypes.int64_t, // retval
				ctypes.int, // fd
				ctypes.int64_t, // off64_t off
				ctypes.int // whence
				);
		}
		catch (ex) {
			return libc.declare(
				"lseek",
				ctypes.default_abi,
				ctypes.off_t, // retval
				ctypes.int, // fd
				ctypes.off_t, // off_t off
				ctypes.int // whence
				);
		}
	})();

	return rv;
}
