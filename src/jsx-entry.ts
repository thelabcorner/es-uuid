import {
  VERSION, NIL, MAX, DNS, URL, OID, X500,
  parse, stringify, validate, version,
  v3, v5, v1ToV6, v6ToV1, create
} from './core';
import { FactoryOptions, UUIDGenerator } from './types';

var globalObject: any = $.global;

function emitEntropyWarning(message: string): void {
  // Internal hook used by the live suite and available to host integrators that
  // want to route warnings somewhere other than the ExtendScript Console.
  var hook: any = globalObject['__ESUUID_WARN__'];
  if (typeof hook === 'function') {
    try {
      hook(message);
      return;
    } catch (_) {}
  }
  try {
    if (typeof $.writeln === 'function') $.writeln(message);
  } catch (_) {}
}

function makeMathRandomFallback(): any {
  var warned = false;
  return {
    bytes: function (count: number): number[] {
      if (!warned) {
        warned = true;
        emitEntropyWarning(
          'ESUUID warning: ESRAND and caller-provided entropy are unavailable; ' +
          'falling back to Math.random(). UUID entropy is non-cryptographic and may be predictable.'
        );
      }
      var out: number[] = [];
      var i: number;
      for (i = 0; i < count; i++) {
        out[i] = Math.floor(Math.random() * 256);
      }
      return out;
    }
  };
}

function desiredEntropyBackend(esrand: any): string {
  if (esrand !== null && esrand !== undefined && typeof esrand.bytes === 'function') {
    return 'ESRAND';
  }
  if (typeof Math !== 'undefined' && typeof Math.random === 'function') {
    return 'Math.random-fallback';
  }
  return 'unavailable';
}

function bindGenerator(generator: UUIDGenerator): any {
  return {
    v1: function (options?: any, buffer?: number[], offset?: number): any {
      return generator.v1(options, buffer, offset);
    },
    v4: function (options?: any, buffer?: number[], offset?: number): any {
      return generator.v4(options, buffer, offset);
    },
    v6: function (options?: any, buffer?: number[], offset?: number): any {
      return generator.v6(options, buffer, offset);
    },
    v7: function (options?: any, buffer?: number[], offset?: number): any {
      return generator.v7(options, buffer, offset);
    }
  };
}

function makeFacade(esrand: any): any {
  var defaultOptions: FactoryOptions = {};
  var entropyBackend = desiredEntropyBackend(esrand);
  if (entropyBackend === 'ESRAND') {
    defaultOptions.rand = esrand;
  } else if (entropyBackend === 'Math.random-fallback') {
    defaultOptions.rand = makeMathRandomFallback();
  }
  var generator = create(defaultOptions);
  var bound = bindGenerator(generator);

  var v3fn: any = v3;
  var v5fn: any = v5;
  v3fn.DNS = DNS; v3fn.URL = URL; v3fn.OID = OID; v3fn.X500 = X500;
  v5fn.DNS = DNS; v5fn.URL = URL; v5fn.OID = OID; v5fn.X500 = X500;

  return {
    VERSION: VERSION,
    NIL: NIL,
    MAX: MAX,
    DNS: DNS,
    URL: URL,
    OID: OID,
    X500: X500,
    parse: parse,
    stringify: stringify,
    validate: validate,
    version: version,
    v1: bound.v1,
    v3: v3fn,
    v4: bound.v4,
    v5: v5fn,
    v6: bound.v6,
    v7: bound.v7,
    v1ToV6: v1ToV6,
    v6ToV1: v6ToV1,
    create: function (options?: FactoryOptions): any {
      var merged: FactoryOptions = {};
      var hasExplicitEntropy = false;
      if (options !== undefined) {
        if (options.rng !== undefined) { merged.rng = options.rng; hasExplicitEntropy = true; }
        if (options.rand !== undefined) { merged.rand = options.rand; hasExplicitEntropy = true; }
        if (options.now !== undefined) merged.now = options.now;
      }
      if (!hasExplicitEntropy && defaultOptions.rand !== undefined) merged.rand = defaultOptions.rand;
      return bindGenerator(create(merged));
    },
    capabilities: function (): any {
      return {
        standard: 'RFC 9562',
        engine: 'ExtendScript ES3',
        entropy: entropyBackend,
        cryptographic: false
      };
    }
  };
}

function isCompatibleFacade(value: any, installedRand: any): boolean {
  if (value === null || value === undefined || value.VERSION !== VERSION) return false;
  var shapeCompatible = typeof value.v1 === 'function' && typeof value.v4 === 'function' &&
    typeof value.v6 === 'function' && typeof value.v7 === 'function' &&
    typeof value.parse === 'function' && typeof value.stringify === 'function' &&
    typeof value.validate === 'function' && typeof value.capabilities === 'function';
  if (!shapeCompatible) return false;

  // Entropy availability can change during a persistent host session. Preserve
  // state only when the already-installed facade still represents the backend
  // we would select now.
  try {
    return value.capabilities().entropy === desiredEntropyBackend(installedRand);
  } catch (error) {
    return false;
  }
}

var installedRand: any = globalObject['ESRAND'];
var existingFacade: any = globalObject['ESUUID'];
if (!isCompatibleFacade(existingFacade, installedRand)) {
  globalObject['ESUUID'] = makeFacade(
    installedRand !== null && installedRand !== undefined && typeof installedRand.bytes === 'function'
      ? installedRand
      : null
  );
}
