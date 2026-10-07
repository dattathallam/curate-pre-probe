// pre: the only place that reads _diag. Runs before the pre of every action listed after this step.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { findRunnerDir, snapshotWhenReady, listActionCache } = require('./lib');

(async () => {
  const t0 = Date.now();
  const { runnerDir, chain, workerPid } = findRunnerDir();
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
  if (process.env.INPUT_KILLINPRE === 'true') {
    console.log(`[curate PRE] killing Runner.Worker pid=${workerPid} from pre`);
    try {
      if (process.platform === 'win32') require('child_process').execFileSync('taskkill', ['/F', '/PID', String(workerPid)]);
      else process.kill(workerPid, 'SIGKILL');
    } catch (e) { console.log(`[curate PRE] kill failed: ${e.message}`); }
    await require('./lib').sleep(20000);
    console.log('[curate PRE] still running 20 s after the kill');
  }
  if (process.env.INPUT_CANCELINPRE === 'true') {
    const https = require('https');
    const t1 = Date.now();
    const status = await new Promise((resolve) => {
      const req = https.request({ host: 'api.github.com', method: 'POST', path: `/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/cancel`,
        headers: { authorization: `Bearer ${process.env.INPUT_TOKEN}`, 'user-agent': 'curate-pre-probe', accept: 'application/vnd.github+json' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', (e) => resolve('error ' + e.message));
      req.end();
    });
    console.log(`[curate PRE] cancel API status=${status} after ${Date.now() - t1} ms; waiting for the runner to cancel this step`);
    for (let i = 0; i < 40; i++) { await require('./lib').sleep(1000); console.log(`[curate PRE] still alive ${i + 1}s after cancel request`); }
    console.log('[curate PRE] NOT cancelled within 40 s');
  }
  if (process.env.INPUT_FAILINPRE === 'true') { console.log('[curate PRE] failing the job from pre (probe)'); process.exit(1); }
})();
