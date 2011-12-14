module("constants.jsm");

test("exports", function() {
	checkExports("resource://dta/constants.jsm", [
		'PAUSED',
		'RUNNING',
		'FINISHING',
		'COMPLETE',
		'CANCELED',
		'QUEUED',
		'SPEED_COUNT',
		'MIN_CHUNK_SIZE',
		'MAX_PENDING_SIZE',
		'BUFFER_SIZE',
		'REFRESH_FREQ',
		'TOOLTIP_FREQ',
	]);
});

test("powers", function() {
	var _m = importModule("resource://dta/constants.jsm");
	[
		'PAUSED',
		'RUNNING',
		'FINISHING',
		'COMPLETE',
		'CANCELED',
		'QUEUED',
	].forEach(function(e,i) equal(_m[e] >> i, 2));
});
