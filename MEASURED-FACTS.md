# ESUUID measured facts

Measured facts for ESUUID 0.2.0. Values in this file are evidence records, not portability promises.

## Portable verification

Current portable gate:

| Check | Result |
|---|---:|
| Unit/RFC checks | 55 passed |
| Differential parity vs `uuid@14.0.2` | 3,225 passed |
| Deterministic/property fuzz invariants | 75,000 passed |
| TypeScript | pass |

Commands:

```bash
npm run verify:portable
```

## ExtendScript build

Current generated artifact sizes:

| Artifact | Bytes |
|---|---:|
| `dist/ESUUID.jsx` | 18,746 |
| `dist/ESUUID.min.jsx` | 14,595 |
| `dist/vendor-esuuid.js` | 18,746 |
| `dist/vendor-esuuid.min.js` | 14,595 |
| `dist/esuuid-core.esm.mjs` | 20,459 |

All four ExtendScript artifacts pass ESTC conservative parser checks and the build's descriptor-module-helper guard.

## Packed-source reproducibility

Evidence: `evidence/latest-pack-reproducibility.json`

The release smoke packs ESUUID, extracts the tarball into a fresh ignored directory, installs only the dependencies declared by that packed package, runs the portable package gate there, validates the shipped ESPACK manifest-v2 closure/provenance, and byte-compares every shipped composition artifact to the source tree.

- Clean packed-package install: pass
- Packed portable verification: pass
- Packed manifest-v2 provenance validation: pass
- Byte-identical shipped artifacts: **9/9**
- Pinned differential oracle: `uuid@14.0.2`
- Pinned TypeScript: 5.9.3
- Pinned esbuild: 0.28.2
- ESTC: Git commit pinned in `package.json`

## Live Illustrator verification

Evidence: `evidence/latest-live-verify.json`

- Adobe Illustrator: 30.6.0
- ExtendScript: 4.5.6
- Transport: COM Tool V2 `script.runFile`
- Live checks: 54/54
- Probe SHA-256: `adb432f2cc7c27699073c5cb5c18a1c1e5438766fa9113f773cb525e17001e1b`
- Latest captured result: `ESUUID_LIVE_PASS|54|Illustrator=30.6.0|ExtendScript=4.5.6`

The live probe covers RFC vectors, readable/minified fresh loads, ESRAND-backed defaults, the warned one-time `Math.random()` fallback when ESRAND is absent, automatic upgrade from the fallback facade when ESRAND becomes available, explicit RNG/RAND overrides, offset guards, v1/v6 conversion guards, v1 node multicast behavior, v7 sequence bounds, and same-version reload preservation.

## Live performance

Evidence: `evidence/latest-live-benchmark.json`

Environment and protocol:

- Adobe Illustrator 30.6.0
- ExtendScript 4.5.6
- Windows
- COM Tool V2 `script.runFile`
- ESTIMER vendor engine timing lane
- 3 rounds per lane
- 5 warmups + 9 measured samples per lane/round
- batch-normalized per-operation medians
- 0 rejected samples in the latest evidence

| Lane | Median us/op | p95 us/op | Median ops/s |
|---|---:|---:|---:|
| v4 + ESRAND | 47.012 | 50.284 | 21,271 |
| v4 + Math.random fallback | 51.336 | 62.608 | 19,480 |
| v4 explicit bytes | 37.354 | 45.692 | 26,771 |
| v7 + ESRAND | 53.700 | 66.676 | 18,622 |
| v7 + Math.random fallback | 61.684 | 64.576 | 16,212 |
| v7 explicit bytes/time/sequence | 45.654 | 51.730 | 21,904 |
| parse | 135.185 | 149.374 | 7,397 |
| stringify | 95.471 | 97.147 | 10,474 |
| v5 | 1,016.220 | 1,190.840 | 984 |

The `Math.random` lanes are steady-state measurements; the one-time warning is
emitted during warmup and is not part of the measured medians. These values are
specific to the named host/version and benchmark protocol.

## Node development microbenchmark

A separate Node 22.23.2 development benchmark uses a 2,000-operation warmup and a single timed loop per invocation. Across three consecutive invocations on the development workstation, median throughput was:

| Lane | Median ops/s |
|---|---:|
| v4 explicit | 2,888,304 |
| v7 explicit | 3,124,131 |
| parse | 4,226,114 |
| stringify | 1,498,767 |
| v5 | 498,519 |

These Node figures are development throughput only. They are not presented as ExtendScript performance.
