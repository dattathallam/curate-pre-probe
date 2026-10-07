const fs = require('fs');
const path = require('path');
function findDiag() {
  const cands = [];
  for (const base of ['/home/runner/actions-runner/cached', '/home/runner/actions-runner']) {
    if (!fs.existsSync(base)) continue;
    cands.push(path.join(base, '_diag'));
    for (const e of fs.readdirSync(base)) cands.push(path.join(base, e, '_diag'));
  }
  return cands.find((c) => fs.existsSync(path.join(c, 'pages')));
}
function readAll(dir) {
  let s = '';
  if (!fs.existsSync(dir)) return s;
  for (const f of fs.readdirSync(dir)) { try { s += fs.readFileSync(path.join(dir, f), 'latin1') + '\n'; } catch (e) {} }
  return s;
}
// Counts only genuine-shaped lines naming the forged marker, ignoring this probe's own script text.
function snapshot(diag) {
  const re = /Download action repository '([^']+)' \(SHA:([0-9a-f]{40})\)/g;
  const out = { actions: [], forgedInPages: 0, forgedInBlocks: 0, forgedInWorker: 0 };
  const pages = readAll(path.join(diag, 'pages'));
  let m; const seen = new Set();
  while ((m = re.exec(pages))) { const k = m[1] + ' ' + m[2]; if (!seen.has(k)) { seen.add(k); out.actions.push(k); } }
  out.forgedInPages = (pages.match(/attackerpre\/evil@v9/g) || []).length;
  out.forgedInBlocks = (readAll(path.join(diag, 'blocks')).match(/attackerpre\/evil@v9/g) || []).length;
  const workers = fs.readdirSync(diag).filter((f) => /^Worker_.*\.log$/.test(f));
  for (const w of workers) out.forgedInWorker += (fs.readFileSync(path.join(diag, w), 'latin1').match(/Check if action archive 'attackerpre\/evil@/g) || []).length;
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function workerShas(diag) {
  const re = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z [A-Z ]+ ActionManager\] Check if action archive '([^'@]+\/[^'@]+)@([0-9a-f]{40})'/gm;
  const out = new Set();
  for (const f of fs.readdirSync(diag).filter((x) => /^Worker_.*\.log$/.test(x))) {
    let m; const t = fs.readFileSync(path.join(diag, f), 'latin1');
    while ((m = re.exec(t))) out.add(m[1] + '@' + m[2]);
  }
  return [...out];
}
// Polls until every action the Worker log fetched has a setup line in pages (or the deadline passes).
async function snapshotWhenReady(diag, deadlineMs) {
  const t0 = Date.now(); let attempts = 0; let s;
  for (;;) {
    attempts++;
    s = snapshot(diag);
    const w = workerShas(diag);
    const pageShas = new Set(s.actions.map((a) => a.split(' ')[1]));
    const missing = w.filter((x) => !pageShas.has(x.split('@')[1]));
    s.worker = w; s.missing = missing; s.attempts = attempts; s.waitedMs = Date.now() - t0;
    if (missing.length === 0 || Date.now() - t0 > deadlineMs) return s;
    await sleep(100);
  }
}
module.exports = { findDiag, snapshot, snapshotWhenReady };
