#!/usr/bin/env node
// Proves ESUUID's ESPACK v2 distribution activates ESRAND transitively.
// This harness intentionally performs no sibling preload.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createComToolRunner } from '../../extendscript-toolchain/src/comtool-compat.mjs';

var ROOT = dirname(fileURLToPath(import.meta.url));
var PROJECT = join(ROOT, '..');
var BUNDLE = join(PROJECT, 'dist', 'ESUUID.bundle.jsx');
var COM = createComToolRunner();

function fail(message) {
  console.error('[esuuid-composition-live] FAIL: ' + message);
  process.exitCode = 1;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

if (!existsSync(BUNDLE)) {
  fail('build first: ' + BUNDLE + ' missing');
} else {
  try {
    var status = await COM.run(['status']);
    if (!status.ok || !status.result) {
      console.log('[esuuid-composition-live] SKIP: Illustrator is not reachable through COMTool V2');
      process.exitCode = 2;
    } else {
      var path = BUNDLE.replace(/\\/g, '/').replace(/"/g, '\\"');
      var code = [
        'var g = $.global;',
        'g.ESRAND = null;',
        'g.ESUUID = null;',
        'g.ESPAK = null;',
        'g.__ESPAK_LIBRARIES__ = null;',
        '$.evalFile(File("' + path + '"));',
        'var rand = g.ESRAND;',
        'var uuid = g.ESUUID;',
        'var esp = g.ESPAK;',
        'var first = uuid.v4();',
        'var firstFacade = uuid;',
        '$.evalFile(File("' + path + '"));',
        'var libs = esp.libraryList ? esp.libraryList() : esp.libraries;',
        'var order = []; var i;',
        'for (i = 0; i < libs.length; i++) order[order.length] = libs[i].id + "@" + libs[i].version;',
        'return {',
        '  host: app.version, engine: $.version,',
        '  esrand: !!rand && typeof rand.bytes === "function",',
        '  esuuid: !!uuid && typeof uuid.v4 === "function",',
        '  entropy: uuid.capabilities().entropy,',
        '  valid: uuid.validate(first) && uuid.version(first) === 4,',
        '  control: !!esp && esp.supportsLibraryComposition === true,',
        '  order: order,',
        '  dedup: g.ESUUID === firstFacade,',
        '  payloads: esp.config && esp.config.payloads ? esp.config.payloads.length : -1',
        '};'
      ].join('\n');
      var result = await COM.run(['eval', '--code', code], { timeoutMs: 180000 });
      if (!result.ok || !result.result) {
        fail('COMTool V2 evaluation failed: ' + JSON.stringify(result));
      } else {
        var r = result.result;
        var expected = ['esrand@0.2.0', 'esuuid@0.2.0'];
        var ok =
          r.esrand === true &&
          r.esuuid === true &&
          r.entropy === 'ESRAND' &&
          r.valid === true &&
          r.control === true &&
          r.dedup === true &&
          r.payloads === 0 &&
          r.order.join(',') === expected.join(',');
        if (!ok) {
          fail('live composition mismatch: ' + JSON.stringify(r));
        } else {
          var evidenceDir = join(PROJECT, 'evidence');
          mkdirSync(evidenceDir, { recursive: true });
          writeFileSync(join(evidenceDir, 'latest-composition-live.json'), JSON.stringify({
            schemaVersion: 1,
            kind: 'esuuid-composition-live',
            capturedAt: new Date().toISOString(),
            transport: 'ESTC COMTool V2 Node SDK',
            artifact: {
              file: 'dist/ESUUID.bundle.jsx',
              sha256: sha256(BUNDLE)
            },
            illustrator: r.host,
            extendScript: r.engine,
            activationOrder: r.order,
            entropy: r.entropy,
            payloadCount: r.payloads,
            crossEvaluationDedup: r.dedup === true,
            result: 'PASS'
          }, null, 2) + '\n');
          console.log(
            '[esuuid-composition-live] PASS ESRAND -> ESUUID on Illustrator ' +
            r.host + ' / ExtendScript ' + r.engine
          );
        }
      }
    }
  } finally {
    await COM.close().catch(function () {});
  }
}