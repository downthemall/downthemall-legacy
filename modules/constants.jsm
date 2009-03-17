var EXPORTED_SYMBOLS = ['PAUSED', 'RUNNING', 'FINISHING', 'COMPLETE', 'CANCELED', 'QUEUED'];

const PAUSED =    1<<1;
const RUNNING =   1<<2;
const FINISHING = 1<<3;
const COMPLETE =  1<<4;
const CANCELED =  1<<5;
const QUEUED =    1<<6;