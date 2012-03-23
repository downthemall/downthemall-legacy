"use strict";

var libc = ctypes.open("libSystem.dylib");
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

function moveFile(src, dst, perms) {
//	throw new Error("[" + src + "] : [" + dst + "] : [" + perms + "]");
	if (rename(src, dst) == 0) {
		return true;
	}
	
	// rename did not work; copy! :p
	let rv = false;
	let fds = open(src, 0x0, perms);
	if (fds == -1) {
		return rv;
	}
	try {
		let fdd = open(dst, 0x1 | 0x200 | 0x400, perms);
		if (fdd == -1) {
			throw new Error("Failed to open destination file: " + file)
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