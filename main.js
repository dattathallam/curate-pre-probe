// main: never touches _diag. Decides on the snapshot pre saved through the runner's step state.
const snap = JSON.parse(process.env.STATE_snap || 'null');
if (!snap) { console.error('[curate MAIN] no snapshot from pre'); process.exit(1); }
const forged = snap.forgedInPages + snap.forgedInBlocks + snap.forgedInWorker;
console.log(`[curate MAIN] ${new Date().toISOString()} deciding on pre's snapshot: ${snap.actions.length} action(s), forged markers seen by pre: ${forged}`);
console.log('[curate MAIN] approval stand-in: APPROVED');
