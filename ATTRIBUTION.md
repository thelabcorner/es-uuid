# Attribution

ESUUID is an independent Adobe ExtendScript / ES3 implementation of RFC 9562 UUID semantics.

Its public API intentionally follows the widely used `uuidjs/uuid` package where that API maps cleanly to ExtendScript: `NIL`, `MAX`, namespace constants, `parse`, `stringify`, `validate`, `version`, UUID versions 1/3/4/5/6/7, and v1/v6 conversion helpers.

Reference implementation:
- uuidjs/uuid — https://github.com/uuidjs/uuid
- License: MIT
- Compatibility baseline researched for ESUUID 0.1.0: uuid 14.0.2 (2026-08-18)

Standards:
- RFC 9562, Universally Unique IDentifiers (UUIDs), May 2024

No uuidjs runtime code is vendored. ESUUID supplies its own ES3-compatible byte, UTF-8, MD5, SHA-1, timestamp, and state machinery.
