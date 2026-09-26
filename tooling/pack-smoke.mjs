#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

var ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
var TMP = join(ROOT, 'tests', '.tmp', 'pack-smoke');
var NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
var TAR = process.env.ESUUID_TAR || 'tar';

function run(command, args, options) {
  execFileSync(command, args, {
    cwd: options && options.cwd ? options.cwd : ROOT,
    stdio: options && options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    timeout: options && options.timeoutMs ? options.timeoutMs : 300000
  });
}

function capture(command, args, cwd) {
  return execFileSync(command, args, {
    cwd: cwd || ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    timeout: 300000
  });
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

var packInfo = JSON.parse(capture(NPM, ['pack', '--pack-destination', TMP, '--json'], ROOT));
if (!Array.isArray(packInfo) || packInfo.length !== 1 || !packInfo[0].filename) {
  throw new Error('npm pack returned an unexpected payload');
}

var tgz = join(TMP, packInfo[0].filename);
if (!existsSync(tgz)) throw new Error('npm pack did not create ' + tgz);

run(TAR, ['-xzf', tgz, '-C', TMP]);
var packedRoot = join(TMP, 'package');
if (!existsSync(join(packedRoot, 'package.json'))) {
  throw new Error('packed package did not extract to the expected package/ directory');
}

run(NPM, ['install', '--ignore-scripts'], { cwd: packedRoot, timeoutMs: 300000 });
run(NPM, ['run', 'verify'], { cwd: packedRoot, timeoutMs: 300000 });

var artifactPaths = [
  'dist/ESUUID.jsx',
  'dist/ESUUID.min.jsx',
  'dist/vendor-esuuid.js',
  'dist/vendor-esuuid.min.js',
  'dist/esuuid-core.esm.mjs'
];

var artifacts = [];
for (var i = 0; i < artifactPaths.length; i++) {
  var rel = artifactPaths[i];
  var sourcePath = join(ROOT, rel);
  var packedPath = join(packedRoot, rel);
  var sourceHash = sha256(sourcePath);
  var packedHash = sha256(packedPath);
  if (sourceHash !== packedHash) {
    throw new Error(
      'packed rebuild is not byte-identical for ' + rel +
      ': source=' + sourceHash + ' packed=' + packedHash
    );
  }
  artifacts.push({
    file: rel,
    bytes: statSync(sourcePath).size,
    sha256: sourceHash
  });
}

var evidence = {
  schemaVersion: 1,
  kind: 'esuuid-pack-reproducibility',
  capturedAt: new Date().toISOString(),
  node: process.version,
  package: {
    filename: packInfo[0].filename,
    bytes: statSync(tgz).size,
    npmShasum: packInfo[0].shasum || null,
    npmIntegrity: packInfo[0].integrity || null,
    entryCount: packInfo[0].entryCount || null
  },
  install: 'npm install --ignore-scripts in clean extracted tarball',
  verification: 'npm run verify',
  byteIdentical: true,
  artifacts: artifacts
};

var evidenceDir = join(ROOT, 'evidence');
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  join(evidenceDir, 'latest-pack-reproducibility.json'),
  JSON.stringify(evidence, null, 2) + '\n'
);

console.log(
  '[pack:smoke] PASS: clean tarball install + full verify + ' +
  artifacts.length + '/' + artifacts.length + ' byte-identical rebuilt artifacts'
);
