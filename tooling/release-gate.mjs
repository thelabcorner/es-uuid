#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

var ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
var liveArgs = process.argv.slice(2);
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
  throw new Error('Could not resolve npm-cli.js; run through npm or provide a standard Node/npm installation');
}

function run(command, args) {
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 600000
  });
}

function runNpm(args) {
  run(process.execPath, [NPM_CLI].concat(args));
}

console.log('[release:gate] portable/full verification');
runNpm(['run', 'verify']);

console.log('[release:gate] live Illustrator verification');
run(process.execPath, ['tests/live-verify.mjs'].concat(liveArgs));

console.log('[release:gate] no-preload ESPACK composition verification');
run(process.execPath, ['tests/composition-live.mjs']);

console.log('[release:gate] packed-package reproducibility');
runNpm(['run', 'pack:smoke']);

console.log('[release:gate] evidence/document synchronization');
runNpm(['run', 'evidence:check']);

console.log('[release:gate] release manifest');
run(process.execPath, ['tooling/release-manifest.mjs']);

console.log('[release:gate] PASS');
