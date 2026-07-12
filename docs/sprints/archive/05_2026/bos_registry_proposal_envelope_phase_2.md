# BOS Phase 2 — Registry + Proposal Envelope

**Status:** Complete (2026-05-18)  
**Prerequisites:** `bos_standardization_audit.md`, `docs/product/bos-foundation.md`  
**Migration:** `bos_standardization_migration.md`

## Goal

Add shared BOS registry and proposal envelope so capabilities describe themselves consistently and normalize proposal output **without** changing execution behavior.

## Shipped

| Item | Location |
|------|----------|
| Capability registry | `web/lib/bos/bosCapabilityRegistry.ts` |
| Capability types | `web/lib/bos/bosCapability.ts` |
| Proposal envelope | `web/lib/bos/bosProposalEnvelope.ts` |
| Status map (config assist) | `web/lib/bos/bosProposalStatusMap.ts` |
| Adapters (4 families) | `web/lib/bos/adapters/*` |
| Command card metadata | `web/lib/bos/commandSurfaceBosMetadata.ts`, optional `capability_key` on action cards |
| Tests | `web/tests/bos/**` |
| Barrel | `web/lib/bos/index.ts` |

## Explicit non-goals (honored)

- No new capabilities
- No route/folder renames
- No `web/lib/agent` migration
- No proposal table merge
- No API response shape changes
- No autonomous apply

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/bos
```

## Phase 3 candidates

See `bos_standardization_migration.md` § Phase 3+.
