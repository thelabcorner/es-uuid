# ESUUID v0.2.0 — 2026-09-29

**SemVer: minor** — the standalone UUID API remains source-compatible, while the shipped single-file production distribution gains canonical ESPACK 0.5 manifest-v2 composition through ESRAND.

## Changed

- Added stable ESPACK library identity/provenance for ESUUID with exact UTF-8 artifact length/SHA-256 and an explicit activation contract.
- `ESUUID.bundle.jsx` / `ESUUID.bundle.min.jsx` resolve the dependency-first runtime chain `esrand@0.2.0 -> esuuid@0.2.0` through one persistent `$.global.ESPAK` control plane.
- The composed bundle carries no native payloads; entropy resolves through ESRAND transitively and reports `entropy: "ESRAND"`.
- The standalone ESUUID facade intentionally preserves its warned `Math.random()` fallback when ESRAND is not present.
- Repeated evaluation deduplicates byte-identical ESRAND/ESUUID library identities instead of reactivating the same source.
- Packed-package verification treats ESPACK as a build-time composer: a clean extracted tarball verifies the portable package surface, validates manifest-v2 provenance, and byte-compares the shipped composition artifacts without requiring sibling workspace repositories.

## Verification

- `npm run release:gate`: exit 0 on the final v0.2.0 candidate.
- Core API suite: **55 checks passed**.
- Differential oracle: **3,225** checks against `uuid@14.0.2`.
- Seeded invariant fuzzing: **75,000** checks passed.
- Illustrator live contract: **54/54** checks on Adobe Illustrator 30.6.0 / ExtendScript 4.5.6 through COMTool V2.
- Root-only composition proof: **PASS** for `ESRAND -> ESUUID` with no manual sibling preload.
- Packed reproducibility: **9/9** shipped artifacts byte-identical after clean tarball install; manifest-v2 provenance valid; second pack stable.
- Evidence/document synchronization and release-manifest generation: **PASS**.

## Release assets

- `ESUUID.jsx`
- `ESUUID.min.jsx`
- `ESUUID.facade.jsx`
- `ESUUID.bundle.jsx`
- `ESUUID.bundle.min.jsx`
- `ESUUID.manifest.json`
- `vendor-esuuid.js`
- `vendor-esuuid.min.js`
- `esuuid-core.esm.mjs`

The manifest's repository commit provenance intentionally names the frozen source/composition commit; the release lock separately binds the complete canonical source-tree blob set and all shipped artifact/evidence hashes.
