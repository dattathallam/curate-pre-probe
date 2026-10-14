'use strict';
const fs = require('fs');
const { sayer, reportInputs, reportHandOff } = require('./common');

const say = sayer('MAIN');
say(`RAN on ${process.platform}`);
reportInputs(say);
reportHandOff(say);
fs.appendFileSync(process.env.GITHUB_OUTPUT, 'from_main=yes\n');
say('wrote GITHUB_OUTPUT from_main=yes');
