import {
  VERSION, NIL, MAX, DNS, URL, OID, X500,
  parse, stringify, validate, version,
  v3, v5, v1ToV6, v6ToV1, create
} from './core';
import { FactoryOptions, UUIDGenerator } from './types';

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
  if (esrand !== null && esrand !== undefined && typeof esrand.bytes === 'function') {
    defaultOptions.rand = esrand;
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
        entropy: defaultOptions.rand !== undefined ? 'ESRAND' : 'injected-only',
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

  // A facade loaded before ESRAND is intentionally injected-only. If ESRAND
  // becomes available later, re-evaluating ESUUID should upgrade the default
  // backend rather than preserving a stale injected-only facade forever.
  if (installedRand !== null && installedRand !== undefined &&
      typeof installedRand.bytes === 'function') {
    try {
      if (value.capabilities().entropy !== 'ESRAND') return false;
    } catch (error) {
      return false;
    }
  }
  return true;
}

var globalObject: any = $.global;
var installedRand: any = globalObject['ESRAND'];
var existingFacade: any = globalObject['ESUUID'];
if (!isCompatibleFacade(existingFacade, installedRand)) {
  globalObject['ESUUID'] = makeFacade(
    installedRand !== null && installedRand !== undefined && typeof installedRand.bytes === 'function'
      ? installedRand
      : null
  );
}
