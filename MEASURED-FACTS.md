# ESUUID measured facts

Measured facts for ESUUID 0.1.0. Values in this file are evidence records, not portability promises.

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

The release smoke packs ESUUID, extracts the tarball into a fresh ignored directory, installs only the dependencies declared by that packed package, runs the complete `npm run verify` gate there, then compares rebuilt output to the source tree.

- Clean packed-package install: pass
- Packed full verification: pass
- Byte-identical regenerated artifacts: **5/5**
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
- Probe SHA-256: `d4749dea12ba5f16aaa6f03dd091505d6576d812d0614cbe7b6b5845947436e6`
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
| v4 + ESRAND | 81.092 | 89.552 | 12,332 |
| v4 + Math.random fallback | 85.544 | 97.416 | 11,690 |
| v4 explicit bytes | 61.000 | 64.134 | 16,393 |
| v7 + ESRAND | 86.284 | 96.800 | 11,590 |
| v7 + Math.random fallback | 106.576 | 119.384 | 9,383 |
| v7 explicit bytes/time/sequence | 72.306 | 79.088 | 13,830 |
| parse | 190.027 | 202.872 | 5,262 |
| stringify | 143.352 | 149.349 | 6,976 |
| v5 | 1,526.480 | 1,692.940 | 655 |

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
