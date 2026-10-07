const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function sh(cmd, args) {
  try { return cp.execFileSync(cmd, args, { encoding: 'utf8', timeout: 20000 }).trim(); } catch (e) { return ''; }
}

// Parent pid and executable of a process, per OS.
function procInfo(pid) {
  if (process.platform === 'linux') {
    try {
      const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const ppid = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]);
      let exe = '';
      try { exe = fs.readlinkSync(`/proc/${pid}/exe`); } catch (e) { /* not readable */ }
      return { ppid, exe };
    } catch (e) { return null; }
  }
  if (process.platform === 'darwin') {
    const o = sh('ps', ['-o', 'ppid=,command=', '-p', String(pid)]);
    const m = o.match(/^\s*(\d+)\s+(.*)$/);
    return m ? { ppid: Number(m[1]), exe: m[2] } : null;
  }
  const o = sh('powershell', ['-NoProfile', '-Command', `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; "$($p.ParentProcessId)|$($p.ExecutablePath)"`]);
  const i = o.indexOf('|');
  return i < 0 ? null : { ppid: Number(o.slice(0, i)), exe: o.slice(i + 1) };
}

// Walk up the process tree to Runner.Worker; the runner dir is the parent of its bin folder.
function findRunnerDir() {
  const chain = [];
  let pid = process.pid;
  for (let i = 0; i < 10 && pid > 0; i++) {
    const info = procInfo(pid);
    if (!info) break;
    chain.push(`${pid}:${path.basename(info.exe.split(' ')[0] || '?')}`);
    const m = info.exe.match(/^(.*?)[\\/]Runner\.Worker/i);
    if (m) return { runnerDir: path.dirname(m[1]), chain };
    pid = info.ppid;
  }
  return { runnerDir: null, chain };
}

function readAll(dir) {
  let s = '';
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return s; }
  for (const f of names) { try { s += fs.readFileSync(path.join(dir, f), 'latin1') + '\n'; } catch (e) { /* vanished */ } }
  return s;
}

function workerLogs(diag) {
  try { return fs.readdirSync(diag).filter((f) => /^Worker_.*\.log$/.test(f)).sort().map((f) => path.join(diag, f)); } catch (e) { return []; }
}

const TS = String.raw`^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z [A-Z ]+ ActionManager\] `;
const ACT = String.raw`([^/'@]+)/([^'@]+)@([0-9a-fA-F]{40,64})`;
const LINES = {
  check: String.raw`Check if action archive '` + ACT + `'`,
  symlink: String.raw`Checking if can symlink '` + ACT + `'`,
  save: String.raw`Save archive 'https?://[^']*?/([^/']+)/([^/']+)/(?:tar\.gz|zip|tarball|zipball)/([0-9a-fA-F]{40,64})'`,
};

// anchored=true is the proposed hardening; anchored=false is what the product regexes do today.
function parseWorker(text, anchored) {
  const out = new Map();
  for (const [kind, body] of Object.entries(LINES)) {
    const re = new RegExp((anchored ? TS : '') + body, 'gm');
    let m;
    while ((m = re.exec(text))) {
      const key = `${m[1]}/${m[2]}@${m[3].toLowerCase()}`;
      if (!out.has(key)) out.set(key, new Set());
      out.get(key).add(kind);
    }
  }
  return [...out.entries()].map(([key, kinds]) => ({ key, kinds: [...kinds].sort().join('+') }));
}

function parseSetup(text) {
  const re = /Download action repository '([^']+)' \(SHA:([0-9a-fA-F]{40,64})\)/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(text))) seen.add(`${m[1]} ${m[2].toLowerCase()}`);
  return [...seen];
}

// The job message is pretty-printed JSON in the Worker log after "Worker] Job message:".
function jobMessageSteps(text) {
  const at = text.indexOf('Worker] Job message:');
  if (at < 0) return { error: 'marker not found' };
  const start = text.indexOf('{', at);
  if (start < 0) return { error: 'no json' };
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return { error: 'unterminated json' };
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    const steps = (obj.steps || obj.Steps || []).map((s) => {
      const r = s.reference || s.Reference || {};
      return `${r.type || r.Type || '?'}:${r.name || r.Name || s.name || ''}@${r.ref || r.Ref || ''}${r.path || r.Path ? '/' + (r.path || r.Path) : ''}`;
    });
    return { steps, bytes: end - start };
  } catch (e) { return { error: 'parse: ' + e.message }; }
}

// owner/repo@ref folders under _actions, which a container job can still see.
function listActionCache() {
  const base = path.join(process.env.RUNNER_TEMP || '', '..', '_actions');
  const out = [];
  try {
    for (const o of fs.readdirSync(base)) {
      for (const r of fs.readdirSync(path.join(base, o))) {
        for (const ref of fs.readdirSync(path.join(base, o, r))) if (!ref.endsWith('.completed')) out.push(`${o}/${r}@${ref}`);
      }
    }
  } catch (e) { /* none */ }
  return out;
}

const isForged = (s) => /attacker|jobmsg\//.test(s);

function snapshot(diag) {
  const pages = readAll(path.join(diag, 'pages'));
  const blocks = readAll(path.join(diag, 'blocks'));
  let worker = '';
  for (const w of workerLogs(diag)) { try { worker += fs.readFileSync(w, 'latin1') + '\n'; } catch (e) { /* locked */ } }
  const setup = parseSetup(pages + '\n' + blocks);
  const wAnch = parseWorker(worker, true);
  const wLoose = parseWorker(worker, false);
  return {
    setup,
    worker: wAnch,
    workerLooseOnly: wLoose.filter((l) => !wAnch.some((a) => a.key === l.key)).map((l) => l.key),
    job: jobMessageSteps(worker),
    forged: {
      setup: setup.filter(isForged).length,
      workerAnchored: wAnch.filter((l) => isForged(l.key)).length,
      workerLoose: wLoose.filter((l) => isForged(l.key)).length,
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Polls until every SHA the Worker fetched has a setup line (or the deadline passes).
async function snapshotWhenReady(diag, deadlineMs) {
  const t0 = Date.now();
  let attempts = 0, s;
  for (;;) {
    attempts++;
    s = snapshot(diag);
    const have = new Set(s.setup.map((a) => a.split(' ')[1]));
    s.missingInSetup = s.worker.filter((w) => !have.has(w.key.split('@')[1])).length;
    s.attempts = attempts;
    s.waitedMs = Date.now() - t0;
    if (s.missingInSetup === 0 || Date.now() - t0 > deadlineMs) return s;
    await sleep(100);
  }
}

module.exports = { findRunnerDir, snapshot, snapshotWhenReady, listActionCache, parseWorker, workerLogs, readAll, sleep };
