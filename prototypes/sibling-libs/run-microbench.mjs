#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROJECT_ROOT,
  SCRIPTS_ROOT,
  acquireLeaseWithRetry,
  discoverIllustratorTarget,
  parseCommonOptions,
  releaseLease,
  resultValue,
  runFile,
  sha256File
} from '../../tooling/comtool-v2.mjs';

var HERE = dirname(fileURLToPath(import.meta.url));
var config = parseCommonOptions(process.argv.slice(2));
var estc = join(PROJECT_ROOT, 'node_modules', 'extendscript-toolchain', 'bin', 'estc.mjs');
var protoConfig = join(HERE, 'estc.config.mjs');
var proto = join(HERE, 'dist', 'sibling-prototype.jsx');
var probe = join(HERE, 'lane-probe.jsx');
var estimer = join(SCRIPTS_ROOT, 'estimer', 'dist', 'vendor-estimer.js');
var esuuid = join(PROJECT_ROOT, 'dist', 'vendor-esuuid.js');
var escharsDll = join(SCRIPTS_ROOT, 'eschars', 'native', 'bin', 'ESChars.dll');
var runSession = process.pid + '-' + Date.now().toString(36);
var runLock = join(HERE, '.microbench.lock');

function pidAlive(pid) {
  if (!(pid > 0)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function acquireRunLock() {
  for (;;) {
    try {
      var fd = openSync(runLock, 'wx');
      writeFileSync(fd, JSON.stringify({ pid: process.pid, runSession }) + '\n', 'utf8');
      closeSync(fd);
      return;
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
      var owner = null;
      try { owner = JSON.parse(readFileSync(runLock, 'utf8')); } catch (_) {}
      if (!owner || !pidAlive(Number(owner.pid))) {
        try { unlinkSync(runLock); } catch (_) {}
        continue;
      }
      throw new Error(
        'another sibling microbenchmark is already running: pid=' +
        owner.pid + ' session=' + owner.runSession
      );
    }
  }
}

function releaseRunLock() {
  try {
    var owner = JSON.parse(readFileSync(runLock, 'utf8'));
    if (Number(owner.pid) === process.pid) unlinkSync(runLock);
  } catch (_) {}
}

acquireRunLock();
process.on('exit', releaseRunLock);

var lanes = [
  'validate.baseline',
  'validate.eschars-char',
  'parse.baseline',
  'parse.eschars-char',
  'utf8.1k-js',
  'utf8.1k-eschars-hex',
  'utf8.4k-js',
  'utf8.4k-eschars-hex',
  'v5.short-baseline',
  'v5.short-eschars-hex',
  'v5.1k-baseline',
  'v5.1k-eschars-hex',
  'v3.1k-baseline',
  'v3.1k-eschars-hex',
  'validate64.baseline',
  'validate64.esstr-trim',
  'stringify.direct',
  'stringify.esarr-map',
  'copy16.for',
  'copy16.esarr-map',
  'copy16.esarr-slice',
  'emit16.for',
  'emit16.esarr-foreach'
];

function need(path, label) {
  if (!existsSync(path)) throw new Error(label + ' missing: ' + path);
}
function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function parseLaneResult(value) {
  var m = /^LANE\|([^|]+)\|(\d+)\|([^|]+)\|([^|]+)\|([^|]+)\|(\d+)\|(\d+)\|Illustrator=([^|]+)\|ExtendScript=(.+)$/.exec(value);
  if (!m) throw new Error('malformed lane result: ' + value);
  var batch = Number(m[2]);
  var medianBatchUs = Number(m[3]);
  var minBatchUs = Number(m[4]);
  var p95BatchUs = Number(m[5]);
  return {
    lane: m[1],
    batch,
    medianBatchUs,
    minBatchUs,
    p95BatchUs,
    sampleCount: Number(m[6]),
    rejected: Number(m[7]),
    medianUsPerOp: medianBatchUs / batch,
    minUsPerOp: minBatchUs / batch,
    p95UsPerOp: p95BatchUs / batch,
    illustrator: m[8],
    extendScript: m[9]
  };
}

need(estc, 'ESTC');
need(protoConfig, 'prototype ESTC config');
need(probe, 'lane probe');
need(estimer, 'ESTIMER vendor');
need(esuuid, 'ESUUID vendor');
need(escharsDll, 'ESChars.dll');

execFileSync(process.execPath, [estc, 'build', '--config', protoConfig], {
  cwd: PROJECT_ROOT,
  stdio: 'inherit',
  timeout: 300000
});
need(proto, 'compiled sibling prototype');

var protoText = readFileSync(proto, 'utf8');
for (var forbidden of ['defineProperty', 'getOwnPropertyDescriptor', 'getOwnPropertyNames']) {
  if (protoText.indexOf(forbidden) !== -1) {
    throw new Error('prototype bundle contains forbidden descriptor helper: ' + forbidden);
  }
}

var targetEntry = discoverIllustratorTarget(config);
var targetId = targetEntry.target.id;
var probeHash = sha256File(probe);

function runOne(lane) {
  var requestId =
    'esuuid-sibling-' + runSession + '-' +
    lane.replace(/[^A-Za-z0-9]+/g, '-') + '-' + probeHash.slice(0, 8);
  var leaseId = null;
  try {
    leaseId = acquireLeaseWithRetry(config, targetId, 120000);
    return {
      requestId,
      envelope: runFile(config, {
        leaseId,
        requestId,
        path: probe,
        sha256: probeHash,
        targetId,
        args: [lane, estimer, esuuid, proto, escharsDll],
        timeoutMs: 90000
      })
    };
  } finally {
    if (leaseId) {
      try { releaseLease(config, targetId, leaseId); } catch (_) {}
    }
  }
}

process.stdout.write('[correctness] ... ');
var correctnessRun = runOne('correctness');
var correctnessValue = resultValue(correctnessRun.envelope);
var cm = /^CORRECT\|(\d+)\|nul=([^|]+)\|Illustrator=([^|]+)\|ExtendScript=(.+)$/.exec(String(correctnessValue));
if (!cm) throw new Error('malformed correctness result: ' + correctnessValue);
var correctness = {
  checks: Number(cm[1]),
  nulBehavior: cm[2],
  illustrator: cm[3],
  extendScript: cm[4],
  requestId: correctnessRun.requestId
};
console.log(correctness.checks + ' checks; NUL=' + correctness.nulBehavior);

var rows = [];
var failures = [];
for (var i = 0; i < lanes.length; i++) {
  var lane = lanes[i];
  process.stdout.write('[lane] ' + lane + ' ... ');
  try {
    var laneRun = runOne(lane);
    var value = resultValue(laneRun.envelope);
    if (typeof value !== 'string') throw new Error('non-string result');
    var row = parseLaneResult(value);
    row.requestId = laneRun.requestId;
    row.timing = laneRun.envelope.timing || null;
    rows.push(row);
    console.log(row.medianUsPerOp.toFixed(3) + ' us/op');
  } catch (error) {
    var failure = {
      lane,
      message: String(error && error.message ? error.message : error),
      kind: error && error.envelope && error.envelope.error ? error.envelope.error.kind : null,
      status: error && error.envelope ? error.envelope.status : null
    };
    failures.push(failure);
    console.log('FAILED: ' + failure.message);

    var infra =
      failure.kind === 'runtime_failure' ||
      failure.kind === 'worker_watchdog_timeout' ||
      failure.status === 'reconciliation_required';
    if (infra) break;
  }
}

var byLane = {};
for (var row of rows) byLane[row.lane] = row;
var pairs = [
  ['ESCHARS validate / per-char native', 'validate.baseline', 'validate.eschars-char'],
  ['ESCHARS parse / per-char native', 'parse.baseline', 'parse.eschars-char'],
  ['ESCHARS UTF-8 preprocess 1K', 'utf8.1k-js', 'utf8.1k-eschars-hex'],
  ['ESCHARS UTF-8 preprocess 4K', 'utf8.4k-js', 'utf8.4k-eschars-hex'],
  ['ESCHARS-assisted v5 short', 'v5.short-baseline', 'v5.short-eschars-hex'],
  ['ESCHARS-assisted v5 1K', 'v5.1k-baseline', 'v5.1k-eschars-hex'],
  ['ESCHARS-assisted v3 1K', 'v3.1k-baseline', 'v3.1k-eschars-hex'],
  ['ESSTR trim + validate x64', 'validate64.baseline', 'validate64.esstr-trim'],
  ['ESARR map stringify', 'stringify.direct', 'stringify.esarr-map'],
  ['ESARR map copy16', 'copy16.for', 'copy16.esarr-map'],
  ['ESARR slice copy16', 'copy16.for', 'copy16.esarr-slice'],
  ['ESARR forEach emit16', 'emit16.for', 'emit16.esarr-foreach']
];
var comparisons = [];
for (var pi = 0; pi < pairs.length; pi++) {
  var p = pairs[pi];
  var base = byLane[p[1]];
  var cand = byLane[p[2]];
  if (!base || !cand) continue;
  comparisons.push({
    test: p[0],
    baseline: p[1],
    candidate: p[2],
    baselineMedianUs: base.medianUsPerOp,
    candidateMedianUs: cand.medianUsPerOp,
    candidateOverBaseline: cand.medianUsPerOp / base.medianUsPerOp,
    speedup: base.medianUsPerOp / cand.medianUsPerOp
  });
}

var evidence = {
  schemaVersion: 3,
  kind: 'esuuid-sibling-microprototype',
  capturedAt: new Date().toISOString(),
  runSession,
  transport: 'COM Tool V2 script.runFile; one isolated lane per request',
  timer: 'ESTIMER',
  target: {
    id: targetId,
    hostVersion: targetEntry.identity && targetEntry.identity.hostVersion,
    processId: targetEntry.identity && targetEntry.identity.processId
  },
  correctness,
  hashes: {
    runner: sha(fileURLToPath(import.meta.url)),
    probe: probeHash,
    estcConfig: sha(protoConfig),
    prototypeBundle: sha(proto),
    esuuidVendor: sha(esuuid),
    estimerVendor: sha(estimer),
    escharsDll: sha(escharsDll),
    escharsSource: sha(join(SCRIPTS_ROOT, 'eschars', 'src', 'index.ts')),
    esstrStringCore: sha(join(SCRIPTS_ROOT, 'esstr', 'src', 'string-core.ts')),
    esarrArrayCore: sha(join(SCRIPTS_ROOT, 'esarr', 'src', 'array-core.ts')),
    esarrEs3: sha(join(SCRIPTS_ROOT, 'esarr', 'src', 'array-es3.ts'))
  },
  rows,
  comparisons,
  failures,
  priorRunObservation: {
    monolithicProbeWatchdog: true,
    illustratorRunawayObserved: true,
    note: 'A prior monolithic prototype containing repeated long-name v5 work exceeded the V2 60-second worker watchdog and left Illustrator compute-bound. The host was terminated and relaunched; this run isolates every lane.'
  }
};

var evidenceDir = join(HERE, 'evidence');
mkdirSync(evidenceDir, { recursive: true });
var evidenceText = JSON.stringify(evidence, null, 2) + '\n';
var evidencePath = join(evidenceDir, 'run-' + runSession + '.json');
var latestPath = join(evidenceDir, 'latest.json');
var latestTmp = latestPath + '.tmp-' + runSession;
writeFileSync(evidencePath, evidenceText);
writeFileSync(latestTmp, evidenceText);
renameSync(latestTmp, latestPath);

console.log('\nESUUID sibling microprototype — Illustrator ' + correctness.illustrator + ' / ExtendScript ' + correctness.extendScript);
console.log('correctness: ' + correctness.checks + ' checks; embedded NUL via ESCHARS=' + correctness.nulBehavior);
console.log('comparison                           baseline us   candidate us   candidate/base   speedup');
for (var ci = 0; ci < comparisons.length; ci++) {
  var c = comparisons[ci];
  console.log(
    c.test.padEnd(36) + ' ' +
    c.baselineMedianUs.toFixed(3).padStart(11) + ' ' +
    c.candidateMedianUs.toFixed(3).padStart(14) + ' ' +
    c.candidateOverBaseline.toFixed(2).padStart(16) + 'x ' +
    c.speedup.toFixed(2).padStart(8) + 'x'
  );
}
if (failures.length) {
  console.log('\nfailures:');
  for (var fi = 0; fi < failures.length; fi++) {
    console.log('  ' + failures[fi].lane + ': ' + failures[fi].kind + ' / ' + failures[fi].message);
  }
}
console.log('\nevidence: ' + evidencePath);
console.log('latest:   ' + latestPath);

if (failures.length) process.exitCode = 2;
