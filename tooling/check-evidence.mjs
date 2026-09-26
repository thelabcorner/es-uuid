#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

var ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
var SCRIPTS_ROOT = dirname(ROOT);
var EXPECTED_LIVE_CHECKS = 54;

function fail(message) {
  throw new Error('[evidence:check] ' + message);
}

function readJson(path) {
  if (!existsSync(path)) fail('missing evidence file: ' + path);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(path) {
  if (!existsSync(path)) fail('missing artifact: ' + path);
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) fail(label + ' mismatch: expected ' + expected + ', got ' + actual);
}

function assertHash(label, path, expected) {
  if (!expected) fail(label + ' hash missing from evidence');
  assertEqual(label + ' sha256', sha256(path), expected);
}

function commaInteger(value) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fixed3(value) {
  var parts = Number(value).toFixed(3).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function requireText(haystack, needle, label) {
  if (haystack.indexOf(needle) === -1) fail(label + ' is stale or missing: ' + needle);
}

var livePath = join(ROOT, 'evidence', 'latest-live-verify.json');
var benchPath = join(ROOT, 'evidence', 'latest-live-benchmark.json');
var packPath = join(ROOT, 'evidence', 'latest-pack-reproducibility.json');
var live = readJson(livePath);
var bench = readJson(benchPath);
var pack = readJson(packPath);
var pkg = readJson(join(ROOT, 'package.json'));

if (
  Array.isArray(pkg.files) &&
  pkg.files.indexOf('evidence/latest-pack-reproducibility.json') !== -1
) {
  fail('pack reproducibility evidence must not be included in the npm package payload');
}

assertEqual('live check count', live.checks, EXPECTED_LIVE_CHECKS);
assertEqual('live result', live.result,
  'ESUUID_LIVE_PASS|' + EXPECTED_LIVE_CHECKS +
  '|Illustrator=' + live.illustrator +
  '|ExtendScript=' + live.extendScript
);

var readable = join(ROOT, 'dist', 'ESUUID.jsx');
var minified = join(ROOT, 'dist', 'ESUUID.min.jsx');
var vendor = join(ROOT, 'dist', 'vendor-esuuid.js');
var vendorMin = join(ROOT, 'dist', 'vendor-esuuid.min.js');
var esm = join(ROOT, 'dist', 'esuuid-core.esm.mjs');
var esrand = process.env.ESUUID_ESRAND_VENDOR ||
  join(SCRIPTS_ROOT, 'esrand', 'dist', 'vendor-esrand.js');
var estimer = process.env.ESUUID_ESTIMER_VENDOR ||
  join(SCRIPTS_ROOT, 'estimer', 'dist', 'vendor-estimer.js');

assertHash('live ESUUID readable', readable, live.artifacts && live.artifacts.esuuidReadableSha256);
assertHash('live ESUUID minified', minified, live.artifacts && live.artifacts.esuuidMinifiedSha256);
assertHash('live ESRAND vendor', esrand, live.artifacts && live.artifacts.esrandVendorSha256);

assertHash('benchmark ESUUID vendor', vendor, bench.artifacts && bench.artifacts.esuuidVendorSha256);
assertHash('benchmark ESRAND vendor', esrand, bench.artifacts && bench.artifacts.esrandVendorSha256);
assertHash('benchmark ESTIMER vendor', estimer, bench.artifacts && bench.artifacts.estimerVendorSha256);

if (pack.byteIdentical !== true) fail('packed rebuild evidence is not byte-identical');
if (!Array.isArray(pack.artifacts) || pack.artifacts.length !== 5) {
  fail('packed rebuild evidence must contain exactly 5 artifacts');
}
for (var pi = 0; pi < pack.artifacts.length; pi++) {
  var packedArtifact = pack.artifacts[pi];
  assertHash(
    'packed rebuild ' + packedArtifact.file,
    join(ROOT, packedArtifact.file),
    packedArtifact.sha256
  );
}

if (bench.rounds !== 3) fail('benchmark evidence must contain 3 rounds');
if (!Array.isArray(bench.summary) || bench.summary.length !== 9) {
  fail('benchmark evidence must contain exactly 9 summary lanes');
}
for (var i = 0; i < bench.summary.length; i++) {
  if (bench.summary[i].rounds !== 3) fail(bench.summary[i].lane + ' benchmark rounds drifted');
  if (bench.summary[i].sampleCountPerRound !== 9) fail(bench.summary[i].lane + ' sample count drifted');
  if (bench.summary[i].rejectedMax !== 0) fail(bench.summary[i].lane + ' contains rejected samples');
}

var readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
var measured = readFileSync(join(ROOT, 'MEASURED-FACTS.md'), 'utf8');

var sizes = [
  ['dist/ESUUID.jsx', readable],
  ['dist/ESUUID.min.jsx', minified],
  ['dist/vendor-esuuid.js', vendor],
  ['dist/vendor-esuuid.min.js', vendorMin],
  ['dist/esuuid-core.esm.mjs', esm]
];
for (i = 0; i < sizes.length; i++) {
  var size = statSync(sizes[i][1]).size;
  var formatted = commaInteger(size);
  requireText(
    readme,
    '| `' + sizes[i][0] + '` | ' + formatted + ' bytes |',
    'README artifact size for ' + sizes[i][0]
  );
  requireText(
    measured,
    '| `' + sizes[i][0] + '` | ' + formatted + ' |',
    'MEASURED-FACTS artifact size for ' + sizes[i][0]
  );
}

requireText(readme, EXPECTED_LIVE_CHECKS + '/' + EXPECTED_LIVE_CHECKS + ' live checks', 'README live count');
requireText(measured, '- Live checks: ' + EXPECTED_LIVE_CHECKS + '/' + EXPECTED_LIVE_CHECKS, 'MEASURED-FACTS live count');
requireText(measured, '- Probe SHA-256: `' + live.probeSha256 + '`', 'MEASURED-FACTS probe hash');

var rowNames = {
  'v4-esrand': ['v4, ESRAND entropy', 'v4 + ESRAND'],
  'v4-math': ['v4, Math.random fallback', 'v4 + Math.random fallback'],
  'v4-explicit': ['v4, explicit bytes', 'v4 explicit bytes'],
  'v7-esrand': ['v7, ESRAND entropy', 'v7 + ESRAND'],
  'v7-math': ['v7, Math.random fallback', 'v7 + Math.random fallback'],
  'v7-explicit': ['v7, explicit bytes', 'v7 explicit bytes/time/sequence'],
  'parse': ['parse', 'parse'],
  'stringify': ['stringify', 'stringify'],
  'v5': ['v5', 'v5']
};

for (i = 0; i < bench.summary.length; i++) {
  var row = bench.summary[i];
  var names = rowNames[row.lane];
  if (!names) fail('unknown benchmark lane in evidence: ' + row.lane);
  var ops = commaInteger(row.opsPerSecond);
  var readmeRow =
    '| ' + names[0] + ' | ' +
    fixed3(row.medianUsPerOp) + ' | ' +
    fixed3(row.minUsPerOp) + ' | ' +
    fixed3(row.p95UsPerOp) + ' | ' +
    ops + ' |';
  var measuredRow =
    '| ' + names[1] + ' | ' +
    fixed3(row.medianUsPerOp) + ' | ' +
    fixed3(row.p95UsPerOp) + ' | ' +
    ops + ' |';
  requireText(readme, readmeRow, 'README benchmark row ' + row.lane);
  requireText(measured, measuredRow, 'MEASURED-FACTS benchmark row ' + row.lane);
}

console.log(
  '[evidence:check] PASS: ' + EXPECTED_LIVE_CHECKS + '/' + EXPECTED_LIVE_CHECKS +
  ' live contract, 9 benchmark lanes, packed reproducibility, artifact hashes, sizes, and docs are synchronized'
);
