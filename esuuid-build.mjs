#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { buildSync } from 'esbuild';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

var ROOT = dirname(fileURLToPath(import.meta.url));
var SCRIPTS = dirname(ROOT);
var DIST = join(ROOT, 'dist');
var PACKAGED_ESTC = join(ROOT, 'node_modules', 'extendscript-toolchain', 'bin', 'estc.mjs');
var WORKSPACE_ESTC = join(SCRIPTS, 'extendscript-toolchain', 'bin', 'estc.mjs');
// Reproducible builds use the package.json-pinned ESTC dependency. A mutable
// sibling checkout is used only when explicitly requested by a toolkit
// developer; otherwise a dirty parent workspace cannot silently change output.
var ESTC = process.env.ESUUID_ESTC || (
  process.env.ESUUID_USE_WORKSPACE_ESTC === '1' ? WORKSPACE_ESTC : PACKAGED_ESTC
);
var MINIFIER = join(ROOT, 'tooling', 'minifier', 'minify-jsx.py');
var MIN_CONFIG = join(ROOT, 'tooling', 'minifier', 'conservative.json');
function resolvePython(envName) {
  if (process.env[envName]) return { command: process.env[envName], prefix: [] };
  var candidates = process.platform === 'win32'
    ? [
        { command: 'py.exe', prefix: ['-3'] },
        { command: 'python.exe', prefix: [] },
        { command: 'python3.exe', prefix: [] }
      ]
    : [
        { command: 'python3', prefix: [] },
        { command: 'python', prefix: [] }
      ];
  for (var i = 0; i < candidates.length; i++) {
    var probe = spawnSync(candidates[i].command, candidates[i].prefix.concat(['--version']), {
      cwd: ROOT,
      stdio: 'ignore'
    });
    if (!probe.error && probe.status === 0) return candidates[i];
  }
  throw new Error('Python 3 interpreter not found; set ' + envName + ' to an executable path');
}
var PYTHON = resolvePython('ESUUID_PYTHON');
var BUILD_LOCK = join(ROOT, '.esuuid-build.lock');

function sleepSync(ms) {
  var cell = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(cell, 0, 0, ms);
}

function pidAlive(pid) {
  if (!(pid > 0)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function acquireBuildLock() {
  var deadline = Date.now() + 300000;
  while (true) {
    try {
      var fd = openSync(BUILD_LOCK, 'wx');
      writeFileSync(fd, String(process.pid), 'utf8');
      closeSync(fd);
      return;
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
      var owner = 0;
      try { owner = Number(readFileSync(BUILD_LOCK, 'utf8')); } catch (_) {}
      if (!pidAlive(owner)) {
        try { unlinkSync(BUILD_LOCK); } catch (_) {}
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for concurrent ESUUID build process ' + owner);
      }
      sleepSync(250);
    }
  }
}

function releaseBuildLock() {
  try {
    var owner = Number(readFileSync(BUILD_LOCK, 'utf8'));
    if (owner === process.pid) unlinkSync(BUILD_LOCK);
  } catch (_) {}
}

acquireBuildLock();
process.on('exit', releaseBuildLock);

mkdirSync(DIST, { recursive: true });

buildSync({
  entryPoints: [join(ROOT, 'src', 'index.ts')],
  outfile: join(DIST, 'esuuid-core.esm.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2019',
  logLevel: 'warning'
});

if (process.argv.indexOf('--node-only') !== -1) {
  console.log('[esuuid-build] dist/esuuid-core.esm.mjs ' + statSync(join(ROOT, 'dist', 'esuuid-core.esm.mjs')).size + ' bytes');
  process.exit(0);
}

function run(command, args) {
  execFileSync(command, args, { cwd: ROOT, stdio: 'inherit', timeout: 300000 });
}
function need(path, label) {
  if (!existsSync(path)) throw new Error(label + ' not found at ' + path);
}
function assertNoDescriptorModuleHelpers(path) {
  var source = readFileSync(path, 'utf8');
  var forbidden = ['defineProperty', 'getOwnPropertyDescriptor', 'getOwnPropertyNames'];
  for (var i = 0; i < forbidden.length; i++) {
    if (source.indexOf(forbidden[i]) !== -1) {
      throw new Error(
        'ExtendScript artifact contains forbidden esbuild module helper dependency ' +
        forbidden[i] + ': ' + path + '. Keep JSX entry points side-effect-only.'
      );
    }
  }
}

function gitHead() {
  if (process.env.ESUUID_PROVENANCE_COMMIT) {
    return String(process.env.ESUUID_PROVENANCE_COMMIT).trim();
  }
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

async function buildComposition() {
  var espackRoot = process.env.ESPACK_ROOT || join(ROOT, '..', 'espack');
  var esrandRoot = process.env.ESRAND_ROOT || join(ROOT, '..', 'esrand');
  var esrandManifest = join(esrandRoot, 'dist', 'ESRAND.manifest.json');
  need(join(espackRoot, 'espack-build.mjs'), 'ESPACK v2 build API');
  need(join(espackRoot, 'espack-merge.mjs'), 'ESPACK v2 merge API');
  need(join(espackRoot, 'espack-libraries.mjs'), 'ESPACK v2 library API');
  need(esrandManifest, 'ESRAND composition manifest (run ../esrand build first)');

  var packageInfo = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  var esrandPackage = JSON.parse(readFileSync(join(esrandRoot, 'package.json'), 'utf8'));
  var facadePath = join(DIST, 'ESUUID.facade.jsx');
  var facade = readFileSync(join(DIST, 'ESUUID.jsx'), 'utf8') +
    '\n// ESUUID.facade.jsx - loader-free ESUUID global activation for ESPACK v2 composition\n';
  writeFileSync(facadePath, facade, 'utf8');

  var buildApi = await import(pathToFileURL(join(espackRoot, 'espack-build.mjs')).href);
  var mergeApi = await import(pathToFileURL(join(espackRoot, 'espack-merge.mjs')).href);
  var librariesApi = await import(pathToFileURL(join(espackRoot, 'espack-libraries.mjs')).href);
  var library = librariesApi.libraryFromFile({
    id: 'esuuid',
    version: packageInfo.version,
    global: 'ESUUID',
    path: facadePath,
    requires: [{ id: 'esrand', range: '^' + esrandPackage.version }],
    contract: [
      { name: 'v4', type: 'function' },
      { name: 'parse', type: 'function' },
      { name: 'stringify', type: 'function' },
      { name: 'capabilities', type: 'function' }
    ],
    provenance: {
      package: packageInfo.name,
      repository: packageInfo.repository && packageInfo.repository.url,
      commit: gitHead(),
      artifact: 'dist/ESUUID.facade.jsx'
    }
  });
  var ownManifest = buildApi.makeManifest({
    bundleName: 'esuuid',
    cacheDir: '',
    payloads: [],
    accel: null,
    libraries: [library],
    entries: [{ id: 'esuuid', range: '=' + packageInfo.version }]
  });
  var composed = mergeApi.merge({
    manifests: [esrandManifest, ownManifest],
    out: join(DIST, 'ESUUID.bundle.jsx'),
    manifestOut: join(DIST, 'ESUUID.manifest.json'),
    name: 'esuuid',
    entries: [{ id: 'esuuid', range: '=' + packageInfo.version }]
  });
  run(PYTHON.command, PYTHON.prefix.concat([
    MINIFIER,
    '--in', 'dist/ESUUID.bundle.jsx',
    '--config', MIN_CONFIG,
    '--out', 'dist/ESUUID.bundle.min.jsx'
  ]));
  for (const file of ['dist/ESUUID.facade.jsx','dist/ESUUID.bundle.jsx','dist/ESUUID.bundle.min.jsx']) {
    run(process.execPath, [ESTC, 'check', file, '--no-target']);
    assertNoDescriptorModuleHelpers(join(ROOT, file));
  }
  if (composed.payloads.length !== 0 || composed.accel !== null) {
    throw new Error('ESUUID pure runtime composition unexpectedly emitted native ESPACK payloads');
  }
}

need(
  ESTC,
  process.env.ESUUID_USE_WORKSPACE_ESTC === '1'
    ? 'workspace ESTC'
    : 'pinned ESTC dependency (run npm ci, or set ESUUID_ESTC explicitly)'
);
need(MINIFIER, 'ExtendScript minifier');
need(MIN_CONFIG, 'minifier config');

run(process.execPath, [ESTC, 'build', '--config', 'extendscript.estc.config.mjs']);
run(process.execPath, [ESTC, 'build', '--config', 'extendscript.vendor.estc.config.mjs']);
copyFileSync(join(DIST, 'ESUUID.estc.jsx'), join(DIST, 'ESUUID.jsx'));
copyFileSync(join(DIST, 'vendor-esuuid.estc.js'), join(DIST, 'vendor-esuuid.js'));
try { unlinkSync(join(DIST, 'ESUUID.estc.jsx')); } catch (_) {}
try { unlinkSync(join(DIST, 'vendor-esuuid.estc.js')); } catch (_) {}

run(PYTHON.command, PYTHON.prefix.concat([MINIFIER, '--in', 'dist/ESUUID.jsx', '--config', MIN_CONFIG, '--out', 'dist/ESUUID.min.jsx']));
run(PYTHON.command, PYTHON.prefix.concat([MINIFIER, '--in', 'dist/vendor-esuuid.js', '--config', MIN_CONFIG, '--out', 'dist/vendor-esuuid.min.js']));

for (const file of ['dist/ESUUID.jsx','dist/ESUUID.min.jsx','dist/vendor-esuuid.js','dist/vendor-esuuid.min.js']) {
  run(process.execPath, [ESTC, 'check', file, '--no-target']);
  assertNoDescriptorModuleHelpers(join(ROOT, file));
}

await buildComposition();

for (const file of [
  'dist/ESUUID.jsx','dist/ESUUID.min.jsx','dist/vendor-esuuid.js','dist/vendor-esuuid.min.js',
  'dist/ESUUID.facade.jsx','dist/ESUUID.bundle.jsx','dist/ESUUID.bundle.min.jsx',
  'dist/ESUUID.manifest.json','dist/esuuid-core.esm.mjs'
]) {
  console.log('[esuuid-build] ' + file + ' ' + statSync(join(ROOT, file)).size + ' bytes');
}
releaseBuildLock();
