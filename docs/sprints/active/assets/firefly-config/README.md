# Firefly configuration capture (July 2026): retired as a configuration source

This directory is the July 2026 API capture of Firefly's Enrollment configuration (`inventory.json`,
`raw-builder.json`, `provenance.json`, `reached-qualified-resolution.json`), written by the Playwright specs
`web/playwright/tests/firefly-{config-inventory,raw-builder,stage-provenance}.spec.ts`.

**It is not a source for any tenant's configuration, and nothing may import from it.** It was taken from a local
server against an unrecorded database, it carries certified defects, and the E2 seed builder deliberately does not use
it (P3 C14, X3: `docs/platform/runtime/environments-p3-staging-classification-2026-11-25.md`).

What replaces it (first-promotion briefing M8, §5.6):

- **Export:** `npm run tenant:config:export` (from `web/`) reads one org's configuration allowlist
  (`web/lib/tenancy/configTransfer/allowlist.ts`) in a read-only transaction and writes a reviewable
  `alloy.tenant-config-export.v1` file, recording its source database.
- **Import:** `npm run tenant:config:import -- plan|apply|verify` re-authors that file into a named org through the
  app's write paths. Its file gate refuses anything that is not that format, so these files cannot be imported
  (pinned by `web/tests/tenancy/tenantConfigTransfer.test.ts`).

The files stay only as fixed structural fixtures for the lifecycle tests that read them
(`web/tests/lifecycle/{fireflyConfigCertification,fireflyStageProvenance,qualificationVisibility,remediateDanglingStageReferences}.test.ts`).
Do not refresh them to stand in for a tenant's current configuration.
