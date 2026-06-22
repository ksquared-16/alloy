/**
 * POS / external integration notes for canonical record resolution.
 *
 * Invoke `resolveIntakeRecordResolution` server-side with:
 * - org-scoped Supabase client
 * - `IntakeHouseholdCandidate` from any intake parser (forms, POS, paste, API)
 * - `source_kind` discriminator (e.g. `pos_terminal`, `public_form`, `create_lead`)
 *
 * Do not duplicate email/phone matching in POS — pass facts → household graph → resolver.
 * Apply proposals with the same rules as Create Lead commit:
 * - `link_existing` → use `linked_entity_id`, skip person/customer insert
 * - `create_new` → existing find-or-create paths
 * - `review_required` / `conflict` → hold for operator review (no silent duplicate on exact match)
 *
 * Future: POS can POST to `/api/admin/intake/record-resolution` or import
 * `@/lib/intake/resolve/resolveIntakeRecordResolution` in server actions.
 */
export const INTAKE_RECORD_RESOLUTION_MODULE = "@/lib/intake/resolve/resolveIntakeRecordResolution";
