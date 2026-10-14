'use strict';
const fs = require('fs');

const sayer = (stage) => (m) => console.log(`[observer ${stage}] ${m}`);

// shape prints whether a value is there without printing it.
const shape = (v) => (v === undefined ? 'unset' : v === '' ? 'empty' : `set(len=${v.length})`);

const times = (p) => {
  try {
    const s = fs.statSync(p);
    return `birth=${s.birthtime.toISOString()} ctime=${s.ctime.toISOString()} mtime=${s.mtime.toISOString()} size=${s.size}`;
  } catch (e) {
    return `stat FAILED ${e.code}`;
  }
};

function reportInputs(say) {
  const e = process.env;
  say(`input plain=${JSON.stringify(e.INPUT_PLAIN)} secret=${shape(e.INPUT_SECRET)} fromstep=${JSON.stringify(e.INPUT_FROMSTEP)}`);
  say(`env PROBE_PLAIN=${JSON.stringify(e.PROBE_PLAIN)} PROBE_SECRET=${shape(e.PROBE_SECRET)} PROBE_FROMSTEP=${JSON.stringify(e.PROBE_FROMSTEP)}`);
}

function reportHandOff(say) {
  const e = process.env;
  say(`STATE_from_pre_state=${JSON.stringify(e.STATE_from_pre_state)} FROM_PRE_ENV=${JSON.stringify(e.FROM_PRE_ENV)} PATH has from-pre-bin=${(e.PATH || '').includes('from-pre-bin')}`);
}

module.exports = { sayer, shape, times, reportInputs, reportHandOff };
