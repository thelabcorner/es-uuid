#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkJsxText } from 'extendscript-toolchain/check';

const require = createRequire(import.meta.url);
const ESTC_ENTRY = require.resolve('extendscript-toolchain');
const ESTC_ROOT = dirname(dirname(ESTC_ENTRY));
const SHARED_COMTOOL_ADAPTER = join(ESTC_ROOT, 'src', 'comtool-v2.mjs');
const sharedComTool = await import(pathToFileURL(SHARED_COMTOOL_ADAPTER).href);
const {
  invokeComToolV2,
  openIllustratorV2,
  resolveComToolV2,
  sha256File: sharedSha256File
} = sharedComTool;

export const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const SCRIPTS_ROOT = dirname(PROJECT_ROOT);
export const COMTOOL_ROOT = join(
  SCRIPTS_ROOT,
  'agent-skills',
  'illustrator-com-automation-skill',
  'comtool-v2'
);

var WORKSPACE_CLI = join(
  COMTOOL_ROOT,
  'src',
  'ComTool.Cli',
  'bin',
  'Release',
  'net10.0-windows',
  'ComTool.Cli.exe'
);
var WORKSPACE_RUNTIME = join(
  COMTOOL_ROOT,
  'src',
  'ComTool.RuntimeHost',
  'bin',
  'Release',
  'net10.0-windows',
  'ComTool.RuntimeHost.exe'
);
var WORKSPACE_WORKER = join(
  COMTOOL_ROOT,
  'src',
  'ComTool.Worker',
  'bin',
  'Release',
  'net10.0-windows',
  'ComTool.Worker.exe'
);
var INSTALLED_CLI = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'Programs', 'ComToolV2', 'current', 'ComTool.Cli.exe')
  : null;

function primeSharedLayout() {
  var explicitCli = process.env.COMTOOL_V2_CLI;
  var explicitRuntime = process.env.COMTOOL_V2_RUNTIME_HOST;
  var explicitWorker = process.env.COMTOOL_V2_WORKER;

  // Preserve caller authority. The shared ESTC resolver validates that an
  // explicit layout is all-or-nothing and version-coherent.
  if (explicitCli || explicitRuntime || explicitWorker) return;

  // A stable per-user installation, when present, is already understood by
  // the shared adapter.
  try {
    resolveComToolV2();
    return;
  } catch (_) {}

  // When ESUUID is running inside the toolkit workspace, the pinned ESTC npm
  // dependency cannot infer the sibling COM-tool root from node_modules.
  // Promote the complete workspace triplet into ESTC's explicit-layout
  // contract rather than importing a mutable sibling ESTC checkout.
  if (
    existsSync(WORKSPACE_CLI) &&
    existsSync(WORKSPACE_RUNTIME) &&
    existsSync(WORKSPACE_WORKER)
  ) {
    process.env.COMTOOL_V2_CLI = WORKSPACE_CLI;
    process.env.COMTOOL_V2_RUNTIME_HOST = WORKSPACE_RUNTIME;
    process.env.COMTOOL_V2_WORKER = WORKSPACE_WORKER;
  }
}

function resolveDefaultCli() {
  primeSharedLayout();
  try {
    return resolveComToolV2().cli;
  } catch (_) {
    if (INSTALLED_CLI && existsSync(INSTALLED_CLI)) return INSTALLED_CLI;
    if (existsSync(WORKSPACE_CLI)) return WORKSPACE_CLI;
    return INSTALLED_CLI || WORKSPACE_CLI;
  }
}

export const DEFAULT_CLI = resolveDefaultCli();

export function invokeCli(cliPath, args, options = {}) {
  return invokeComToolV2(cliPath, args, options);
}

export function resultValue(envelope) {
  return envelope && envelope.result ? envelope.result.value : undefined;
}

export function parseCommonOptions(argv) {
  var out = {
    cli: process.env.COMTOOL_V2_CLI || DEFAULT_CLI,
    pipe: process.env.COMTOOL_V2_PIPE || null,
    target: process.env.COMTOOL_V2_TARGET || null,
    leaseWaitMs: process.env.COMTOOL_V2_LEASE_WAIT_MS
      ? Number(process.env.COMTOOL_V2_LEASE_WAIT_MS)
      : 60000,
    launch: false,
    _session: null,
    _cleanupRegistered: false
  };

  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--cli' && i + 1 < argv.length) out.cli = resolve(argv[++i]);
    else if (argv[i] === '--pipe' && i + 1 < argv.length) out.pipe = argv[++i];
    else if (argv[i] === '--target' && i + 1 < argv.length) out.target = argv[++i];
    else if (argv[i] === '--lease-wait-ms' && i + 1 < argv.length) out.leaseWaitMs = Number(argv[++i]);
    else if (argv[i] === '--launch') out.launch = true;
    else if (argv[i] === '--no-launch') out.launch = false;
  }

  if (!Number.isFinite(out.leaseWaitMs) || out.leaseWaitMs < 0) {
    throw new Error('--lease-wait-ms / COMTOOL_V2_LEASE_WAIT_MS must be a non-negative number');
  }
  return out;
}

function assertCliMatchesSharedLayout(config) {
  var layout = resolveComToolV2();
  if (
    config.cli &&
    resolve(config.cli).toLowerCase() !== resolve(layout.cli).toLowerCase()
  ) {
    throw new Error(
      'ESUUID now uses the shared COM Tool V2 runtime adapter. A custom --cli ' +
      'cannot be supplied by itself because RuntimeHost/Worker versions must ' +
      'match. Use COMTOOL_V2_CLI, COMTOOL_V2_RUNTIME_HOST, and ' +
      'COMTOOL_V2_WORKER together.'
    );
  }
  return layout;
}

function closeConfigSession(config) {
  if (!config || !config._session) return;
  var session = config._session;
  config._session = null;
  try { session.close(); } catch (_) {}
}

function ensureSession(config, ttlMs = 180000) {
  if (config._session) return config._session;
  assertCliMatchesSharedLayout(config);
  var session = openIllustratorV2({
    launch: config.launch === true,
    target: config.target || null,
    pipe: config.pipe || null,
    leaseWaitMs: config.leaseWaitMs,
    leaseTtlMs: ttlMs
  });
  config._session = session;
  config.cli = session.layout.cli;
  config.pipe = session.pipe;
  config.target = session.targetId;

  if (!config._cleanupRegistered) {
    config._cleanupRegistered = true;
    process.once('exit', function () {
      closeConfigSession(config);
    });
  }
  return session;
}

function assertTarget(session, targetId) {
  if (targetId && session.targetId !== targetId) {
    throw new Error(
      'COM Tool V2 target changed unexpectedly: expected ' +
      targetId + ', got ' + session.targetId
    );
  }
}

function assertLease(session, leaseId) {
  if (leaseId && session.leaseId !== leaseId) {
    throw new Error(
      'COM Tool V2 lease changed unexpectedly: expected ' +
      leaseId + ', got ' + session.leaseId
    );
  }
}

export function discoverIllustratorTarget(config) {
  var session = ensureSession(config);
  return session.target;
}

export function acquireLease(config, targetId, ttlMs = 180000) {
  var session = ensureSession(config, ttlMs);
  assertTarget(session, targetId);
  return session.leaseId;
}

export function acquireLeaseWithRetry(config, targetId, ttlMs = 180000) {
  // openIllustratorV2 already owns the bounded retry policy for externally
  // leased targets; preserve this legacy helper name for ESUUID callers.
  return acquireLease(config, targetId, ttlMs);
}

export function releaseLease(config, targetId, leaseId) {
  if (!config || !config._session) return;
  assertTarget(config._session, targetId);
  assertLease(config._session, leaseId);
  closeConfigSession(config);
}

export function renewLease(config, targetId, leaseId, ttlMs = 300000) {
  var session = ensureSession(config, ttlMs);
  assertTarget(session, targetId);
  assertLease(session, leaseId);
  return session.renewLease(ttlMs);
}

export function sha256File(file) {
  return sharedSha256File(file);
}

export function assertExtendScriptArtifactSafe(file, label = 'ExtendScript artifact') {
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
        return d.code + ' ' + (d.line || 0) + ':' + (d.column || 0) + ' ' + d.message;
      });
    throw new Error(label + ' failed ESTC compatibility: ' + errors.join('; '));
  }
}

export function runFile(config, options) {
  var session = ensureSession(config, options.timeoutMs || 300000);
  assertTarget(session, options.targetId);
  assertLease(session, options.leaseId);
  return session.runFileEnvelope(options.path, {
    requestId: options.requestId,
    sha256: options.sha256 || sha256File(options.path),
    args: options.args,
    timeoutMs: options.timeoutMs || 300000
  });
}
