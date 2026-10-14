'use strict';
// pre: reports what ran before it (runner-written evidence, the action files on disk, the file-command files)
// and hands a value to main, later steps and the step's outputs through every channel a pre has.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { findRunnerDir, workerLogs } = require('../lib');
const { sayer, shape, times, reportInputs } = require('./common');

const say = sayer('PRE');

function workerEvidence() {
  const { runnerDir, chain } = findRunnerDir();
  say(`runnerDir=${runnerDir || 'NOT VISIBLE'} chain=${chain.join(' > ')}`);
  if (!runnerDir) {
    return;
  }
  const logs = workerLogs(path.join(runnerDir, '_diag'));
  const pick = /StepsRunner\]|"hasPreStep"|"stage"|Pre Run|PreStep|preStep|ExecutionStage/;
  let printed = 0;
  for (const l of logs) {
    let text;
    try {
      text = fs.readFileSync(l, 'latin1');
    } catch (e) {
      say(`worker ${path.basename(l)} read FAILED ${e.code}`);
      continue;
    }
    const lines = text.split(/\r?\n/);
    const nul = (text.match(/\u0000/g) || []).length;
    const blank = lines.filter((x) => /^ {20,}$/.test(x)).length;
    say(`worker ${path.basename(l)} [${times(l)}] lines=${lines.length} NUL bytes=${nul} space-only lines=${blank}`);
    lines.forEach((line, i) => {
      if (!pick.test(line) || printed >= 200) {
        return;
      }
      printed++;
      say(`worker ${path.basename(l)}:${i + 1} ${JSON.stringify(line.slice(0, 260))}`);
    });
  }
  say(`worker evidence lines printed=${printed}`);
}

function findActionFiles(dir, depth) {
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const d of entries) {
    const p = path.join(dir, d.name);
    if (d.isFile() && /^action\.ya?ml$/.test(d.name)) {
      out.push(p);
    } else if (d.isDirectory() && depth < 4 && d.name !== 'node_modules' && d.name !== '.git') {
      out.push(...findActionFiles(p, depth + 1));
    }
  }
  return out;
}

function actionInventory() {
  const base = path.join(process.env.RUNNER_TEMP || '', '..', '_actions');
  say(`_actions dir [${times(base)}]`);
  let owners = [];
  try {
    owners = fs.readdirSync(base);
  } catch (e) {
    say(`_actions not readable ${e.code}`);
    return;
  }
  for (const o of owners) {
    for (const r of fs.readdirSync(path.join(base, o))) {
      for (const entry of fs.readdirSync(path.join(base, o, r))) {
        const p = path.join(base, o, r, entry);
        if (entry.endsWith('.completed')) {
          say(`marker ${o}/${r}/${entry} [${times(p)}]`);
          continue;
        }
        for (const y of findActionFiles(p, 0)) {
          let pre = 'unreadable';
          try {
            pre = /(^|[\s{,])(pre|pre-entrypoint)\s*:/m.test(fs.readFileSync(y, 'utf8'));
          } catch (e) {
            /* reported as unreadable */
          }
          say(`action file ${o}/${r}/${entry}/${path.relative(p, y).replace(/\\/g, '/')} pre=${pre} [${times(y)}]`);
        }
      }
    }
  }
}

function fileCommands() {
  const fc = path.join(process.env.RUNNER_TEMP || '', '_runner_file_commands');
  say(`_runner_file_commands dir [${times(fc)}]`);
  let names = [];
  try {
    names = fs.readdirSync(fc);
  } catch (e) {
    say(`_runner_file_commands not readable ${e.code}`);
    return;
  }
  for (const n of names) {
    say(`file command ${n} [${times(path.join(fc, n))}]`);
  }
}

async function idToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const token = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  say(`ACTIONS_ID_TOKEN_REQUEST_URL=${shape(url)} ACTIONS_ID_TOKEN_REQUEST_TOKEN=${shape(token)}`);
  if (!url || !token || process.env.INPUT_IDTOKEN !== 'true') {
    return;
  }
  const u = new URL(url);
  u.searchParams.set('audience', 'pre-observer-probe');
  const res = await new Promise((resolve) => {
    https
      .get(u, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'pre-observer' } }, (r) => {
        let body = '';
        r.on('data', (d) => (body += d));
        r.on('end', () => resolve({ status: r.statusCode, body }));
      })
      .on('error', (e) => resolve({ status: `error ${e.message}`, body: '' }));
  });
  let claims;
  try {
    const jwt = JSON.parse(res.body).value;
    const p = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
    claims = `aud=${p.aud} sub=${p.sub} runner_environment=${p.runner_environment}`;
  } catch (e) {
    claims = 'no token in the response';
  }
  say(`ID token request status=${res.status} ${claims}`);
}

function handOff() {
  const e = process.env;
  say(`GITHUB_ENV=${shape(e.GITHUB_ENV)} GITHUB_PATH=${shape(e.GITHUB_PATH)} GITHUB_OUTPUT=${shape(e.GITHUB_OUTPUT)} GITHUB_STATE=${shape(e.GITHUB_STATE)}`);
  const win = process.platform === 'win32';
  const bin = path.join(e.RUNNER_TEMP, 'from-pre-bin');
  fs.mkdirSync(bin, { recursive: true });
  if (win) {
    fs.writeFileSync(path.join(bin, 'from-pre-tool.cmd'), '@echo from-pre-tool ran\r\n');
  } else {
    fs.writeFileSync(path.join(bin, 'from-pre-tool'), '#!/bin/sh\necho from-pre-tool ran\n', { mode: 0o755 });
  }
  const write = (file, line, label) => {
    try {
      fs.appendFileSync(file, line);
      say(`wrote ${label}`);
    } catch (err) {
      say(`write ${label} FAILED ${err.code || err.message}`);
    }
  };
  write(e.GITHUB_ENV, 'FROM_PRE_ENV=yes\n', 'GITHUB_ENV FROM_PRE_ENV=yes');
  write(e.GITHUB_PATH, bin + '\n', `GITHUB_PATH ${bin}`);
  write(e.GITHUB_OUTPUT, 'from_pre=yes\n', 'GITHUB_OUTPUT from_pre=yes');
  write(e.GITHUB_STATE, 'from_pre_state=yes\n', 'GITHUB_STATE from_pre_state=yes');
}

(async () => {
  const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();
  say(`RAN on ${process.platform} process started=${startedAt} GITHUB_ACTION_REPOSITORY=${JSON.stringify(process.env.GITHUB_ACTION_REPOSITORY)} GITHUB_ACTION=${JSON.stringify(process.env.GITHUB_ACTION)}`);
  reportInputs(say);
  await idToken();
  workerEvidence();
  actionInventory();
  fileCommands();
  handOff();
})();
