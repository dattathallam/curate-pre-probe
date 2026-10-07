// post: shows what the diag looks like now and whether an earlier pre modified this action's own files.
const fs = require('fs');
const path = require('path');
const { findRunnerDir, snapshot } = require('./lib');
const { runnerDir } = findRunnerDir();
const own = ['main.js', 'post.js', 'pre.js'].map((f) => `${f}:${/TAMPERED/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')) ? 'MODIFIED' : 'intact'}`).join(' ');
console.log(`[curate POST] own files: ${own}`);
if (runnerDir) {
  const s = snapshot(path.join(runnerDir, '_diag'));
  console.log(`[curate POST] now: setup=${s.setup.length} workerAnchored=${s.worker.length} forged(setup/workerAnchored/workerLoose)=${s.forged.setup}/${s.forged.workerAnchored}/${s.forged.workerLoose}`);
}
