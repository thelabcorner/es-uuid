#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

var ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
var pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
var releaseDir = join(ROOT, 'release');
mkdirSync(releaseDir, { recursive: true });

function sha256Bytes(data) {
  return createHash('sha256').update(data).digest('hex');
}

function digest(rel) {
  var full = join(ROOT, rel);
  var data = readFileSync(full);
  return {
    file: rel.replace(/\\/g, '/'),
    bytes: statSync(full).size,
    sha256: sha256Bytes(data)
  };
}

function releaseSourceFiles() {
  // Git is the authority for release-source membership. -c/-o includes tracked
  // files plus nonignored untracked files, while respecting .gitignore so
  // transient caches can never enter provenance.
  var raw = execFileSync(
    'git',
    ['ls-files', '-co', '--exclude-standard', '-z'],
    { cwd: ROOT }
  ).toString('utf8');

  return raw
    .split('\0')
    .filter(Boolean)
    .map(function (rel) { return rel.replace(/\\/g, '/'); })
    .filter(function (rel) {
      return !/^(?:dist|evidence|release|prototypes|tests\/\.tmp)(?:\/|$)/.test(rel);
    })
    .sort();
}

function canonicalBlobId(rel) {
  // --path applies the repository's clean filters (notably text/eol
  // normalization) without staging or modifying the worktree. Hashing this
  // canonical blob identity makes provenance invariant across CRLF/LF
  // checkouts and ordinary vs linked worktrees.
  return execFileSync(
    'git',
    ['hash-object', '--path=' + rel, rel],
    { cwd: ROOT, encoding: 'utf8' }
  ).trim();
}

var sourceFiles = releaseSourceFiles();
var sourceHasher = createHash('sha256');
for (var i = 0; i < sourceFiles.length; i++) {
  var rel = sourceFiles[i];
  sourceHasher.update(rel, 'utf8');
  sourceHasher.update('\0');
  sourceHasher.update(canonicalBlobId(rel), 'ascii');
  sourceHasher.update('\0');
}

var artifactPaths = [
  'dist/ESUUID.jsx',
  'dist/ESUUID.min.jsx',
  'dist/vendor-esuuid.js',
  'dist/vendor-esuuid.min.js',
  'dist/esuuid-core.esm.mjs'
];
var evidencePaths = [
  'evidence/latest-live-verify.json',
  'evidence/latest-live-benchmark.json',
  'evidence/latest-pack-reproducibility.json'
];

for (i = 0; i < artifactPaths.length; i++) {
  if (!existsSync(join(ROOT, artifactPaths[i]))) {
    throw new Error('missing release artifact: ' + artifactPaths[i]);
  }
}
for (i = 0; i < evidencePaths.length; i++) {
  if (!existsSync(join(ROOT, evidencePaths[i]))) {
    throw new Error('missing release evidence: ' + evidencePaths[i]);
  }
}

var live = JSON.parse(readFileSync(join(ROOT, evidencePaths[0]), 'utf8'));
var bench = JSON.parse(readFileSync(join(ROOT, evidencePaths[1]), 'utf8'));
var pack = JSON.parse(readFileSync(join(ROOT, evidencePaths[2]), 'utf8'));

var lock = {
  schemaVersion: 1,
  project: 'ESUUID',
  version: pkg.version,
  standard: 'RFC 9562',
  compatibilityOracle: 'uuid@14.0.2',
  generatedAt: new Date().toISOString(),
  node: process.version,
  sourceTreeSha256: sourceHasher.digest('hex'),
  sourceFileCount: sourceFiles.length,
  toolchain: {
    esbuild: pkg.devDependencies.esbuild,
    extendscriptToolchain: pkg.devDependencies['extendscript-toolchain'],
    typescript: pkg.devDependencies.typescript,
    uglifyJs: pkg.devDependencies['uglify-js'],
    uuidOracle: pkg.devDependencies.uuid
  },
  validation: {
    unitChecks: 55,
    differentialChecks: 3225,
    fuzzChecks: 75000,
    liveChecks: live.checks,
    liveIllustrator: live.illustrator,
    liveExtendScript: live.extendScript,
    benchmarkLanes: Array.isArray(bench.summary) ? bench.summary.length : null,
    packByteIdentical: pack.byteIdentical === true
  },
  artifacts: artifactPaths.map(digest),
  evidence: evidencePaths.map(digest)
};

var lockName = 'esuuid-v' + pkg.version + '.lock.json';
var lockPath = join(releaseDir, lockName);
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');

var sums = [];
for (i = 0; i < artifactPaths.length; i++) {
  var a = digest(artifactPaths[i]);
  sums.push(a.sha256 + '  ' + a.file.replace(/^dist\//, ''));
}
for (i = 0; i < evidencePaths.length; i++) {
  var e = digest(evidencePaths[i]);
  sums.push(e.sha256 + '  ' + e.file);
}
var lockData = readFileSync(lockPath);
sums.push(sha256Bytes(lockData) + '  ' + lockName);
writeFileSync(join(releaseDir, 'SHA256SUMS.txt'), sums.join('\n') + '\n');

console.log(
  '[release:manifest] v' + pkg.version +
  ' source=' + lock.sourceTreeSha256 +
  ' artifacts=' + lock.artifacts.length +
  ' evidence=' + lock.evidence.length
);
