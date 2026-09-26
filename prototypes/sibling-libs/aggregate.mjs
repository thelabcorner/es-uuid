#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

var HERE = dirname(fileURLToPath(import.meta.url));
var EVIDENCE = join(HERE, 'evidence');
var mainFiles = ['final-a.json', 'final-b.json', 'final-c.json'];
var nativeFiles = ['native-a.json', 'native-b.json', 'native-c.json'];

function read(name) {
  return JSON.parse(readFileSync(join(EVIDENCE, name), 'utf8'));
}
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function median(xs) {
  var s = xs.slice().sort(function (a, b) { return a - b; });
  return s[Math.floor(s.length / 2)];
}
function min(xs) {
  var m = xs[0];
  for (var i = 1; i < xs.length; i++) if (xs[i] < m) m = xs[i];
  return m;
}
function max(xs) {
  var m = xs[0];
  for (var i = 1; i < xs.length; i++) if (xs[i] > m) m = xs[i];
  return m;
}
function unique(values) {
  var out = [];
  for (var i = 0; i < values.length; i++) {
    if (out.indexOf(values[i]) === -1) out.push(values[i]);
  }
  return out;
}
function requireSame(runs, getter, label) {
  var values = unique(runs.map(getter));
  if (values.length !== 1) {
    throw new Error(label + ' drifted across replicates: ' + values.join(', '));
  }
  return values[0];
}
function evidenceDigest(name) {
  return sha256(join(EVIDENCE, name));
}

var mainRuns = mainFiles.map(read);
var nativeRuns = nativeFiles.map(read);

var mainHashFields = [
  'runner',
  'probe',
  'estcConfig',
  'prototypeBundle',
  'esuuidVendor',
  'estimerVendor',
  'escharsDll',
  'escharsSource',
  'esstrStringCore',
  'esarrArrayCore',
  'esarrEs3'
];
for (var hi = 0; hi < mainHashFields.length; hi++) {
  var field = mainHashFields[hi];
  requireSame(mainRuns, function (r) { return r.hashes[field]; }, 'main hash ' + field);
}
requireSame(mainRuns, function (r) { return r.target.id; }, 'main target');
requireSame(mainRuns, function (r) { return r.correctness.checks; }, 'main correctness count');
requireSame(mainRuns, function (r) { return r.correctness.nulBehavior; }, 'main NUL behavior');

for (var mi = 0; mi < mainRuns.length; mi++) {
  if (mainRuns[mi].correctness.checks !== 16) {
    throw new Error(mainFiles[mi] + ' must contain exactly 16 correctness checks');
  }
  if (mainRuns[mi].correctness.nulBehavior !== 'mismatch') {
    throw new Error(mainFiles[mi] + ' unexpectedly changed ESCHARS NUL behavior');
  }
  if (mainRuns[mi].failures && mainRuns[mi].failures.length) {
    throw new Error(mainFiles[mi] + ' contains benchmark failures');
  }
}

var nativeHashFields = [
  'runner',
  'probe',
  'estcConfig',
  'prototypeBundle',
  'esstrTrimDll',
  'esstrStringCore',
  'esstrNativeLane',
  'esuuidVendor',
  'estimerVendor'
];
for (hi = 0; hi < nativeHashFields.length; hi++) {
  field = nativeHashFields[hi];
  requireSame(nativeRuns, function (r) { return r.hashes[field]; }, 'native hash ' + field);
}
requireSame(nativeRuns, function (r) { return r.target.id; }, 'native target');
if (mainRuns[0].target.id !== nativeRuns[0].target.id) {
  throw new Error('main/native target generation mismatch');
}
for (var ni = 0; ni < nativeRuns.length; ni++) {
  for (var laneName of ['baseline', 'pure', 'native']) {
    var lane = nativeRuns[ni][laneName];
    if (!lane || lane.count !== 9 || lane.rejected !== 0 || !(lane.medianUs > 0)) {
      throw new Error(nativeFiles[ni] + ' invalid ' + laneName + ' timing lane');
    }
  }
}

var tests = mainRuns[0].comparisons.map(function (x) { return x.test; });
var comparisons = [];
for (var ti = 0; ti < tests.length; ti++) {
  var test = tests[ti];
  var cs = mainRuns.map(function (r) {
    return r.comparisons.filter(function (x) { return x.test === test; })[0];
  });
  if (cs.some(function (x) { return !x; })) throw new Error('missing comparison ' + test);
  var ratios = cs.map(function (x) { return x.candidateOverBaseline; });
  var bases = cs.map(function (x) { return x.baselineMedianUs; });
  var candidates = cs.map(function (x) { return x.candidateMedianUs; });
  var ratioMedian = median(ratios);
  comparisons.push({
    test: test,
    baseline: cs[0].baseline,
    candidate: cs[0].candidate,
    baselineMedianUsAcrossRuns: median(bases),
    candidateMedianUsAcrossRuns: median(candidates),
    candidateOverBaselineMedian: ratioMedian,
    candidateOverBaselineMin: min(ratios),
    candidateOverBaselineMax: max(ratios),
    medianSpeedup: 1 / ratioMedian,
    medianDeltaPercent: (ratioMedian - 1) * 100,
    ratiosByRun: ratios
  });
}

var pureRatios = nativeRuns.map(function (r) { return r.pureOverBaseline; });
var nativeRatios = nativeRuns.map(function (r) { return r.nativeOverBaseline; });
var nativeOverPure = nativeRuns.map(function (r) { return r.nativeOverPure; });

var out = {
  schemaVersion: 2,
  kind: 'esuuid-sibling-microprototype-aggregate',
  generatedAt: new Date().toISOString(),
  environment: {
    illustrator: mainRuns[0].correctness.illustrator,
    extendScript: mainRuns[0].correctness.extendScript,
    target: mainRuns[0].target,
    transport: 'COM Tool V2 script.runFile; one isolated lane per request',
    timer: 'ESTIMER'
  },
  mainReplicates: mainFiles.map(function (name, index) {
    return {
      file: name,
      sha256: evidenceDigest(name),
      capturedAt: mainRuns[index].capturedAt,
      runSession: mainRuns[index].runSession
    };
  }),
  nativeEsstrReplicates: nativeFiles.map(function (name, index) {
    return {
      file: name,
      sha256: evidenceDigest(name),
      capturedAt: nativeRuns[index].capturedAt,
      runSession: nativeRuns[index].runSession
    };
  }),
  correctness: {
    checksEach: mainRuns.map(function (r) { return r.correctness.checks; }),
    failuresEach: mainRuns.map(function (r) { return r.failures ? r.failures.length : 0; }),
    escharsEmbeddedNulBehaviorEach: mainRuns.map(function (r) { return r.correctness.nulBehavior; })
  },
  hashes: {
    main: mainRuns[0].hashes,
    nativeEsstr: nativeRuns[0].hashes
  },
  comparisons: comparisons,
  esstrNative: {
    workload: nativeRuns[0].workload,
    baselineMedianUsAcrossRuns: median(nativeRuns.map(function (r) { return r.baseline.medianUs; })),
    pureMedianUsAcrossRuns: median(nativeRuns.map(function (r) { return r.pure.medianUs; })),
    nativeMedianUsAcrossRuns: median(nativeRuns.map(function (r) { return r.native.medianUs; })),
    pureOverBaselineMedian: median(pureRatios),
    pureOverBaselineMin: min(pureRatios),
    pureOverBaselineMax: max(pureRatios),
    nativeOverBaselineMedian: median(nativeRatios),
    nativeOverBaselineMin: min(nativeRatios),
    nativeOverBaselineMax: max(nativeRatios),
    nativeOverPureMedian: median(nativeOverPure),
    nativeOverPureMin: min(nativeOverPure),
    nativeOverPureMax: max(nativeOverPure)
  }
};

writeFileSync(join(EVIDENCE, 'aggregate.json'), JSON.stringify(out, null, 2) + '\n');

console.log(
  'ESUUID sibling microprototype aggregate — ' +
  mainRuns.length + ' locked main replicates + ' +
  nativeRuns.length + ' locked ESSTR-native replicates'
);
console.log('test                                 cand/base median   range           result');
for (var ci = 0; ci < comparisons.length; ci++) {
  var c = comparisons[ci];
  console.log(
    c.test.padEnd(36) + ' ' +
    c.candidateOverBaselineMedian.toFixed(2).padStart(7) + 'x      ' +
    (c.candidateOverBaselineMin.toFixed(2) + '-' + c.candidateOverBaselineMax.toFixed(2)).padStart(11) + 'x   ' +
    (c.candidateOverBaselineMedian < 1 ? 'faster' : 'slower')
  );
}
console.log('');
console.log(
  'ESSTR pure trim / baseline median: ' +
  out.esstrNative.pureOverBaselineMedian.toFixed(2) + 'x'
);
console.log(
  'ESSTR forced-native trim / baseline median: ' +
  out.esstrNative.nativeOverBaselineMedian.toFixed(2) + 'x'
);
console.log(
  'ESSTR forced-native / pure trim median: ' +
  out.esstrNative.nativeOverPureMedian.toFixed(2) + 'x'
);
console.log('evidence: ' + join(EVIDENCE, 'aggregate.json'));
