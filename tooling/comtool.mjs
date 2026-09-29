#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkJsxText } from 'extendscript-toolchain/check';

export const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const SCRIPTS_ROOT = dirname(PROJECT_ROOT);
export const COMTOOL_ROOT = join(SCRIPTS_ROOT, 'comtool-v2');

async function loadEstcComTool() {
  try {
    return await import('extendscript-toolchain/comtool');
  } catch (packageError) {
    // Workspace development may intentionally exercise a newer sibling ESTC
    // before ESUUID's immutable ESTC pin is advanced. Pack/release smoke runs
    // without this sibling and therefore still proves the declared dependency.
    const workspace = join(
      SCRIPTS_ROOT,
      'extendscript-toolchain',
      'src',
      'comtool.mjs'
    );
    if (existsSync(workspace)) return import(pathToFileURL(workspace).href);
    return null;
  }
}

const estcComTool = await loadEstcComTool();
const openIllustratorComTool = estcComTool && estcComTool.openIllustratorComTool;
const cliFallback = openIllustratorComTool
  ? null
  : await import('./comtool-cli-fallback.mjs');

export function parseCommonOptions(argv) {
  if (cliFallback) return cliFallback.parseCommonOptions(argv);
  var out = {
    pipe: process.env.COMTOOL_PIPE || process.env.COMTOOL_V2_PIPE || null,
    target: process.env.COMTOOL_TARGET || process.env.COMTOOL_V2_TARGET || null,
    launch: false,
    _session: null
  };

  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--pipe' && i + 1 < argv.length) out.pipe = argv[++i];
    else if (argv[i] === '--target' && i + 1 < argv.length) out.target = argv[++i];
    else if (argv[i] === '--launch') out.launch = true;
    else if (argv[i] === '--no-launch') out.launch = false;
  }

  return out;
}

async function ensureSession(config, ttlMs = 300000) {
  if (config._session) return config._session;

  var session = await openIllustratorComTool({
    launch: config.launch === true,
    target: config.target || null,
    pipe: config.pipe || null,
    leaseTtlMs: ttlMs
  });

  config._session = session;
  config.pipe = session.runtime.pipeName;
  config.target = session.targetId;
  return session;
}

function assertTarget(session, targetId) {
  if (targetId && session.targetId !== targetId) {
    throw new Error(
      'COMTool target changed unexpectedly: expected ' +
      targetId + ', got ' + session.targetId
    );
  }
}

function assertLease(session, leaseId) {
  var current = session.session && session.session.leaseId;
  if (leaseId && current !== leaseId) {
    throw new Error(
      'COMTool lease changed unexpectedly: expected ' +
      leaseId + ', got ' + current
    );
  }
}

export async function discoverIllustratorTarget(config) {
  if (cliFallback) return cliFallback.discoverIllustratorTarget(config);
  var session = await ensureSession(config);
  return session.target;
}

export async function acquireLease(config, targetId, ttlMs = 180000) {
  if (cliFallback) return cliFallback.acquireLease(config, targetId, ttlMs);
  var session = await ensureSession(config, ttlMs);
  assertTarget(session, targetId);
  return session.session.leaseId;
}

export async function acquireLeaseWithRetry(
  config,
  targetId,
  ttlMs = 180000
) {
  if (cliFallback) {
    return cliFallback.acquireLeaseWithRetry(config, targetId, ttlMs);
  }
  // COMTool owns target lease acquisition/retry semantics. The helper name is
  // retained so ESUUID's existing harness contract does not duplicate them.
  return acquireLease(config, targetId, ttlMs);
}

export async function releaseLease(config, targetId, leaseId) {
  if (cliFallback) return cliFallback.releaseLease(config, targetId, leaseId);
  if (!config || !config._session) return;

  var session = config._session;
  config._session = null;
  assertTarget(session, targetId);
  assertLease(session, leaseId);
  await session.close();
}

export async function renewLease(
  config,
  targetId,
  leaseId,
  ttlMs = 300000
) {
  if (cliFallback) return cliFallback.renewLease(config, targetId, leaseId, ttlMs);
  var session = await ensureSession(config, ttlMs);
  assertTarget(session, targetId);
  assertLease(session, leaseId);
  var lease = await session.session.renewLease({ ttlMs: ttlMs });
  return lease.id;
}

export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function assertExtendScriptArtifactSafe(
  file,
  label = 'ExtendScript artifact'
) {
  if (!existsSync(file)) throw new Error(label + ' not found: ' + file);
  var source = readFileSync(file, 'utf8');
  var checked = checkJsxText(source, {
    file: file,
    mode: 'conservative',
    target: 'illustrator',
    requireTarget: false,
    allowIncludes: false,
    allowJson: false,
    allowedMissingBuiltins: [],
    allowedGlobalPatches: []
  });

  if (!checked.ok) {
    var errors = checked.diagnostics
      .filter(function (d) { return d.severity === 'error'; })
      .map(function (d) {
        return d.code + ' ' + (d.line || 0) + ':' +
          (d.column || 0) + ' ' + d.message;
      });
    throw new Error(
      label + ' failed ESTC compatibility: ' + errors.join('; ')
    );
  }
}

export async function runFile(config, options) {
  if (cliFallback) return cliFallback.runFile(config, options);
  var session = await ensureSession(
    config,
    Math.max(options.timeoutMs || 300000, 300000)
  );
  assertTarget(session, options.targetId);
  assertLease(session, options.leaseId);

  var run = await session.runFileResult(options.path, {
    args: options.args,
    timeoutMs: options.timeoutMs || 300000
  });

  return {
    ok: run.exitCode === 0,
    status: run.operation && run.operation.status,
    error: run.operation && run.operation.error,
    result: { value: run.value },
    run: run
  };
}

export function resultValue(envelope) {
  return envelope && envelope.result ? envelope.result.value : undefined;
}

export const DEFAULT_CLI = cliFallback
  ? cliFallback.DEFAULT_CLI
  : (process.env.COMTOOL_CLI_PATH ||
    process.env.COMTOOL_V2_CLI_PATH ||
    process.env.COMTOOL_V2_CLI ||
    (process.env.LOCALAPPDATA
      ? join(
        process.env.LOCALAPPDATA,
        'Programs',
        'ComToolV2',
        'current',
        'ComTool.Cli.exe'
      )
      : null));

export function resolveRequestedPath(value) {
  return value ? resolve(value) : null;
}
