# Relationship Edge — Final Gap Closure

## Closed in this change

1. **Choice Option picker** — `EmergencyContactsSection` uses `SelectFieldControl` + `useOptionSetSelectOptions` for native and tenant Choice PCR fields.
2. **`link_existing_person`** — child-scoped writes route through `applyCanonicalChildScopedRelationships` when role maps to PCR operational role.
3. **Staging API certification** — `web/scripts/certifyPersonChildRelationshipStagingApi.ts` (authenticated JWT cookie).
4. **Supabase Preview cleanup** — `web/scripts/cleanupSupabasePreviewBranches.sh` deletes stale branches not tied to open PRs.

## Manual staging operator checklist

- Enable `emergency_contacts` on Children Surface; open Mia drill-in → Alex with relationship type Choice label.
- Edit relationship type via select picker; confirm persistence.
- Run certification script with staging session cookie.

## Supabase Preview

Run cleanup script before migration-bearing PRs if Preview skips due to branch capacity.
