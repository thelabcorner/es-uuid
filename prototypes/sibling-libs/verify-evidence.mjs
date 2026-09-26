#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

var HERE = dirname(fileURLToPath(import.meta.url));
var PROJECT_ROOT = dirname(dirname(HERE));
var SCRIPTS_ROOT = dirname(PROJECT_ROOT);
var EVIDENCE = join(HERE, 'evidence');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function fail(message) {
  throw new Error(message);
}
function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(label + ' mismatch: actual=' + actual + ' expected=' + expected);
  }
}
function assertFileHash(path, expected, label) {
  assertEqual(sha256(path), expected, label);
}

var aggregatePath = join(EVIDENCE, 'aggregate.json');
var aggregate = readJson(aggregatePath);

if (aggregate.kind !== 'esuuid-sibling-microprototype-aggregate') {
  fail('unexpected aggregate kind: ' + aggregate.kind);
}
if (!Array.isArray(aggregate.mainReplicates) || aggregate.mainReplicates.length !== 3) {
  fail('expected exactly 3 main replicates');
}
if (!Array.isArray(aggregate.nativeEsstrReplicates) || aggregate.nativeEsstrReplicates.length !== 3) {
  fail('expected exactly 3 native ESSTR replicates');
}

for (var i = 0; i < aggregate.mainReplicates.length; i++) {
  var main = aggregate.mainReplicates[i];
  assertFileHash(join(EVIDENCE, main.file), main.sha256, 'main evidence ' + main.file);
}
for (i = 0; i < aggregate.nativeEsstrReplicates.length; i++) {
  var nativeRep = aggregate.nativeEsstrReplicates[i];
  assertFileHash(join(EVIDENCE, nativeRep.file), nativeRep.sha256, 'native evidence ' + nativeRep.file);
}

var mainFiles = {
  runner: join(HERE, 'run-microbench.mjs'),
  probe: join(HERE, 'lane-probe.jsx'),
  estcConfig: join(HERE, 'estc.config.mjs'),
  prototypeBundle: join(HERE, 'dist', 'sibling-prototype.jsx'),
  esuuidVendor: join(PROJECT_ROOT, 'dist', 'vendor-esuuid.js'),
  estimerVendor: join(SCRIPTS_ROOT, 'estimer', 'dist', 'vendor-estimer.js'),
  escharsDll: join(SCRIPTS_ROOT, 'eschars', 'native', 'bin', 'ESChars.dll'),
  escharsSource: join(SCRIPTS_ROOT, 'eschars', 'src', 'index.ts'),
  esstrStringCore: join(SCRIPTS_ROOT, 'esstr', 'src', 'string-core.ts'),
  esarrArrayCore: join(SCRIPTS_ROOT, 'esarr', 'src', 'array-core.ts'),
  esarrEs3: join(SCRIPTS_ROOT, 'esarr', 'src', 'array-es3.ts')
};
for (var key of Object.keys(mainFiles)) {
  assertFileHash(mainFiles[key], aggregate.hashes.main[key], 'main hash ' + key);
}

var nativeFiles = {
  runner: join(HERE, 'run-esstr-native.mjs'),
  probe: join(HERE, 'esstr-native-probe.jsx'),
  estcConfig: join(HERE, 'estc.config.mjs'),
  prototypeBundle: join(HERE, 'dist', 'sibling-prototype.jsx'),
  esstrTrimDll: join(SCRIPTS_ROOT, 'esstr', 'native', 'bin', 'ESSTRTrim.dll'),
  esstrStringCore: join(SCRIPTS_ROOT, 'esstr', 'src', 'string-core.ts'),
  esstrNativeLane: join(SCRIPTS_ROOT, 'esstr', 'src', 'native-lane.ts'),
  esuuidVendor: join(PROJECT_ROOT, 'dist', 'vendor-esuuid.js'),
  estimerVendor: join(SCRIPTS_ROOT, 'estimer', 'dist', 'vendor-estimer.js')
};
for (key of Object.keys(nativeFiles)) {
  assertFileHash(nativeFiles[key], aggregate.hashes.nativeEsstr[key], 'native hash ' + key);
}

for (i = 0; i < aggregate.correctness.checksEach.length; i++) {
  assertEqual(aggregate.correctness.checksEach[i], 16, 'correctness checks run ' + (i + 1));
  assertEqual(aggregate.correctness.failuresEach[i], 0, 'benchmark failures run ' + (i + 1));
  assertEqual(
    aggregate.correctness.escharsEmbeddedNulBehaviorEach[i],
    'mismatch',
    'ESCHARS embedded-NUL behavior run ' + (i + 1)
  );
}

if (!Array.isArray(aggregate.comparisons) || aggregate.comparisons.length === 0) {
  fail('aggregate has no comparisons');
}
for (i = 0; i < aggregate.comparisons.length; i++) {
  var comparison = aggregate.comparisons[i];
  if (!(comparison.candidateOverBaselineMedian > 1)) {
    fail(
      'RESULTS decision is stale: replicated candidate is not slower for ' +
      comparison.test + ' (' + comparison.candidateOverBaselineMedian + 'x)'
    );
  }
}
if (!(aggregate.esstrNative.pureOverBaselineMedian > 1)) {
  fail('RESULTS decision is stale: ESSTR pure trim is not slower than baseline');
}
if (!(aggregate.esstrNative.nativeOverBaselineMedian > 1)) {
  fail('RESULTS decision is stale: ESSTR native trim is not slower than baseline');
}
if (!(aggregate.esstrNative.nativeOverPureMedian > 1)) {
  fail('RESULTS decision is stale: ESSTR native trim is not slower than pure trim');
}

console.log(
  'PASS: sibling evidence verified — 3 main + 3 native replicates, ' +
  Object.keys(mainFiles).length + ' main hash locks, ' +
  Object.keys(nativeFiles).length + ' native hash locks, ' +
  aggregate.comparisons.length + ' replicated comparisons'
);
