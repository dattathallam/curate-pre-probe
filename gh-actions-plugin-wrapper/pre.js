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

function summaryBytes() {
  try {
    return fs.statSync(process.env.GITHUB_STEP_SUMMARY).size;
  } catch (e) {
    return 0;
  }
}

async function main() {
  console.log('[e2e PRE] wrapper pre started on ' + process.platform + '/' + process.arch);
  const temp = process.env.RUNNER_TEMP;
  if (!temp) throw new Error('RUNNER_TEMP is not set');
  const win = process.platform === 'win32';
  const binDir = fs.mkdtempSync(path.join(temp, 'curate-jf-'));
  const jfHome = fs.mkdtempSync(path.join(temp, 'curate-jfhome-'));
  const jf = path.join(binDir, win ? 'jf.exe' : 'jf');

  await lib.downloadURL(lib.jfURL(lib.input('jf-version')), jf);
  console.log('[e2e PRE] downloaded jf ' + lib.input('jf-version') + ' sha256=' + lib.sha256(jf));

  // The release lives in the workflow's repository, which is also this action's.
  const repo = process.env.GITHUB_REPOSITORY;
  const tag = lib.input('tag');
  const asset = lib.pluginAsset();
  const sums = path.join(binDir, 'SHA256SUMS');
  const dl = path.join(binDir, asset);
  await lib.downloadReleaseAsset(repo, tag, 'SHA256SUMS', lib.input('github-token'), sums);
  await lib.downloadReleaseAsset(repo, tag, asset, lib.input('github-token'), dl);
  const want = fs.readFileSync(sums, 'utf8').split('\n').map((l) => l.trim().split(/\s+/)).find((f) => f[1] === asset);
  const got = lib.sha256(dl);
  if (!want || want[0] !== got) throw new Error('SHA-256 of ' + asset + ' is ' + got + ', SHA256SUMS says ' + (want ? want[0] : 'nothing'));
  const pluginBin = path.join(jfHome, 'plugins', 'gh-actions', 'bin', win ? 'gh-actions.exe' : 'gh-actions');
  fs.mkdirSync(path.dirname(pluginBin), { recursive: true });
  // jf plugin install writes this; without it jf migrates plugins/ from the v0 layout and errors on the folder.
  fs.writeFileSync(path.join(jfHome, 'plugins', 'plugins.yml'), '{"version":1}');
  fs.copyFileSync(dl, pluginBin);
  fs.chmodSync(pluginBin, 0o755);
  console.log('[e2e PRE] installed ' + asset + ' sha256=' + got + ' from ' + repo + '@' + tag);

  lib.appendState('jf', jf);
  lib.appendState('jfhome', jfHome);

  const env = lib.childEnv(jfHome);
  console.log('[e2e PRE] JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR ' + (env.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR ? 'set' : 'unset'));
  const cfg = run(jf, ['config', 'add', 'e2e', '--url', lib.input('url'), '--access-token', lib.input('token'), '--interactive=false'], env, 'config add');
  if (cfg !== 0) process.exit(cfg);

  const before = summaryBytes();
  const code = run(jf, ['gh-actions', 'curate', '--from-pre'], env, 'gh-actions curate --from-pre');
  const after = summaryBytes();
  console.log('[e2e PRE] step summary grew ' + (after - before) + ' bytes');
  if (after > before) {
    console.log('[e2e PRE] step summary content:\n' + fs.readFileSync(process.env.GITHUB_STEP_SUMMARY, 'utf8'));
  }
  process.exit(code);
}

main().catch((e) => {
  console.log('[e2e PRE] FAILED: ' + e.message);
  process.exit(1);
});
