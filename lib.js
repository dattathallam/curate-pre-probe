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
module.exports = { findDiag, snapshot };
