'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const lib = require('./lib');

const jf = process.env.STATE_jf;
const jfHome = process.env.STATE_jfhome;
if (!jf || !jfHome) {
  console.log('[e2e POST] no jf path in state (pre did not get far enough); nothing to do');
  process.exit(0);
}
const temp = path.resolve(process.env.RUNNER_TEMP || '');
if (!path.resolve(jf).startsWith(temp + path.sep)) {
  console.log('[e2e POST] refusing to run ' + jf + ': not under RUNNER_TEMP');
  process.exit(1);
}
const size = () => { try { return fs.statSync(process.env.GITHUB_STEP_SUMMARY).size; } catch (e) { return 0; } };
const before = size();
const t0 = process.hrtime.bigint();
const r = spawnSync(jf, ['gh-actions', 'curate', '--from-post'], { env: lib.childEnv(jfHome), stdio: 'inherit', windowsHide: true });
const ms = Number((process.hrtime.bigint() - t0) / 1000000n);
console.log('[e2e POST] gh-actions curate --from-post exit=' + r.status + (r.error ? ' error=' + r.error.message : '') + ' wall=' + ms + 'ms');
console.log('[e2e POST] step summary grew ' + (size() - before) + ' bytes');
process.exit(r.status === null ? 1 : r.status);
