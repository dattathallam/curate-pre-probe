// pre: the only place that reads _diag. Runs before the pre of every action listed after this step.
const fs = require('fs');
const { findDiag, snapshotWhenReady } = require('./lib');
const diag = findDiag();
(async () => {
const s = await snapshotWhenReady(diag, 10000);
console.log(`[curate PRE] ${new Date().toISOString()} diag=${diag}`);
console.log(`[curate PRE] actions in setup buffer: ${JSON.stringify(s.actions)}`);
console.log(`[curate PRE] forged marker counts: pages=${s.forgedInPages} blocks=${s.forgedInBlocks} worker=${s.forgedInWorker}`);
console.log(`[curate PRE] Worker-log SHAs: ${s.worker.length}, not yet in setup buffer: ${s.missing.length}, attempts=${s.attempts}, waited ${s.waitedMs} ms`);
fs.appendFileSync(process.env.GITHUB_STATE, `snap=${JSON.stringify(s)}\n`);
})();
