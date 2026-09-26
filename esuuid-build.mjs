#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { buildSync } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
var PYTHON = process.env.ESUUID_PYTHON || 'python';

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

run(PYTHON, [MINIFIER, '--in', 'dist/ESUUID.jsx', '--config', MIN_CONFIG, '--out', 'dist/ESUUID.min.jsx']);
run(PYTHON, [MINIFIER, '--in', 'dist/vendor-esuuid.js', '--config', MIN_CONFIG, '--out', 'dist/vendor-esuuid.min.js']);

for (const file of ['dist/ESUUID.jsx','dist/ESUUID.min.jsx','dist/vendor-esuuid.js','dist/vendor-esuuid.min.js']) {
  run(process.execPath, [ESTC, 'check', file, '--no-target']);
  assertNoDescriptorModuleHelpers(join(ROOT, file));
}

for (const file of ['dist/ESUUID.jsx','dist/ESUUID.min.jsx','dist/vendor-esuuid.js','dist/vendor-esuuid.min.js','dist/esuuid-core.esm.mjs']) {
  console.log('[esuuid-build] ' + file + ' ' + statSync(join(ROOT, file)).size + ' bytes');
}
