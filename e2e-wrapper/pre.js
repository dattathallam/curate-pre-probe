'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const lib = require('./lib');

function run(jf, args, env, label) {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(jf, args, { env, stdio: 'inherit', windowsHide: true });
  const ms = Number((process.hrtime.bigint() - t0) / 1000000n);
  console.log('[e2e PRE] ' + label + ' exit=' + r.status + (r.signal ? ' signal=' + r.signal : '') + (r.error ? ' error=' + r.error.message : '') + ' wall=' + ms + 'ms');
  return r.status === null ? 1 : r.status;
}

async function main() {
  console.log('[e2e PRE] wrapper pre started on ' + process.platform + '/' + process.arch);
  const temp = process.env.RUNNER_TEMP;
  if (!temp) throw new Error('RUNNER_TEMP is not set');
  const repo = process.env.GITHUB_REPOSITORY; // the workflow's repo holds the jf release, not this public action's
  const tag = lib.input('jf-release');
  const name = lib.assetName();
  const dir = fs.mkdtempSync(path.join(temp, 'curate-jf-'));
  const jfHome = fs.mkdtempSync(path.join(temp, 'curate-jfhome-'));
  const jf = path.resolve(dir, name);

  const d0 = Date.now();
  await lib.downloadReleaseAsset(repo, tag, name, lib.input('github-token'), jf);
  console.log('[e2e PRE] downloaded ' + name + ' from ' + repo + '@' + tag + ' in ' + (Date.now() - d0) + 'ms -> ' + jf);

  lib.appendState('jf', jf);
  lib.appendState('jfhome', jfHome);

  const env = lib.childEnv(jfHome);
  const cfg = run(jf, ['config', 'add', 'e2e', '--url', lib.input('url'), '--access-token', lib.input('token'), '--interactive=false'], env, 'config add');
  if (cfg !== 0) process.exit(cfg);

  const code = run(jf, ['curate-gh-actions', '--from-pre'], env, 'curate-gh-actions --from-pre');
  console.log('[e2e PRE] curate wall time printed above; exiting with ' + code);
  process.exit(code);
}

main().catch((e) => {
  console.log('[e2e PRE] FAILED: ' + e.message);
  process.exit(1);
});
