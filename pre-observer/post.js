'use strict';
const { sayer, reportHandOff } = require('./common');

const say = sayer('POST');
say(`RAN on ${process.platform}`);
reportHandOff(say);
