# Contributing

ESUUID targets Adobe ExtendScript's ES3-era runtime. A change is not complete merely because Node or TypeScript accepts it.

## Portable verification

```bash
npm ci
npm run verify:portable
```

The portable gate covers TypeScript, the Node ESM build, RFC/reference tests, `uuid@14.0.2` differential behavior, and deterministic fuzzing. Run `npm run verify` when the full ExtendScript build toolchain is available.

## Live Illustrator verification

With Illustrator running and a COM Tool V2 runtime available:

```bash
npm run live-verify -- --pipe <pipe-name>
npm run live-benchmark -- --pipe <pipe-name>
```

The live route must remain V2 `script.runFile`: SHA-bound file execution, explicit target selection when ambiguous, target lease acquisition, and lease release in `finally`.

## ExtendScript build rules

- ESTC is the sole ExtendScript emitter.
- Keep `src/jsx-entry.ts` side-effect-only.
- Do not export bindings from the JSX entry boundary.
- Generated JSX must not depend on `Object.defineProperty`, `Object.getOwnPropertyDescriptor`, or `Object.getOwnPropertyNames`.
- Do not add modern runtime assumptions merely because ESTC can parse/transpile the source.
- Keep the Node ESM bundle a separate host surface.

## Compatibility rules

The compatibility oracle is `uuid@14.0.2` for the overlapping API.

A deliberate semantic deviation requires:

1. a focused regression test;
2. documentation of the difference;
3. a reason specific to RFC 9562 or ExtendScript constraints.

Do not update tests simply to bless an unexplained divergence.

## Entropy rules

- Never silently fall back to `Math.random()`.
- Preserve the explicit `random` / `rng` / `rand.bytes(count)` contracts.
- ESRAND integration must remain truthfully marked non-cryptographic.
- Changes to default generator state behavior require both Node and live-engine tests.

## Performance claims

Do not publish host performance claims from Node results.

Live engine measurements use ESTIMER inside Illustrator and record:

- host and engine version;
- warmup/sample counts;
- round aggregation;
- rejected samples;
- raw structured evidence.

Keep benchmark changes reproducible and avoid timing COM transport as if it were UUID execution time.
