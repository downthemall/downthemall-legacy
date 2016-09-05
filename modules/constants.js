"use strict";

Object.defineProperties(exports, {
	PAUSED: {value: 1<<1, enumerable: true},
	RUNNING: {value: 1<<2, enumerable: true},
	FINISHING: {value: 1<<3, enumerable: true},
	COMPLETE: {value: 1<<4, enumerable: true},
	CANCELED: {value: 1<<5, enumerable: true},
	QUEUED: {value: 1<<6, enumerable: true},
	SPEED_COUNT: {value: 100, enumerable: true},
	MIN_CHUNK_SIZE: {value: 1<<19, enumerable: true},
	MAX_PENDING_SIZE: {value: 1<<28, enumerable: true},
	BUFFER_SIZE: {value: 1<<19, enumerable: true},
	REFRESH_FREQ: {value: 1000, enumerable: true},
	TOOLTIP_FREQ: {value: 500, enumerable: true},
});
