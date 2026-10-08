'use strict';
// Shared helpers for the e2e wrapper. Plain node, no dependencies.
const fs = require('fs');
const https = require('https');
const path = require('path');

function input(name) {
  return process.env['INPUT_' + name.toUpperCase().replace(/ /g, '_')] || '';
}

function assetName() {
  const arch = process.arch;
  switch (process.platform) {
    case 'linux':
      return arch === 'arm64' ? 'jf-linux-arm64' : 'jf-linux-amd64';
    case 'win32':
      return 'jf-windows-amd64.exe';
    case 'darwin':
      return arch === 'arm64' ? 'jf-darwin-arm64' : 'jf-darwin-amd64';
    default:
      throw new Error('unsupported platform ' + process.platform + '/' + arch);
  }
}

// get resolves with the final response (status 2xx) after following redirects.
// The Authorization header is dropped when a redirect leaves the original host.
function get(url, headers, redirects) {
  redirects = redirects === undefined ? 5 : redirects;
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get(u, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) {
          reject(new Error('too many redirects'));
          return;
        }
        const next = new URL(res.headers.location, u);
        const h = Object.assign({}, headers);
        if (next.host !== u.host) {
          delete h.Authorization;
        }
        get(next.toString(), h, redirects - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let body = '';
        res.on('data', (d) => { if (body.length < 500) body += d; });
        res.on('end', () => reject(new Error('GET ' + u.origin + u.pathname + ' -> ' + res.statusCode + ' ' + body)));
        return;
      }
      resolve(res);
    });
    req.on('error', reject);
  });
}

async function getJSON(url, headers) {
  const res = await get(url, headers);
  const chunks = [];
  for await (const c of res) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function downloadReleaseAsset(repo, tag, name, token, dest) {
  const base = { 'User-Agent': 'curate-wrapper-e2e', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' };
  const rel = await getJSON('https://api.github.com/repos/' + repo + '/releases/tags/' + encodeURIComponent(tag),
    Object.assign({ Accept: 'application/vnd.github+json' }, base));
  const asset = (rel.assets || []).find((a) => a.name === name);
  if (!asset) {
    throw new Error('release ' + tag + ' of ' + repo + ' has no asset ' + name + ' (has: ' + (rel.assets || []).map((a) => a.name).join(', ') + ')');
  }
  const res = await get('https://api.github.com/repos/' + repo + '/releases/assets/' + asset.id,
    Object.assign({ Accept: 'application/octet-stream' }, base));
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest, { mode: 0o755 });
    res.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    res.on('error', reject);
  });
  fs.chmodSync(dest, 0o755);
}

// childEnv builds the allow-listed environment for jf. Nothing else is inherited,
// in particular no NODE_OPTIONS, no proxy or CA overrides, and PATH is a fixed value.
function childEnv(jfHome, extra) {
  const win = process.platform === 'win32';
  const src = process.env;
  const env = { PATH: win ? 'C:\\Windows\\System32' : '/usr/bin:/bin' };
  const copy = [
    'HOME', 'USERPROFILE', 'SystemRoot',
    'GITHUB_ACTIONS', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_REPOSITORY', 'GITHUB_ACTION_REPOSITORY',
    'GITHUB_STEP_SUMMARY', 'GITHUB_STATE', 'GITHUB_WORKSPACE', 'GITHUB_WORKFLOW_REF', 'GITHUB_JOB',
    'RUNNER_ENVIRONMENT', 'RUNNER_WORKSPACE', 'RUNNER_TEMP', 'RUNNER_OS', 'RUNNER_ARCH', 'RUNNER_NAME',
    'STATE_JFROG_CURATION_DECIDED',
  ];
  for (const k of copy) {
    if (src[k] !== undefined) env[k] = src[k];
  }
  if (src.RUNNER_TEMP) {
    env.TMPDIR = src.RUNNER_TEMP;
    env.TEMP = src.RUNNER_TEMP;
    env.TMP = src.RUNNER_TEMP;
  }
  env.JFROG_CLI_HOME_DIR = jfHome;
  env.JFROG_CLI_AVOID_NEW_VERSION_WARNING = 'true';
  if (input('vcs-repo')) env.JFROG_CLI_CURATION_GH_ACTIONS_VCS_REPO = input('vcs-repo');
  return Object.assign(env, extra || {});
}

function appendState(key, value) {
  fs.appendFileSync(process.env.GITHUB_STATE, key + '=' + value + '\n');
}

module.exports = { input, assetName, downloadReleaseAsset, childEnv, appendState, path };
