# ESUUID sibling-library microprototype

Measured 2026-09-26 inside **Adobe Illustrator 30.6.0 / ExtendScript 4.5.6**
through COM Tool V2. This is post-v0.1.0 R&D; it does not change the released
ESUUID implementation or the immutable `v0.1.0` tag.

## Decision

Do **not** integrate ESSTR, ESARR, or the current public ESCHARS primitives into
ESUUID's production hot paths.

Keep ESUUID's direct fixed-size ES3 loops and current string/hash pipeline as the
semantic and performance authority.

Across three locked, hash-identical main replicates, every sibling-assisted
candidate had a median candidate/baseline time ratio above `1.00x`. A separate
three-replicate forced-native ESSTR experiment also lost decisively.

The remaining native optimization direction worth a separate experiment is a
**whole-workload v3/v5 primitive** that crosses the native boundary once and does
not rematerialize the name as a JavaScript byte array before hashing.

## Evidence authority

Canonical aggregate:

- `evidence/aggregate.json`

Locked main replicates:

- `evidence/final-a.json`
- `evidence/final-b.json`
- `evidence/final-c.json`

Locked forced-native ESSTR replicates:

- `evidence/native-a.json`
- `evidence/native-b.json`
- `evidence/native-c.json`

The aggregate rejects drift in runner, lane probe, ESTC config, compiled
prototype, ESUUID vendor artifact, ESTIMER vendor artifact, relevant sibling
source files, and native DLLs before combining measurements.

The three main replicates each passed **16 correctness checks**, had **0 failed
benchmark lanes**, ran on the same Illustrator target generation, and
independently reproduced the ESCHARS embedded-NUL mismatch.

## Method

The prototype imports the actual sibling source modules through ESTC:

- ESCHARS: `charCodeAt`, `hexEncode`, native load/unload;
- ESSTR: pure trim plus its optional native-gate surface;
- ESARR: `map`, `forEach`, and ES3 `slice`.

Timing uses the real ESTIMER vendor artifact. Every main timing lane runs as a
separate SHA-bound COM Tool V2 `script.runFile` request under an exclusive
target lease. The runner has a process-owned stale-recovering lock so concurrent
prototype processes cannot interleave or silently overwrite evidence.

This isolation is deliberate. An earlier monolithic prototype placed repeated
large-name UUID hashing workloads in one ExtendScript dispatch, exceeded V2's
60-second worker watchdog, and demonstrated that a long synchronous host script
can outlive the killed worker. That run is **not** performance evidence; the
current one-lane-per-request harness replaces it.

## Three-replicate performance result

Candidate/baseline is elapsed time. Above `1.00x` means the sibling-assisted
candidate is slower.

| Candidate | Median candidate / baseline | Three-run range | Median delta | Decision |
|---|---:|---:|---:|---|
| ESCHARS per-character UUID validate | **3.91x** | 3.63-4.48x | +291% | reject |
| ESCHARS per-character UUID parse | **3.74x** | 3.69-4.32x | +274% | reject |
| ESCHARS UTF-8 preprocessing, 1K name | **2.36x** | 2.33-2.39x | +136% | reject |
| ESCHARS UTF-8 preprocessing, 4K name | **1.78x** | 1.61-1.81x | +78% | reject |
| ESCHARS-assisted UUIDv5, short name | **1.10x** | 0.99-1.16x | +10% | reject / noise-scale |
| ESCHARS-assisted UUIDv5, 1K name | **1.31x** | 1.29-1.41x | +31% | reject |
| ESCHARS-assisted UUIDv3, 1K name | **1.40x** | 1.25-1.42x | +40% | reject |
| ESSTR trim + validate, 64 UUIDs | **1.14x** | 1.13-1.40x | +14% | reject |
| ESARR map-based stringify | **1.35x** | 0.98-1.45x | +35% | reject / noise-scale |
| ESARR map 16-byte copy | **2.84x** | 2.77-3.02x | +184% | reject |
| ESARR slice 16-byte copy | **2.02x** | 1.85-2.80x | +102% | reject |
| ESARR forEach 16-byte emit | **4.35x** | 3.87-4.40x | +335% | reject |

The two small lanes that dipped barely below parity in one replicate
(ESCHARS-assisted short v5 and ESARR map stringify) are not repeatable wins:
their three-run medians remain slower, and adopting either would add dependency
and code-surface cost for no stable throughput gain.

## ESSTR native accelerator result

The dedicated native probe forced ESSTR's native gate to `minLength=0`, so the
native DLL was used even for UUID-sized strings. Each timed sample validates 64
rotating UUID strings.

Across three locked native replicates:

| Lane | Median time / 64 | Ratio vs direct validate | Three-run ratio range |
|---|---:|---:|---:|
| Direct ESUUID validate | 6.375 ms | 1.00x | — |
| ESSTR pure trim + validate | 8.146 ms | **1.28x** | 1.25-1.29x |
| ESSTR forced-native trim + validate | 13.092 ms | **2.05x** | 2.03-2.10x |

Forced native trim is also **1.62x slower than pure ESSTR trim** at the median.
There is no UUID-sized crossover hidden behind ESSTR's normal native threshold.

## Correctness findings

### ESCHARS

Per-character native calls preserve ordinary UUID behavior after the prototype
keeps ESUUID's existing format/version/variant checks, but each ExternalObject
crossing overwhelms the tiny 36-character workload. Median validation time was
3.91x baseline and parse was 3.74x baseline.

The `hexEncode` path preserves ordinary Unicode including astral characters in
the tested v3/v5 cases, but **embedded NUL does not preserve v5 semantics across
the native string boundary**. All three locked replicates independently
reported `nulBehavior: "mismatch"`.

That matches ESCHARS' documented channel contract: the direct string boundary is
C-NUL-terminated and lone surrogate transport is unsafe. Any ESCHARS-assisted
string-name path would therefore require an unsafe-input pre-scan/fallback even
before performance is considered.

The current general-purpose UTF-8 route is structurally unfavorable for ESUUID:

1. cross into native code;
2. encode the UTF-8 bytes as hex to survive the string boundary;
3. cross back to ExtendScript;
4. scan/decode the hex into a JavaScript byte array;
5. run ESUUID's existing JavaScript MD5/SHA-1 implementation.

ESCHARS' `packBytes` does not remove this constraint for arbitrary Unicode:
it is a byte-oriented ASCII/Latin-1 channel with a surrogate-window caveat.
There is no current public ESCHARS primitive that returns arbitrary UTF-8 as a
native byte array directly consumable by ESUUID's JavaScript hash.

### ESSTR

Automatically trimming before `validate()` or `parse()` is not merely extra
work; it changes ESUUID's strict input contract:

```text
ESUUID.validate("  <uuid>  ")        -> false
ESUUID.validate(ESSTR.trim(...))     -> true
```

That makes internal trim integration semantically wrong for the current API.
The performance result independently rejects it: pure ESSTR adds ~28% in the
forced-native experiment's median, and the native trim path adds ~105%.

Applications that explicitly want forgiving input can still trim before calling
ESUUID, but that policy belongs to the caller rather than ESUUID itself.

### ESARR

ESUUID's byte arrays are overwhelmingly fixed at 16 bytes. Direct counted loops
are a better fit than generalized callback/spec machinery on this runtime.

The measured substitutions confirm that:

- `map` copy: 2.84x baseline;
- `slice` copy: 2.02x baseline;
- `forEach` emit: 4.35x baseline;
- map-based stringify: 1.35x median baseline.

ESARR remains useful as a compatibility library, but its abstraction costs do
not pay back on ESUUID's tiny fixed-width internal arrays. Its native lanes also
target different operation classes such as sort/reverse/join/index lookup, not
the map/forEach/fixed-copy work ESUUID needs.

## Actual optimization frontier

The measurements point at one real bottleneck: **large-name v3/v5 hashing**.

At 1K names, the pure ES3 hash path is already tens of milliseconds per
operation. Moving only UTF-8 conversion into ESCHARS makes the total path slower
because the JavaScript hash still has to consume a rematerialized byte array.

If native acceleration is worth adding later, prototype a whole-workload surface
instead of composing existing helpers. Candidate shapes:

```text
ESCHARS.md5Utf8Hex(name)
ESCHARS.sha1Utf8Hex(name)
```

Better, if namespace handling can be made exact in one native call:

```text
ESCHARS.uuidV3(name, namespaceUuid)
ESCHARS.uuidV5(name, namespaceUuid)
```

The pure ES3 implementation should remain the semantic oracle/fallback.

Any native v3/v5 experiment must cover:

- RFC 9562 vectors;
- string and 16-byte namespace forms;
- byte-array name inputs;
- empty names;
- embedded NUL;
- lone surrogates / malformed UTF-16;
- astral Unicode;
- short-name crossover;
- 1K / 4K / 16K scaling;
- exactly one native boundary crossing per UUID operation;
- parity against the current pure ES3 implementation.

## Reproduce

With a COM Tool V2 runtime and one Illustrator target available:

```bash
node prototypes/sibling-libs/run-microbench.mjs \
  --pipe <v2-pipe> \
  --lease-wait-ms 120000

node prototypes/sibling-libs/run-esstr-native.mjs \
  --pipe <v2-pipe> \
  --lease-wait-ms 120000

node prototypes/sibling-libs/aggregate.mjs
node prototypes/sibling-libs/verify-evidence.mjs
```

The main runner rebuilds the ESTC prototype, rejects descriptor-helper
contamination, runs the correctness lane, runs each timing lane independently,
and writes session-scoped machine-readable evidence. The ESSTR-native runner
uses the same process lock and evidence discipline. `aggregate.mjs` refuses to
combine runs when methodology, target generation, sibling source, DLL, or
artifact hashes drift. `verify-evidence.mjs` then re-hashes the six frozen
replicates plus the current runner/probe/config/vendor/sibling/DLL inputs and
fails if the documented no-win decision is stale.
