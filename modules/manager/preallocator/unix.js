/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

if (!("OS" in this)) {
	throw new Error("OS constants not yet available");
}

var prealloc = (function() {
	importScripts("../worker_posix.js");
	const {
		openFd,
		closeFd,
		write,
		ftruncate,
		lseek,
	} = getPosix();

	const {
		O_WRONLY,
		O_CREAT,
		SEEK_CUR,
		SEEK_END
	} = OS.Constants.libc;

	return function prealloc_linux(file, size, perms, sparseOk) {
		var rv = false;
		try {
			let fd = openFd(
				file,
				O_WRONLY | O_CREAT,
				perms
				);
			if (fd == -1) {
				throw new Error("Failed to open file");
			}
			try {
				ftruncate(fd, ctypes.Int64(size));
				if (sparseOk) {
					log("allocating sparse");
				}
				else {
					--size;
					for(;;) {
						// Get end of the file
						let current = lseek(fd, ctypes.Int64(0), SEEK_END);

						// See if we still need to preallocate
						let remainder = size - current;
						if (remainder <= 0) {
							break;
						}

						// Calculate next seek
						let seek = Math.min(remainder, 4096); // estimate: usually 4K on newer *nix now
						lseek(fd, ctypes.Int64(seek), SEEK_CUR);
						if (write(fd, "a", 1) != 1) {
							throw new Error("Failed to write byte");
						}
					}
				}

				// all good
				rv = true;
			}
			finally {
				closeFd(fd);
			}
		}
		catch (ex) {
			log(ex)
		}
		return rv;
	};
})();
