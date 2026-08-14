/**
 * Test stub for the `server-only` marker module.
 *
 * `server-only` is supplied by Next.js at build time and is not an installed dependency, so a module
 * that imports it cannot be loaded by vitest at all — the suite fails to import, not to assert.
 *
 * The repo's previous workaround was implicit: server modules that tests needed to exercise simply
 * did not use the marker. That trades a real build-time guarantee ("this never reaches a client
 * bundle") for testability, and it degrades silently — nothing tells you the guarantee is missing.
 *
 * Aliasing the marker to this empty module keeps both: the production build still enforces the
 * boundary, and tests can import the composer they need to certify. Nothing may be added here — the
 * module's only job is to resolve.
 */

export {};
