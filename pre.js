// pre: the only place that reads _diag. Runs before the pre of every action listed after this step.
const fs = require('fs');
const { findDiag, snapshot } = require('./lib');
const diag = findDiag();
const s = snapshot(diag);
console.log(`[curate PRE] ${new Date().toISOString()} diag=${diag}`);
console.log(`[curate PRE] actions in setup buffer: ${JSON.stringify(s.actions)}`);
console.log(`[curate PRE] forged marker counts: pages=${s.forgedInPages} blocks=${s.forgedInBlocks} worker=${s.forgedInWorker}`);
fs.appendFileSync(process.env.GITHUB_STATE, `snap=${JSON.stringify(s)}\n`);
