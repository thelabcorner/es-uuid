<div align="center">

# ESUUID: RFC 9562 UUIDs for Adobe ExtendScript (ES3)

## ExtendScript UUID = E.S.UUID

### UUID v1/v3/v4/v5/v6/v7 generation, parsing, validation, conversion, ESRAND-preferred entropy, and a warned Math.random fallback for Adobe ExtendScript hosts

[![RFC 9562](https://img.shields.io/badge/RFC%209562-Appendix%20A%206%2F6-success)](https://www.rfc-editor.org/rfc/rfc9562)
[![Differential](https://img.shields.io/badge/differential-3%2C225%20uuid%4014.0.2%20checks-purple)](#validation)
[![Illustrator](https://img.shields.io/badge/Illustrator%2030.6.0-54%2F54%20live-success)](#compatibility)
[![Adobe: Creative Suite](https://img.shields.io/badge/Adobe%20-Creative%20Suite-red?logo=adobe&logoColor=white)](https://extendscript.docsforadobe.dev/)
[![Engine](https://img.shields.io/badge/ExtendScript-ES3-green)](#compatibility)
[![Size](https://img.shields.io/badge/minified-14.6%20KB-orange)](#which-artifact-should-i-use)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL%203.0--or--later-blue)](https://www.gnu.org/licenses/gpl-3.0.html)

</div>

---

## Part Of The Same Toolkit

> Production-grade infrastructure for Adobe ExtendScript.

<table>
<tr>
<td width="50%" valign="top">

### Runtime Primitives

**[ESON](https://github.com/thelabcorner/eson)**  
Strict RFC 8259 JSON for ExtendScript.

**[ESB64](https://github.com/thelabcorner/es-b64)**  
Base64 and UTF-8 utilities.

**[ESARR](https://github.com/thelabcorner/es-arr)**  
ES5+ Array compatibility methods.

**[ESSTR](https://github.com/thelabcorner/es-str)**  
String whitespace and trim methods.

**[ESCHARS](https://github.com/thelabcorner/es-chars)**  
Native bulk byte operations.

**[ESHTTP](https://github.com/thelabcorner/es-http)**  
HTTP transport for ExtendScript automation.

**[ESTIMER](https://github.com/thelabcorner/es-timer)**  
Microsecond timing for ExtendScript automation.

**[ESRAND](https://github.com/thelabcorner/es-rand)**  
Deterministic random streams and sampling for ExtendScript.

**[ESUUID](https://github.com/thelabcorner/es-uuid)**  
RFC 9562 UUID generation, parsing, and conversion for ExtendScript.

</td>
<td width="50%" valign="top">

### Build & Integration Tools

**[ESPACK](https://github.com/thelabcorner/espack)**  
Self-extracting ExternalObject bundles.

**[ESMIN](https://github.com/thelabcorner/es-min)**  
Minification for shipped JSX bundles.

**[ESABI](https://github.com/thelabcorner/esabi)**  
Modern ExternalObject ABI declarations for native integrations.

**[VectorIPC](https://github.com/thelabcorner/vector-ipc)**  
Bounded local IPC for scripting hosts and native plug-ins.

**[ESTC](https://github.com/thelabcorner/estc)**  
TypeScript-to-ExtendScript build, compatibility, and live-parse tooling.

**[ESDB](https://github.com/thelabcorner/esdb)**  
Native state and durable storage for Adobe tooling.

**ESOBF** <sub>coming soon</sub>  
Obfuscation for hardened JSX distribution.

</td>
</tr>
</table>

Also from the same team: **[ArcFit.dev](https://arcfit.dev)**, deterministic arc warp for Illustrator.

---

## Table of Contents

- [Why ESUUID?](#why-esuuid)
- [Features](#features)
- [Which artifact should I use?](#which-artifact-should-i-use)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Validation](#validation)
- [Spec Conformance](#spec-conformance)
- [Performance](#performance)
- [Security Model](#security-model)
- [Compatibility](#compatibility)
- [Engine quirks that shaped the design](#engine-quirks-that-shaped-the-design)
- [Development](#development)
- [Repository layout](#repository-layout)
- [Credits](#credits)
- [License](#license)

---

## Why ESUUID?

ExtendScript is an ES3-era runtime with no standardized UUID API equivalent to modern `crypto.randomUUID()`. ESUUID provides the RFC 9562 UUID surface directly in ExtendScript syntax with an explicit entropy priority: caller-provided bytes/RNG, then ESRAND, then a warned non-cryptographic `Math.random()` fallback.

The default Adobe-host facade integrates with [ESRAND](https://github.com/thelabcorner/es-rand) when it is already installed as `$.global.ESRAND`. If ESRAND is missing and the caller does not provide entropy, ESUUID falls back to `Math.random()`, reports `entropy: "Math.random-fallback"`, and emits a one-time warning on the first fallback entropy request.

ESUUID also targets the public API shape developers already know from `uuidjs/uuid` where that mapping is meaningful in ExtendScript. Differential validation currently covers 3,225 parity checks against `uuid@14.0.2`.

---

## Features

- RFC 9562 UUID **v1, v3, v4, v5, v6, and v7** generation.
- RFC 9562 Appendix A vectors pass **6/6** for v1/v3/v4/v5/v6/v7.
- `parse`, `stringify`, `validate`, and `version` match the `uuidjs/uuid`-style surface.
- `v1ToV6` and `v6ToV1` conversions are included and differential-tested.
- Namespace constants: `DNS`, `URL`, `OID`, and `X500`.
- Special constants: `NIL` and `MAX`.
- Explicit byte-array output buffers and offsets for generation and name-based UUIDs.
- Stateful v1/v6 generation and monotonic v7 sequencing through `create()`.
- ESRAND-backed default entropy in Adobe hosts when `$.global.ESRAND.bytes(count)` is available.
- Caller-injected `rng`, `rand`, and `now` sources for deterministic tests or custom integrations.
- Warned `Math.random()` fallback when ESRAND and caller entropy are both unavailable.
- Same-version global reload preserves the existing facade and stateful v1/v7 generator state.
- Fresh minified and unminified artifacts are both exercised inside real Illustrator.
- **55** unit checks, **3,225** differential checks, **75,000** fuzz invariants, and **54/54** live Illustrator checks pass on the current 0.1.0 tree.

---

## Which artifact should I use?

| Artifact | Size | Surface | Use it when |
|---|---:|---|---|
| `dist/ESUUID.min.jsx` | 14,595 bytes | Installs `$.global.ESUUID` | Default production ExtendScript script include |
| `dist/ESUUID.jsx` | 18,746 bytes | Installs `$.global.ESUUID` | Readable/debuggable ExtendScript build |
| `dist/vendor-esuuid.min.js` | 14,595 bytes | Installs `$.global.ESUUID` | Vendoring into another generated bundle |
| `dist/vendor-esuuid.js` | 18,746 bytes | Installs `$.global.ESUUID` | Readable vendor input |
| `dist/esuuid-core.esm.mjs` | 20,459 bytes | ESM exports | Node-side tests, differential validation, or tooling |

The four ExtendScript artifacts are generated from the same `src/jsx-entry.ts` entry point. Their current byte sizes come from the standalone, public-reproducible build using the pinned ESTC GitHub dependency.

**Rule of thumb:** use `ESUUID.min.jsx` in shipped JSX and `ESUUID.jsx` while debugging.

---

## Installation

### Use the checked-in ExtendScript build

ESUUID ships generated `dist/` artifacts in the repository so a consumer does not need the TypeScript build toolchain just to use the library.

Load ESRAND first when you want ESUUID's preferred default entropy backend:

```jsx
$.evalFile(File("/path/to/vendor-esrand.js"));
$.evalFile(File("/path/to/ESUUID.min.jsx"));

var id = ESUUID.v7();
```

ESRAND is available at [thelabcorner/es-rand](https://github.com/thelabcorner/es-rand).

### Build from source

Requirements:

- Node.js 20 or newer.
- Python 3 for the conservative ExtendScript minifier.
- HTTPS access to the pinned public [ESTC](https://github.com/thelabcorner/estc) source archive.

```bash
git clone https://github.com/thelabcorner/es-uuid.git
cd es-uuid
npm ci
npm run build
```

The build uses the pinned ESTC source archive installed by `npm ci` by default. Inside the wider toolkit workspace, set `ESUUID_USE_WORKSPACE_ESTC=1` to opt into the sibling `../extendscript-toolchain` checkout.

### Run without ESRAND

ESUUID can load without ESRAND. If you call a random UUID method without
supplying entropy, the Adobe facade falls back to `Math.random()`, emits a
one-time warning, and continues:

```jsx
$.evalFile(File("/path/to/ESUUID.min.jsx"));

var id = ESUUID.v4(); // works, warns once that Math.random() is being used
```

For deterministic or stronger externally-supplied entropy, inject a source:

```jsx
$.evalFile(File("/path/to/ESUUID.min.jsx"));

var uuid = ESUUID.create({
  rng: function () {
    return [
      0x91, 0x91, 0x08, 0xf7,
      0x52, 0xd1, 0x33, 0x20,
      0x5b, 0xac, 0xf8, 0x47,
      0xdb, 0x41, 0x48, 0xa8
    ];
  }
});

var id = uuid.v4();
```

---

## Quick Start

```jsx
// ESRAND should already be installed on $.global.
$.evalFile(File("/path/to/ESUUID.min.jsx"));

var randomId = ESUUID.v4();
var orderedId = ESUUID.v7();

var stableNameId = ESUUID.v5(
  "www.example.com",
  ESUUID.DNS
);

var bytes = ESUUID.parse(randomId);
var roundTrip = ESUUID.stringify(bytes);

if (!ESUUID.validate(roundTrip)) {
  throw new Error("invalid UUID");
}

$.writeln("v4: " + randomId);
$.writeln("v7: " + orderedId);
$.writeln("v5: " + stableNameId);
```

---

## API Reference

### Constants

| Name | Value / purpose |
|---|---|
| `ESUUID.VERSION` | Library version, currently `0.1.0` |
| `ESUUID.NIL` | `00000000-0000-0000-0000-000000000000` |
| `ESUUID.MAX` | `ffffffff-ffff-ffff-ffff-ffffffffffff` |
| `ESUUID.DNS` | RFC namespace UUID for DNS names |
| `ESUUID.URL` | RFC namespace UUID for URLs |
| `ESUUID.OID` | RFC namespace UUID for ISO OIDs |
| `ESUUID.X500` | RFC namespace UUID for X.500 DNs |

### Random and time-based UUIDs

```jsx
ESUUID.v1(options);
ESUUID.v4(options);
ESUUID.v6(options);
ESUUID.v7(options);
```

Generation methods return a canonical UUID string by default. Pass a byte-array output buffer and optional offset to write 16 bytes into an existing array:

```jsx
var out = new Array(32);
ESUUID.v4({ random: random16 }, out, 8);
```

Relevant options:

| Option | Methods | Contract |
|---|---|---|
| `random` | v1/v4/v6/v7 | Byte array with at least 16 bytes; the first 16 are consumed |
| `rng` | v1/v4/v6/v7 | Function returning at least 16 byte values |
| `msecs` | v1/v6/v7 | Explicit millisecond timestamp |
| `nsecs` | v1/v6 | 100 ns sub-millisecond counter |
| `clockseq` | v1/v6 | Explicit 14-bit clock sequence |
| `node` | v1/v6 | Explicit 6-byte node identifier |
| `seq` | v7 | Explicit unsigned 32-bit sequence |

### Name-based UUIDs

```jsx
ESUUID.v3(value, namespace);
ESUUID.v5(value, namespace);
```

`value` may be a string or byte-like object. `namespace` may be a UUID string or exactly 16 bytes.

The standard namespace constants are also attached to `ESUUID.v3` and `ESUUID.v5`:

```jsx
var a = ESUUID.v3("www.example.com", ESUUID.v3.DNS);
var b = ESUUID.v5("www.example.com", ESUUID.v5.DNS);
```

### Parsing and validation

```jsx
var bytes = ESUUID.parse("919108f7-52d1-4320-9bac-f847db4148a8");
var text = ESUUID.stringify(bytes);

ESUUID.validate(text); // true
ESUUID.version(text);  // 4
```

`stringify(bytes, offset)` reads exactly 16 bytes beginning at `offset`.

### v1/v6 conversion

```jsx
var v6 = ESUUID.v1ToV6(v1);
var v1Again = ESUUID.v6ToV1(v6);
```

The conversion helpers reject valid UUIDs of the wrong source version instead of silently reinterpreting them.

### Stateful generators

```jsx
var ids = ESUUID.create({
  now: function () {
    return new Date().getTime();
  }
});

var a = ids.v7();
var b = ids.v7();
```

`create()` returns a stateful generator exposing `v1`, `v4`, `v6`, and `v7`. In the Adobe-host facade, a custom `now` function still inherits the installed ESRAND backend unless the caller explicitly supplies `rng` or `rand`.

### Capability reporting

```jsx
var caps = ESUUID.capabilities();
```

With ESRAND installed:

```text
standard:      RFC 9562
engine:        ExtendScript ES3
entropy:       ESRAND
cryptographic: false
```

Without ESRAND, `entropy` reports `Math.random-fallback`. That state is
deliberately non-cryptographic and the first actual fallback entropy request
emits a warning.

---

## Validation

Current 0.1.0 validation on the public-reproducible build:

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | pass |
| ExtendScript build + ES3 grammar checks | `npm run build` | 4/4 ExtendScript artifacts pass ESTC `acorn-ecma3` checks |
| Unit suite | `npm test` | 55/55 checks |
| Differential parity | `npm run differential` | 3,225/3,225 checks vs. `uuid@14.0.2` |
| Seeded invariants | `npm run fuzz` | 75,000/75,000 checks |
| Live Illustrator | `npm run live-verify -- --pipe <runtime>` | 54/54 checks on Illustrator 30.6.0 / ExtendScript 4.5.6 |
| Live host benchmark | `npm run live-benchmark -- --pipe <runtime> --rounds 3` | 9/9 benchmark lanes completed, 0 rejected samples |

The differential oracle is [uuidjs/uuid](https://github.com/uuidjs/uuid), version 14.0.2. The live check runs the actual generated `ESUUID.jsx` and `ESUUID.min.jsx` artifacts through COM Tool V2 `script.runFile`, and dogfoods the real sibling ESRAND distribution.

Machine-readable live evidence is committed under `evidence/`.

---

## Spec Conformance

ESUUID targets [RFC 9562, Universally Unique IDentifiers (UUIDs)](https://www.rfc-editor.org/rfc/rfc9562).

| RFC 9562 Appendix A vector | Result |
|---|---|
| UUIDv1 | pass |
| UUIDv3 | pass |
| UUIDv4 | pass |
| UUIDv5 | pass |
| UUIDv6 | pass |
| UUIDv7 | pass |

The same unit suite also covers NIL/MAX handling, RFC variant validation, UUIDv8 recognition, v1/v6 conversion, output-buffer boundaries, sequence limits, and monotonic state behavior.

Name-based UUIDs use an ES3-compatible MD5 implementation for v3 and SHA-1 implementation for v5 as required by the UUID versions. No `uuidjs` runtime code is vendored.

---

## Performance

Measured live on **Adobe Illustrator 30.6.0 / ExtendScript 4.5.6** using the ESTIMER vendor engine lane through COM Tool V2.

Protocol: one benchmark lane per `script.runFile`; ESTIMER prime; 5 warmups; 9 measured samples per lane; 3 rounds; batch-normalized per-operation values. The table reports the median across the three round summaries, with the observed minimum and p95 envelope recorded by the benchmark harness.

| Lane | Median us/op | Min us/op | p95 us/op | Median ops/s |
|---|---:|---:|---:|---:|
| v4, ESRAND entropy | 46.856 | 44.824 | 47.872 | 21,342 |
| v4, Math.random fallback | 52.524 | 51.340 | 56.660 | 19,039 |
| v4, explicit bytes | 37.308 | 35.836 | 41.146 | 26,804 |
| v7, ESRAND entropy | 56.012 | 52.464 | 72.820 | 17,853 |
| v7, Math.random fallback | 60.144 | 59.452 | 64.088 | 16,627 |
| v7, explicit bytes | 44.094 | 43.138 | 47.030 | 22,679 |
| parse | 122.081 | 118.234 | 130.118 | 8,191 |
| stringify | 92.386 | 86.850 | 115.859 | 10,824 |
| v5 | 897.700 | 885.300 | 922.660 | 1,114 |

The `Math.random` lanes measure steady-state fallback generation after the
one-time warning has already been emitted during warmup. These are host-engine
measurements, not Node throughput estimates. Re-run `npm run live-benchmark`
on the target Adobe host before using them as a capacity estimate for a
different machine or application.

A separate Node microbenchmark exists under `tests/benchmark.mjs` for development regression checks.

---

## Security Model

ESUUID is a pure JavaScript/ExtendScript UUID implementation. It does not open sockets, write files, load native code, or evaluate caller-provided source.

**ESUUID does not claim cryptographic entropy.** `ESUUID.capabilities().cryptographic` is deliberately `false`. The default Adobe-host random source is ESRAND, which is designed for deterministic random infrastructure rather than cryptographic key generation.

Consequences:

- Do not use ESUUID-generated UUIDs as passwords, bearer tokens, API secrets, session secrets, or cryptographic nonces.
- UUIDv3 uses MD5 and UUIDv5 uses SHA-1 because those hash functions are part of the specified UUID version algorithms. Their presence is not a recommendation to use MD5/SHA-1 for general-purpose security.
- If ESRAND and caller entropy are both missing, ESUUID falls back to `Math.random()`, emits a one-time warning, and reports `entropy: "Math.random-fallback"`.
- The `Math.random()` fallback is non-cryptographic and may be predictable; inject a CSPRNG-backed source for security-sensitive identifiers.
- Caller-supplied entropy is trusted as supplied. ESUUID validates byte shape and bounds, not randomness quality.

For ordinary identifiers, deterministic fixtures, namespace UUIDs, and time-ordered UUIDs inside ExtendScript automation, the entropy contract is explicit and inspectable.

---

## Compatibility

| Target | Status |
|---|---|
| Adobe Illustrator 30.6.0 | 54/54 live checks pass |
| ExtendScript 4.5.6 | live verified |
| ExtendScript ES3 grammar | 4/4 generated artifacts pass ESTC `acorn-ecma3` checks |
| Other Adobe ExtendScript hosts | ES3-compatible build; not yet separately live-certified |
| Node.js | Node 20+ for build/test tooling and ESM differential harness |
| Windows | live COM Tool V2 verification performed on Windows |
| macOS | generated ES3 code is host-neutral; live COM verification is Windows-only |

The runtime library itself does not depend on Node.js. Node is only used for build, test, differential, and evidence tooling.

---

## Engine quirks that shaped the design

All live observations in this section were verified on **Illustrator 30.6.0 / ExtendScript 4.5.6** unless stated otherwise.

### Bitwise composition cannot assume modern parser/minifier behavior

The implementation isolates compound 32-bit bitwise composition behind simple helper operations. This is intentional: ExtendScript's bitwise/operator parsing behavior can diverge from assumptions made by modern JavaScript optimization passes. The shipped minified and unminified builds are therefore both checked as ES3 and executed live.

### Reloading a global library can destroy monotonic state

A naive `$.evalFile()` reload would replace the facade and reset the state used by v1/v7 generators. The live suite explicitly verifies that re-evaluating the same compatible ESUUID version preserves the existing facade identity and that a v7 generated after reload remains ordered after the pre-reload value.

### Entropy availability can change during a host session

A script may load ESUUID before ESRAND and install ESRAND later. ESUUID therefore distinguishes `ESRAND` from `Math.random-fallback` capability state. Re-evaluating ESUUID after ESRAND becomes available upgrades the facade instead of preserving a stale fallback backend.

### Minified output must be tested as a separate runtime artifact

Static parsing is necessary but insufficient for ExtendScript. The live suite clears the existing global facade before loading `ESUUID.min.jsx`, preventing the reload-preservation path from masking a minifier regression. The minified artifact then runs RFC vectors and ESRAND-backed generation independently.

---

## Development

Portable Node-only validation:

```bash
npm ci
npm run verify:portable
```

Full ExtendScript build and offline validation:

```bash
npm run verify
```

Individual gates:

```bash
npm run typecheck
npm run build
npm test
npm run differential
npm run fuzz
npm run benchmark
npm run pack:smoke
npm run evidence:check
```

Maintainer live gates require a running COM Tool V2 runtime with an Illustrator target:

```bash
npm run live-verify -- --pipe <runtime-pipe>
npm run live-benchmark -- --pipe <runtime-pipe> --rounds 3
npm run release:gate -- --pipe <runtime-pipe> --target <target-id>
```

`npm run release:gate` runs the portable/full verification, the exact 54-check live Illustrator contract, a clean packed-tarball install/rebuild, the evidence/document synchronization gate, and the release manifest/checksum generator. The live benchmark is intentionally separate because its evidence remains valid only while its recorded ESUUID/ESRAND/ESTIMER artifact hashes match the current bytes.

The V2 harness prefers the stable per-user COM Tool V2 install at `%LOCALAPPDATA%\Programs\ComToolV2\current\ComTool.Cli.exe`, falls back to the toolkit workspace Release CLI when present, and accepts `COMTOOL_V2_CLI` / `--cli` as an explicit override. If another COM Tool runtime owns Illustrator, live gates wait safely for up to 60 seconds by default without stealing the lease; set `COMTOOL_V2_LEASE_WAIT_MS` or `--lease-wait-ms` to change that bound.

`npm run build` uses the pinned public ESTC dependency installed by `npm ci` by default. Set `ESUUID_USE_WORKSPACE_ESTC=1` to opt into the sibling toolkit ESTC checkout, `ESUUID_ESTC` to override the ESTC entry point, or `ESUUID_PYTHON` to select a Python executable. Standalone live validation can point at external sibling artifacts with `ESUUID_ESRAND_VENDOR`; live benchmarking additionally accepts `ESUUID_ESTIMER_VENDOR`.

---

## Repository layout

```text
es-uuid/
├─ src/
│  ├─ core.ts                  RFC 9562 algorithms and stateful generators
│  ├─ index.ts                 ESM public exports
│  ├─ jsx-entry.ts             ExtendScript global facade
│  ├─ types.ts                 public TypeScript contracts
│  └─ globals.d.ts             ExtendScript build globals
├─ dist/                       checked-in generated artifacts
├─ tests/
│  ├─ esuuid-test.mjs          unit and RFC vectors
│  ├─ differential.mjs         uuid@14.0.2 parity
│  ├─ fuzz.mjs                 seeded invariants
│  ├─ benchmark.mjs            Node regression microbenchmark
│  ├─ esuuid-live-probe.jsx    real-host verification probe
│  └─ live-verify.mjs          COM Tool V2 live gate
├─ bench/
│  ├─ live-bench.jsx           ESTIMER host benchmark probe
│  └─ run-live-bench.mjs       benchmark orchestrator
├─ tooling/
│  ├─ comtool-v2.mjs           live-gate transport helper
│  ├─ check-evidence.mjs        artifact/evidence/docs consistency gate
│  ├─ pack-smoke.mjs            clean tarball rebuild + byte parity
│  ├─ release-gate.mjs          end-to-end release orchestrator
│  ├─ release-manifest.mjs      hashes + immutable release lock
│  └─ minifier/                pinned conservative JSX minifier pipeline
├─ evidence/
│  ├─ latest-live-verify.json
│  ├─ latest-live-benchmark.json
│  └─ latest-pack-reproducibility.json
├─ release/
│  ├─ esuuid-v0.1.0.lock.json
│  └─ SHA256SUMS.txt
├─ esuuid-build.mjs
├─ extendscript.estc.config.mjs
├─ extendscript.vendor.estc.config.mjs
└─ package.json
```

---

## Credits

- [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562), the UUID specification.
- [uuidjs/uuid](https://github.com/uuidjs/uuid), used as the differential API/behavior oracle for mappings that make sense in ExtendScript.
- [docsforadobe](https://extendscript.docsforadobe.dev/), for ExtendScript and Adobe scripting references.
- [ESTC](https://github.com/thelabcorner/estc), the TypeScript-to-ExtendScript build and ES3 compatibility toolchain.
- [ESRAND](https://github.com/thelabcorner/es-rand), the default Adobe-host entropy backend used by ESUUID.

See [ATTRIBUTION.md](ATTRIBUTION.md) for the compatibility baseline and licensing notes.

---

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

---

<p align="center"><small>ESUUID: RFC 9562 UUID infrastructure for Adobe ExtendScript ES3.</small></p>
