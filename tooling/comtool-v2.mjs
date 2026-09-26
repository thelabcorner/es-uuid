#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
var INSTALLED_CLI = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'Programs', 'ComToolV2', 'current', 'ComTool.Cli.exe')
  : null;

function resolveDefaultCli() {
  // Prefer the stable per-user production install. The workspace build is a
  // development fallback so this harness also works from a standalone ESUUID
  // clone rather than requiring the parent Adobe Scripts monorepo layout.
  if (INSTALLED_CLI && existsSync(INSTALLED_CLI)) return INSTALLED_CLI;
  if (existsSync(WORKSPACE_CLI)) return WORKSPACE_CLI;
  return INSTALLED_CLI || WORKSPACE_CLI;
}

export const DEFAULT_CLI = resolveDefaultCli();

function cliError(label, envelope, stderr, status) {
  var detail = envelope && envelope.error
    ? envelope.error.kind + ': ' + envelope.error.message
    : (stderr || 'exit ' + status);
  var error = new Error(label + ' failed: ' + detail);
  error.envelope = envelope;
  error.exitCode = status;
  return error;
}

export function invokeCli(cliPath, args, options = {}) {
  if (!existsSync(cliPath)) {
    throw new Error(
      'COM Tool V2 CLI not found at ' + cliPath +
      '. Install COM Tool V2, build the workspace Release CLI, or pass --cli <path>.'
    );
  }

  var proc = spawnSync(cliPath, args, {
    cwd: options.cwd || dirname(cliPath),
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeoutMs || 300000,
    maxBuffer: options.maxBuffer || (16 * 1024 * 1024)
  });
  if (proc.error) throw proc.error;

  var stdout = (proc.stdout || '').trim();
  var envelope = null;
  if (stdout) {
    try {
      envelope = JSON.parse(stdout);
    } catch (error) {
      throw new Error(
        'COM Tool V2 returned non-JSON output for ' + args[0] + ': ' +
        stdout.slice(0, 800)
      );
    }
  }
  if (proc.status !== 0 || !envelope || envelope.ok !== true) {
    throw cliError(args[0], envelope, (proc.stderr || '').trim(), proc.status);
  }
  return envelope;
}

export function resultValue(envelope) {
  return envelope && envelope.result ? envelope.result.value : undefined;
}

export function parseCommonOptions(argv) {
  var out = {
    cli: process.env.COMTOOL_V2_CLI || DEFAULT_CLI,
    pipe: process.env.COMTOOL_V2_PIPE || 'comtool-v2-runtime-1',
    target: process.env.COMTOOL_V2_TARGET || null,
    leaseWaitMs: process.env.COMTOOL_V2_LEASE_WAIT_MS
      ? Number(process.env.COMTOOL_V2_LEASE_WAIT_MS)
      : 60000
  };
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--cli' && i + 1 < argv.length) out.cli = resolve(argv[++i]);
    else if (argv[i] === '--pipe' && i + 1 < argv.length) out.pipe = argv[++i];
    else if (argv[i] === '--target' && i + 1 < argv.length) out.target = argv[++i];
    else if (argv[i] === '--lease-wait-ms' && i + 1 < argv.length) out.leaseWaitMs = Number(argv[++i]);
  }
  if (!Number.isFinite(out.leaseWaitMs) || out.leaseWaitMs < 0) {
    throw new Error('--lease-wait-ms / COMTOOL_V2_LEASE_WAIT_MS must be a non-negative number');
  }
  return out;
}

export function discoverIllustratorTarget(config) {
  var envelope = invokeCli(config.cli, ['targets', '--runtime', '--pipe', config.pipe]);
  var targets = resultValue(envelope);
  if (!Array.isArray(targets)) throw new Error('COM Tool V2 targets result is not an array');

  var candidates = targets.filter(function (entry) {
    if (!entry || !entry.running || !entry.target || entry.target.host !== 'illustrator') return false;
    if (config.target && entry.target.id !== config.target) return false;
    var caps = Array.isArray(entry.capabilities) ? entry.capabilities : [];
    return caps.some(function (cap) {
      return cap && cap.name === 'script.runFile' && cap.supported === true;
    });
  });

  if (candidates.length === 0) {
    throw new Error(
      config.target
        ? 'Requested Illustrator target is not running with script.runFile support: ' + config.target
        : 'No running Illustrator target advertises COM Tool V2 script.runFile'
    );
  }
  if (!config.target && candidates.length > 1) {
    throw new Error(
      'Multiple Illustrator targets advertise script.runFile; pass --target <id>: ' +
      candidates.map(function (entry) { return entry.target.id; }).join(', ')
    );
  }
  return candidates[0];
}

export function acquireLease(config, targetId, ttlMs = 180000) {
  var envelope = invokeCli(config.cli, [
    'lease-acquire', '--runtime',
    '--pipe', config.pipe,
    '--target', targetId,
    '--ttl-ms', String(ttlMs)
  ]);
  var value = resultValue(envelope);
  if (!value || !value.leaseId) throw new Error('COM Tool V2 lease response omitted leaseId');
  return value.leaseId;
}

function sleepSync(ms) {
  if (!(ms > 0)) return;
  var cell = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(cell, 0, 0, ms);
}

export function acquireLeaseWithRetry(config, targetId, ttlMs = 180000) {
  var waitMs = config.leaseWaitMs === undefined ? 60000 : config.leaseWaitMs;
  var deadline = Date.now() + waitMs;
  var announced = false;
  while (true) {
    try {
      return acquireLease(config, targetId, ttlMs);
    } catch (error) {
      var envelope = error && error.envelope ? error.envelope : null;
      var runtimeError = envelope && envelope.error ? envelope.error : null;
      if (!runtimeError ||
          runtimeError.kind !== 'target_leased_external' ||
          runtimeError.retryable !== true ||
          Date.now() >= deadline) {
        throw error;
      }
      if (!announced) {
        console.error(
          '[comtool-v2] target is leased by another runtime; waiting up to ' +
          waitMs + ' ms without stealing ownership'
        );
        announced = true;
      }
      sleepSync(Math.min(1000, Math.max(1, deadline - Date.now())));
    }
  }
}

export function releaseLease(config, targetId, leaseId) {
  if (!leaseId) return;
  invokeCli(config.cli, [
    'lease-release', '--runtime',
    '--pipe', config.pipe,
    '--target', targetId,
    '--lease', leaseId
  ]);
}

export function renewLease(config, targetId, leaseId, ttlMs = 300000) {
  var envelope = invokeCli(config.cli, [
    'lease-renew', '--runtime',
    '--pipe', config.pipe,
    '--target', targetId,
    '--lease', leaseId,
    '--ttl-ms', String(ttlMs)
  ]);
  var value = resultValue(envelope);
  if (!value || !value.leaseId) throw new Error('COM Tool V2 lease renewal omitted leaseId');
  return value.leaseId;
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function assertExtendScriptArtifactSafe(path, label = 'ExtendScript artifact') {
  if (!existsSync(path)) throw new Error(label + ' not found: ' + path);
  var source = readFileSync(path, 'utf8');
  var forbidden = ['defineProperty', 'getOwnPropertyDescriptor', 'getOwnPropertyNames'];
  for (var i = 0; i < forbidden.length; i++) {
    if (source.indexOf(forbidden[i]) !== -1) {
      throw new Error(
        label + ' contains forbidden generated module helper dependency ' +
        forbidden[i] + ': ' + path
      );
    }
  }
}

export function runFile(config, options) {
  var args = [
    'run-file', '--runtime',
    '--pipe', config.pipe,
    '--lease', options.leaseId,
    '--request-id', options.requestId,
    '--path', resolve(options.path),
    '--sha256', options.sha256 || sha256File(options.path),
    '--target', options.targetId
  ];
  if (options.args !== undefined) {
    args.push('--args-json', JSON.stringify(options.args));
  }
  return invokeCli(config.cli, args, { timeoutMs: options.timeoutMs || 300000 });
}
