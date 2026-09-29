#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PROJECT_ROOT,
  SCRIPTS_ROOT,
  acquireLeaseWithRetry,
  assertExtendScriptArtifactSafe,
  discoverIllustratorTarget,
  parseCommonOptions,
  releaseLease,
  renewLease,
  resultValue,
  runFile,
  sha256File
} from '../tooling/comtool.mjs';

var argv = process.argv.slice(2);
var config = parseCommonOptions(argv);
var rounds = 3;
var laneArg = '';
for (var i = 0; i < argv.length; i++) {
  if (argv[i] === '--rounds' && i + 1 < argv.length) rounds = Number(argv[++i]);
  else if (argv[i] === '--lanes' && i + 1 < argv.length) laneArg = argv[++i];
}
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) {
  throw new Error('--rounds must be an integer from 1 to 20');
}

var allLanes = [
  'v4-esrand','v4-math','v4-explicit',
  'v7-esrand','v7-math','v7-explicit',
  'parse','stringify','v5'
];
var lanes = laneArg
  ? laneArg.split(',').map(function (x) { return x.trim(); }).filter(Boolean)
  : allLanes.slice();

for (var li = 0; li < lanes.length; li++) {
  if (allLanes.indexOf(lanes[li]) === -1) throw new Error('Unknown benchmark lane: ' + lanes[li]);
}

var probe = join(PROJECT_ROOT, 'bench', 'live-bench.jsx');
var estimer = process.env.ESUUID_ESTIMER_VENDOR ||
  join(SCRIPTS_ROOT, 'estimer', 'dist', 'vendor-estimer.js');
var esrand = process.env.ESUUID_ESRAND_VENDOR ||
  join(SCRIPTS_ROOT, 'esrand', 'dist', 'vendor-esrand.js');
var esuuid = join(PROJECT_ROOT, 'dist', 'vendor-esuuid.js');
assertExtendScriptArtifactSafe(estimer, 'ESTIMER vendor artifact');
assertExtendScriptArtifactSafe(esrand, 'ESRAND vendor artifact');
assertExtendScriptArtifactSafe(esuuid, 'ESUUID vendor artifact');
var probeHash = sha256File(probe);

var targetEntry = await discoverIllustratorTarget(config);
var targetId = targetEntry.target.id;
var leaseId = null;
var rows = [];

function parseResult(text) {
  var parts = /^ESUUID_BENCH\|([^|]+)\|(\d+)\|([^|]+)\|([^|]+)\|([^|]+)\|(\d+)\|(\d+)\|Illustrator=([^|]+)\|ExtendScript=(.+)$/.exec(text);
  if (!parts) throw new Error('Malformed ESUUID benchmark result: ' + text);
  return {
    lane: parts[1],
    batch: Number(parts[2]),
    medianBatchUs: Number(parts[3]),
    minBatchUs: Number(parts[4]),
    p95BatchUs: Number(parts[5]),
    sampleCount: Number(parts[6]),
    rejected: Number(parts[7]),
    illustrator: parts[8],
    extendScript: parts[9]
  };
}

try {
  leaseId = await acquireLeaseWithRetry(config, targetId, 300000);
  for (li = 0; li < lanes.length; li++) {
    var lane = lanes[li];
    for (var round = 0; round < rounds; round++) {
      leaseId = await renewLease(config, targetId, leaseId, 300000);
      var requestId =
        'esuuid-bench-' + lane + '-' + round + '-' +
        probeHash.slice(0, 10) + '-' + Date.now().toString(36);
      var envelope = await runFile(config, {
        leaseId: leaseId,
        requestId: requestId,
        path: probe,
        sha256: probeHash,
        targetId: targetId,
        args: [lane, estimer, esrand, esuuid],
        timeoutMs: 300000
      });
      var textResult = resultValue(envelope);
      if (typeof textResult !== 'string') {
        throw new Error('Benchmark returned non-string result for ' + lane);
      }
      var row = parseResult(textResult);
      row.round = round + 1;
      row.requestId = requestId;
      row.timing = envelope.timing || null;
      row.perOpMedianUs = row.medianBatchUs / row.batch;
      row.perOpMinUs = row.minBatchUs / row.batch;
      row.perOpP95Us = row.p95BatchUs / row.batch;
      row.opsPerSecond = row.perOpMedianUs > 0 ? 1000000 / row.perOpMedianUs : null;
      rows.push(row);
    }
  }
} finally {
  if (leaseId) await releaseLease(config, targetId, leaseId);
}

function median(values) {
  var sorted = values.slice().sort(function (a, b) { return a - b; });
  return sorted[Math.floor(sorted.length / 2)];
}
function minimum(values) {
  var m = values[0];
  for (var i2 = 1; i2 < values.length; i2++) if (values[i2] < m) m = values[i2];
  return m;
}

var summary = [];
for (li = 0; li < lanes.length; li++) {
  var name = lanes[li];
  var group = rows.filter(function (row) { return row.lane === name; });
  var med = median(group.map(function (row) { return row.perOpMedianUs; }));
  var min = minimum(group.map(function (row) { return row.perOpMinUs; }));
  var p95 = median(group.map(function (row) { return row.perOpP95Us; }));
  summary.push({
    lane: name,
    medianUsPerOp: med,
    minUsPerOp: min,
    p95UsPerOp: p95,
    opsPerSecond: med > 0 ? 1000000 / med : null,
    rounds: group.length,
    sampleCountPerRound: group[0].sampleCount,
    rejectedMax: Math.max.apply(Math, group.map(function (row) { return row.rejected; }))
  });
}

var evidence = {
  schemaVersion: 1,
  kind: 'esuuid-live-benchmark',
  capturedAt: new Date().toISOString(),
  transport: 'COM Tool V2 script.runFile',
  timer: 'ESTIMER vendor engine lane',
  protocol: 'one lane per runFile; ESTIMER prime; 5 warmups; 9 measured samples; 3 rounds default; batch-normalized per-op values',
  pipe: config.pipe,
  target: {
    id: targetId,
    host: targetEntry.target.host,
    processId: targetEntry.identity && targetEntry.identity.processId,
    hostVersion: targetEntry.identity && targetEntry.identity.hostVersion,
    adapterVersion: targetEntry.identity && targetEntry.identity.adapterVersion
  },
  probeSha256: probeHash,
  artifacts: {
    estimerVendorSha256: sha256File(estimer),
    esrandVendorSha256: sha256File(esrand),
    esuuidVendorSha256: sha256File(esuuid)
  },
  rounds: rounds,
  summary: summary,
  raw: rows
};

var evidenceDir = join(PROJECT_ROOT, 'evidence');
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  join(evidenceDir, 'latest-live-benchmark.json'),
  JSON.stringify(evidence, null, 2) + '\n'
);

console.log('ESUUID live engine benchmark via COM Tool V2 + ESTIMER');
console.log('Illustrator ' + (targetEntry.identity && targetEntry.identity.hostVersion) + '; target=' + targetId);
console.log('protocol: 5 warmups + 9 measured samples/lane; ' + rounds + ' rounds; medians are batch-normalized');
console.log('');
console.log('lane             median us/op   min us/op   p95 us/op    ops/s');
for (li = 0; li < summary.length; li++) {
  var s = summary[li];
  console.log(
    s.lane.padEnd(16) + ' ' +
    s.medianUsPerOp.toFixed(3).padStart(12) + ' ' +
    s.minUsPerOp.toFixed(3).padStart(11) + ' ' +
    s.p95UsPerOp.toFixed(3).padStart(11) + ' ' +
    Math.round(s.opsPerSecond).toString().padStart(9)
  );
}
