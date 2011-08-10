"use strict";

var EXPORTED_SYMBOLS = [
	'PAUSED',
	'RUNNING',
	'FINISHING',
	'COMPLETE',
	'CANCELED',
	'QUEUED',
	'SPEED_COUNT',
	'MIN_CHUNK_SIZE',
	'BUFFER_SIZE',
	'REFRESH_FREQ',
	'TOOLTIP_FREQ',
];

// Download is paused
const PAUSED =    1<<1;
// Download is running
const RUNNING =   1<<2;
// Download is finishing, but not full complete
const FINISHING = 1<<3;
// Download is complete
const COMPLETE =  1<<4;
// Download was canceled
const CANCELED =  1<<5;
// Download is queued
const QUEUED =    1<<6;

// Number of speed data points to keep
const SPEED_COUNT = 100;

// Minimal size a chunk may take
const MIN_CHUNK_SIZE = 1<<18; // 256K

// Buffer size
const BUFFER_SIZE = 1<<19; // 512K

// Refresh frequency
const REFRESH_FREQ = 1000;

// Tooltip refresh frequency
const TOOLTIP_FREQ = 500;
