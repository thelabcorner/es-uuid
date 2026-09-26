#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

var ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
var TMP = join(
  ROOT,
  'tests',
  '.tmp',
  'pack-smoke-' + process.pid + '-' + Date.now().toString(36)
);
var TAR = process.env.ESUUID_TAR || 'tar';
var npmCliCandidates = [
  process.env.npm_execpath || '',
  join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
];
var NPM_CLI = null;
for (var ni = 0; ni < npmCliCandidates.length; ni++) {
  if (
    npmCliCandidates[ni] &&
    /\.(?:c|m)?js$/i.test(npmCliCandidates[ni]) &&
    existsSync(npmCliCandidates[ni])
  ) {
    NPM_CLI = npmCliCandidates[ni];
    break;
  }
}
if (!NPM_CLI) {
  throw new Error(
    'Could not resolve npm-cli.js; run through npm or provide a standard Node/npm installation'
  );
}

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

function runNpm(args, options) {
  run(process.execPath, [NPM_CLI].concat(args), options);
}

function captureNpm(args, cwd) {
  return capture(process.execPath, [NPM_CLI].concat(args), cwd);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

runNpm(['run', 'build'], { cwd: ROOT, timeoutMs: 300000 });
var packInfo = JSON.parse(
  captureNpm(['pack', '--ignore-scripts', '--pack-destination', TMP, '--json'], ROOT)
);
if (!Array.isArray(packInfo) || packInfo.length !== 1 || !packInfo[0].filename) {
  throw new Error('npm pack returned an unexpected payload');
}

var tgz = join(TMP, packInfo[0].filename);
if (!existsSync(tgz)) throw new Error('npm pack did not create ' + tgz);
var tgzBytes = statSync(tgz).size;

run(TAR, ['-xzf', tgz, '-C', TMP]);
var packedRoot = join(TMP, 'package');
if (!existsSync(join(packedRoot, 'package.json'))) {
  throw new Error('packed package did not extract to the expected package/ directory');
}

runNpm(['install', '--ignore-scripts'], { cwd: packedRoot, timeoutMs: 300000 });

// The package ships its COM Tool V2 live-control helper. Import it from the
// extracted tarball after installing only declared dependencies so a hidden
// sibling-workspace ESTC dependency cannot pass unnoticed.
run(process.execPath, [
  '--input-type=module',
  '-e',
  [
    "const m = await import('./tooling/comtool-v2.mjs');",
    "if (typeof m.parseCommonOptions !== 'function' || typeof m.runFile !== 'function')",
    "  throw new Error('packed COM Tool V2 helper exports are incomplete');"
  ].join('\n')
], { cwd: packedRoot, timeoutMs: 300000 });

runNpm(['run', 'verify'], { cwd: packedRoot, timeoutMs: 300000 });

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
    bytes: tgzBytes,
    npmShasum: packInfo[0].shasum || null,
    npmIntegrity: packInfo[0].integrity || null,
    entryCount: packInfo[0].entryCount || null
  },
  install: 'npm install --ignore-scripts in clean extracted tarball',
  toolingImport: 'tooling/comtool-v2.mjs imports from declared pinned ESTC dependency',
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

// Prove that writing the pack evidence itself cannot perturb the package
// payload. This specifically guards against accidentally adding
// latest-pack-reproducibility.json to package.json#files and creating a
// self-referential tarball hash.
var repackInfo = JSON.parse(
  captureNpm(['pack', '--ignore-scripts', '--pack-destination', TMP, '--json'], ROOT)
);
if (!Array.isArray(repackInfo) || repackInfo.length !== 1) {
  throw new Error('second npm pack returned an unexpected payload');
}
if (
  repackInfo[0].shasum !== packInfo[0].shasum ||
  repackInfo[0].integrity !== packInfo[0].integrity
) {
  throw new Error(
    'npm tarball is not stable after writing pack evidence; ' +
    'exclude generated pack evidence from the package payload'
  );
}
rmSync(TMP, { recursive: true, force: true });

console.log(
  '[pack:smoke] PASS: clean tarball install + shipped live-tooling import + full verify + ' +
  artifacts.length + '/' + artifacts.length +
  ' byte-identical rebuilt artifacts + stable second pack'
);
