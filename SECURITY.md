# Security

ESUUID implements UUID formatting, hashing, timestamp, parsing, and conversion logic. It does not claim that every entropy source used with it is cryptographically secure.

## Supported versions

Security fixes are applied to the latest tagged release.

## Reporting a vulnerability

Use GitHub's private **Report a vulnerability** / security-advisory flow for this repository rather than opening a public issue with exploit details.

## Entropy boundary

The ExtendScript facade can use ESRAND when it is present on `$.global`.

ESRAND is deterministic and non-cryptographic. Therefore ESRAND-backed ESUUID generation is not appropriate when an attacker must not be able to predict UUID values.

Do not rely on ESRAND-backed UUIDs for:

- authentication/session secrets;
- password-reset tokens;
- cryptographic nonces;
- encryption/signing keys;
- capability URLs whose security depends on UUID unpredictability.

For security-sensitive generation, inject an appropriate cryptographically secure 16-byte source with `random`, `rng`, or `create({ rand })`.

ESUUID never silently substitutes `Math.random()` when no entropy backend exists.

## Other security-relevant reports

Reports are also welcome for issues such as:

- unexpected code execution;
- unsafe global mutation;
- release-artifact tampering;
- dependency compromise;
- malformed-input behavior that violates documented bounds;
- UUID validation accepting values outside the documented RFC 9562 contract.
