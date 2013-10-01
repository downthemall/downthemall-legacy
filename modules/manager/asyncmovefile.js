/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

try {
	const {OS} = requireJSM("resource://gre/modules/osfile.jsm");

	exports.asyncMoveFile = function asyncMoveFile(aLocalFileSrc, aLocalFileDst, aCallback) {
		OS.File.move(aLocalFileSrc.path, aLocalFileDst.path).then(
			function() aCallback(),
			function(ex) aCallback(ex)
		);
	};
}
catch (ex) {
	log(LOG_ERROR, "Cannot use async moveFile", ex);
	exports.asyncMoveFile = function _moveFile_plain(aLocalFileSrc, aLocalFileDst, aCallback) {
		try {
			aLocalFileSrc.clone().moveTo(aLocalFileDst.parent, aLocalFileDst.leafName);
			aCallback();
		}
		catch (ex) {
			aCallback(ex);
		}
	};
}
