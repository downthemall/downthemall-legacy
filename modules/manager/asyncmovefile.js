/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {
	createOptimizedImplementation,
	NullCancel
} = require("support/optimpl");

var _moveFile = createOptimizedImplementation(
	"manager/asyncmovefile/worker",
	function(impl) function _moveFile_async(aLocalFileSrc, aLocalFileDst, aPermissions, aCallback) {
		let data = Object.create(null);
		data.src = aLocalFileSrc.path;
		data.dst = aLocalFileDst.path;
		data.permissions = aPermissions;
		return impl(data, aCallback);
	},
	function _moveFile_plain(aLocalFileSrc, aLocalFileDst, aPermissions, aCallback) {
		try {
			aLocalFileSrc.clone().moveTo(aLocalFileDst.parent, aLocalFileDst.leafName);
			aCallback();
		}
		catch (ex) {
			aCallback(ex);
		}
		return NullCancel;
	});

exports.asyncMoveFile = function asyncMoveFile(aLocalFileSrc, aLocalFileDst, aPermissions, aCallback) {
	_moveFile.callImpl(aLocalFileSrc, aLocalFileDst, aPermissions, aCallback);
}
