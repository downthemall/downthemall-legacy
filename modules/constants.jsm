var EXPORTED_SYMBOLS = [
	'PAUSED',
	'RUNNING',
	'FINISHING',
	'COMPLETE',
	'CANCELED',
	'QUEUED',
	'SPEED_COUNT',
	'MIN_CHUNK_SIZE',
	'REFRESH_FREQ',
	'TOOLTIP_FREQ',
];

// Download is paused
var PAUSED =    1<<1;
// Download is running
var RUNNING =   1<<2;
// Download is finishing, but not full complete
var FINISHING = 1<<3;
// Download is complete
var COMPLETE =  1<<4;
// Download was canceled
var CANCELED =  1<<5;
// Download is queued
var QUEUED =    1<<6;

// Number of speed data points to keep
var SPEED_COUNT = 100;

// Minimal size a chunk may take
var MIN_CHUNK_SIZE = 1<<19; // 512K

// Refresh frequency
var REFRESH_FREQ = 1000;

// Tooltip refresh frequency
var TOOLTIP_FREQ = 500;