#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PROJECT_ROOT,
  acquireLeaseWithRetry,
  assertExtendScriptArtifactSafe,
  discoverIllustratorTarget,
  parseCommonOptions,
  releaseLease,
  resultValue,
  runFile,
  sha256File
} from '../tooling/comtool-v2.mjs';

var config = parseCommonOptions(process.argv.slice(2));
var EXPECTED_LIVE_CHECKS = 54;
var probe = join(PROJECT_ROOT, 'tests', 'esuuid-live-probe.jsx');
var esuuidReadable = join(PROJECT_ROOT, 'dist', 'ESUUID.jsx');
var esuuidMinified = join(PROJECT_ROOT, 'dist', 'ESUUID.min.jsx');
var esrandVendor = process.env.ESUUID_ESRAND_VENDOR ||
  join(PROJECT_ROOT, '..', 'esrand', 'dist', 'vendor-esrand.js');
if (!existsSync(probe)) throw new Error('Live probe not found: ' + probe);
assertExtendScriptArtifactSafe(
  esuuidReadable,
  'ESUUID readable artifact'
);
assertExtendScriptArtifactSafe(
  esuuidMinified,
  'ESUUID minified artifact'
);
assertExtendScriptArtifactSafe(
  esrandVendor,
  'ESRAND vendor artifact'
);

var targetEntry = discoverIllustratorTarget(config);
var targetId = targetEntry.target.id;
var leaseId = null;
var envelope = null;
var hash = sha256File(probe);
var requestId = 'esuuid-live-' + hash.slice(0, 16) + '-' + Date.now().toString(36);

try {
  leaseId = acquireLeaseWithRetry(config, targetId, 180000);
  envelope = runFile(config, {
    leaseId: leaseId,
    requestId: requestId,
    path: probe,
    sha256: hash,
    targetId: targetId,
    timeoutMs: 300000
  });
} finally {
  if (leaseId) releaseLease(config, targetId, leaseId);
}

var value = resultValue(envelope);
if (typeof value !== 'string') {
  throw new Error('ESUUID live probe returned non-string result: ' + JSON.stringify(value));
}

var match = /^ESUUID_LIVE_PASS\|(\d+)\|Illustrator=([^|]+)\|ExtendScript=(.+)$/.exec(value);
if (!match) throw new Error('ESUUID live probe did not report PASS: ' + value);

var checks = Number(match[1]);
if (!Number.isFinite(checks) || checks !== EXPECTED_LIVE_CHECKS) {
  throw new Error(
    'ESUUID live probe check-count contract changed: expected ' +
    EXPECTED_LIVE_CHECKS + ', got ' + checks
  );
}

var evidence = {
  schemaVersion: 1,
  kind: 'esuuid-live-verify',
  capturedAt: new Date().toISOString(),
  transport: 'COM Tool V2 script.runFile',
  pipe: config.pipe,
  target: {
    id: targetId,
    host: targetEntry.target.host,
    processId: targetEntry.identity && targetEntry.identity.processId,
    hostVersion: targetEntry.identity && targetEntry.identity.hostVersion,
    adapterVersion: targetEntry.identity && targetEntry.identity.adapterVersion
  },
  requestId: requestId,
  probeSha256: hash,
  artifacts: {
    esuuidReadableSha256: sha256File(esuuidReadable),
    esuuidMinifiedSha256: sha256File(esuuidMinified),
    esrandVendorSha256: sha256File(esrandVendor)
  },
  checks: checks,
  illustrator: match[2],
  extendScript: match[3],
  result: value,
  timing: envelope.timing || null,
  targetState: envelope.targetState || null
};

var evidenceDir = join(PROJECT_ROOT, 'evidence');
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  join(evidenceDir, 'latest-live-verify.json'),
  JSON.stringify(evidence, null, 2) + '\n'
);

console.log(
  '[live-verify] ' + checks + '/' + checks +
  ' checks passed via COM Tool V2 script.runFile; Illustrator ' + match[2] +
  '; ExtendScript ' + match[3] +
  '; target=' + targetId
);
