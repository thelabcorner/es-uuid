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
| `dist/ESUUID.jsx` | 17,927 |
| `dist/ESUUID.min.jsx` | 13,977 |
| `dist/vendor-esuuid.js` | 17,927 |
| `dist/vendor-esuuid.min.js` | 13,977 |
| `dist/esuuid-core.esm.mjs` | 20,426 |

All four ExtendScript artifacts pass ESTC conservative parser checks and the build's descriptor-module-helper guard.

## Live Illustrator verification

Evidence: `evidence/latest-live-verify.json`

- Adobe Illustrator: 30.6.0
- ExtendScript: 4.5.6
- Transport: COM Tool V2 `script.runFile`
- Live checks: 48/48
- Probe SHA-256: `73bc149f6fb429f22bafb0bdcffc8e5e07f1d548d8e3c83b0b29d6e04e3ed2ad`
- Latest captured result: `ESUUID_LIVE_PASS|48|Illustrator=30.6.0|ExtendScript=4.5.6`

The live probe covers RFC vectors, readable/minified fresh loads, ESRAND-backed defaults, injected-only behavior, automatic upgrade from a stale injected-only facade when ESRAND becomes available, explicit RNG/RAND overrides, offset guards, v1/v6 conversion guards, v1 node multicast behavior, v7 sequence bounds, and same-version reload preservation.

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
| v4 + ESRAND | 85.188 | 91.884 | 11,739 |
| v4 explicit bytes | 63.876 | 67.152 | 15,655 |
| v7 + ESRAND | 96.208 | 100.980 | 10,394 |
| v7 explicit bytes/time/sequence | 75.632 | 80.724 | 13,222 |
| parse | 201.364 | 208.582 | 4,966 |
| stringify | 153.241 | 161.213 | 6,526 |
| v5 | 1,569.160 | 1,662.380 | 637 |

These values are specific to the named host/version and benchmark protocol.

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
