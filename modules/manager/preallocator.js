/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/ */
"use strict";

const {
	createOptimizedImplementation
} = require("support/optimpl");

const {prealloc: _asynccopier} = require("./preallocator/asynccopier");
const {prealloc: _cothread} = require("./preallocator/cothread");

const SIZE_MIN = (require("version").OS === 'winnt' ? 256 : 2048) * 1024;
const SIZE_COTHREAD_MAX = (1<<24);

const _impl = createOptimizedImplementation(
	"manager/preallocator/worker",
	function(impl) function (file, size, perms, sparseOK, callback) {
		let data = Object.create(null);
		data.file = file.path;
		data.size = size;
		data.perms = perms;
		data.sparseOK = sparseOK;
		return impl(data, callback);
	},
	function(file, size, perms, sparseOK, callback) {
		if (size < SIZE_COTHREAD_MAX) {
			return _cothread(file, size, perms, sparseOK, callback);
		}
		return _asynccopier(file, size, perms, sparseOK, callback);
	});

/**
 * Pre-allocates a given file on disk
 * and calls given callback when done
 *
 * @param file (nsIFile) file to allocate
 * @param size (int) Size to allocate
 * @param perms (int) *nix file permissions
 * @param callback (function) Callback called once done
 * @param tp (function) Scope (this) to call the callback function in
 * @return (nsICancelable) Pre-allocation object.
 */
exports.prealloc = function prealloc(file, size, perms, sparseOk) {
	if (size <= SIZE_MIN || !isFinite(size)) {
		log(LOG_INFO, "pa: not preallocating: " + file);
		return null;
	}
	log(LOG_INFO, "pa: preallocating: " + file + " size: " + size);
	return new Promise(function(resolve, reject) {
		_impl.callImpl(file, size, perms, sparseOk, r => resolve(r));
	});
};
