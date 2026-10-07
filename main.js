// main: never touches _diag. Decides on the snapshot pre saved through the runner's step state.
const crypto = require('crypto');
const raw = process.env.STATE_snap;
if (!raw) { console.error('[curate MAIN] no snapshot from pre'); process.exit(1); }
const snap = JSON.parse(raw);
const hashOk = crypto.createHash('sha256').update(raw).digest('hex') === process.env.STATE_snaphash;
const forged = snap.visible ? snap.forged.setup + snap.forged.workerAnchored : 0;
console.log(`[curate MAIN] ${new Date().toISOString()} STATE_snap=${raw.length}B hash-matches=${hashOk} forgedInState=${/FORGED/.test(raw)} pad=${(process.env.STATE_pad || '').length}B`);
console.log(`[curate MAIN] decision input: ${snap.visible ? snap.worker.length + ' Worker SHAs' : 'runner not visible (fallback to _actions walk: ' + snap.cache.length + ' folders)'}, forged entries in pre's view: ${forged}`);
console.log('[curate MAIN] approval stand-in: APPROVED');
