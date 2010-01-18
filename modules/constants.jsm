var EXPORTED_SYMBOLS = [
	'PAUSED',
	'RUNNING',
	'FINISHING',
	'COMPLETE',
	'CANCELED',
	'QUEUED'
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