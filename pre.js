// pre: the only place that reads _diag. Runs before the pre of every action listed after this step.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { findRunnerDir, snapshotWhenReady, listActionCache } = require('./lib');

(async () => {
  const t0 = Date.now();
  const { runnerDir, chain } = findRunnerDir();
  console.log(`[curate PRE] ${new Date().toISOString()} os=${process.platform} runnerDir=${runnerDir || 'NOT VISIBLE'} chain=${chain.join(' > ')}`);
  const cache = listActionCache();
  console.log(`[curate PRE] _actions folders (${cache.length}): ${cache.join(', ')}`);
  const snap = { visible: !!runnerDir, cache };
  if (runnerDir) {
    const s = await snapshotWhenReady(path.join(runnerDir, '_diag'), 6000);
    Object.assign(snap, s);
    console.log(`[curate PRE] Worker log SHAs (${s.worker.length}): ${s.worker.map((w) => `${w.key.split('@')[0]}@${w.key.split('@')[1].slice(0, 8)}[${w.kinds}]`).join(', ')}`);
    console.log(`[curate PRE] setup-buffer actions (${s.setup.length}): ${s.setup.map((a) => a.split(' ')[0] + '@' + a.split(' ')[1].slice(0, 8)).join(', ')}`);
    console.log(`[curate PRE] Worker SHAs missing from the setup buffer: ${s.missingInSetup} (attempts=${s.attempts}, waited ${s.waitedMs} ms)`);
    console.log(`[curate PRE] job message steps: ${s.job.error ? 'ERROR ' + s.job.error : JSON.stringify(s.job.steps)} (json bytes ${s.job.bytes})`);
    console.log(`[curate PRE] forged entries seen: setup=${s.forged.setup} workerAnchored=${s.forged.workerAnchored} workerLoose=${s.forged.workerLoose} looseOnly=${JSON.stringify(s.workerLooseOnly)}`);
  }
  const raw = JSON.stringify(snap);
  const pad = 'x'.repeat(Number(process.env.INPUT_PADKB || 0) * 1024);
  fs.appendFileSync(process.env.GITHUB_STATE, `snap=${raw}\nsnaphash=${crypto.createHash('sha256').update(raw).digest('hex')}\n` + (pad ? `pad=${pad}\n` : ''));
  console.log(`[curate PRE] saved state: snap=${raw.length} bytes, pad=${pad.length} bytes, total pre time ${Date.now() - t0} ms`);
  if (process.env.INPUT_FAILINPRE === 'true') { console.log('[curate PRE] failing the job from pre (probe)'); process.exit(1); }
})();
