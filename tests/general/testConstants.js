"use strict";
/* globals module, test, equal, checkExports */
module("constants.js");

test("exports", function() {
	checkExports("constants", [
		'PAUSED',
		'RUNNING',
		'FINISHING',
		'COMPLETE',
		'CANCELED',
		'QUEUED',
		'SPEED_COUNT',
		'MIN_CHUNK_SIZE',
		'PIPE_SEGMENT_SIZE',
		'MAX_PIPE_SEGMENTS',
		'BUFFER_SIZE',
		'REFRESH_FREQ',
		'TOOLTIP_FREQ',
	]);
});

test("powers", function() {
	var _m = require("constants");
	[
		'PAUSED',
		'RUNNING',
		'FINISHING',
		'COMPLETE',
		'CANCELED',
		'QUEUED',
	].forEach((e,i) => equal(_m[e] >> i, 2));
});
