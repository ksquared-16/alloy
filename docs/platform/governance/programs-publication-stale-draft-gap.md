# Programs publication — `base_revision_id` is provenance, not a guard

**Status:** discovered during the `bp-config-integrity` sprint. **Not changed.** Programs is out of
scope for that sprint; this records the finding so it is not lost and not silently inherited.

**Severity:** High. Silent lost-update of published configuration, with no error and no signal.

## The defect

`program_drafts.base_revision_id` looks like an optimistic-concurrency token. It is not. It is
written after a successful publish and never read as a precondition.

`supabase/migrations/20260722020000_configuration_publication_runtime_v1.sql:443`:

```sql
UPDATE public.program_drafts
SET base_revision_id = v_revision.id,
    updated_by = p_actor_user_id,
    updated_at = now()
WHERE id = v_draft.id;
```

That is the **only** write, and there is no corresponding comparison anywhere in
`publish_program_revision_v1` (`:305`–`:459`).

## Evidence

A grep for `base_revision_id|baseRevisionId` across `web/` and `supabase/` returns only:

| Site | Role |
|---|---|
| `20260722020000_…sql:34` | column definition |
| `20260722020000_…sql:88-92` | FK to `program_revisions` |
| `20260722020000_…sql:443` | the post-publish `SET` |
| `web/lib/programs/publication/programPublicationService.ts:144` | mapper, for display |
| `web/lib/programs/publication/programPublicationModel.ts:28` | TS type |
| tests | assertions on the value being *written* |

No call site treats it as a precondition. This is pinned by a regression assertion in
`web/tests/configPublication/businessProcessPublicationMigration.test.ts` — if someone adds the
check, that test fails and this document should be retired.

## What is and is not protected today

**Protected.** Concurrent publishes cannot interleave: `publish_program_revision_v1` takes
`SELECT … FOR UPDATE` on `programs` (`:328`) and `program_drafts` (`:339`), so revision numbering is
serialized and `max(revision_number) + 1` is race-safe.

**Not protected.** A draft opened against revision 3 can publish over revision 7. Two operators
editing the same Program in different tabs or sessions: the second publish silently discards the
first operator's published work, and the audit trail records it as ordinary succession — revision 8
following revision 7, with nothing marking it as an overwrite.

The nearest thing to a conflict check is advisory only: `programPublicationService.ts:624-636`
compares the draft checksum against the active revision's checksum and rejects a no-op publish
("The working draft matches the active revision."). That is a **non-transactional read-then-RPC**,
so it is a UX nicety, not a race-safe guard — and it catches only the *identical* case, never the
*divergent* one, which is the dangerous direction.

## Risk

The failure is silent. There is no error, no conflict, no warning, and the resulting history looks
correct. Detection after the fact requires comparing revision payloads by hand. The blast radius is
whatever a Program revision governs — eligibility, audience, qualification requirements, commercial
posture — distributed onward to Locations through `configuration_consumptions`.

## Recommended follow-up

Port the check the business-process domain now has
(`20260730130000_business_process_projection_write_guard.sql` /
`20260730120000_business_process_configuration_publication_v1.sql`): resolve the current publication
for `(org, 'programs', program_id)` inside the transaction, and

```sql
IF v_draft.base_revision_id IS DISTINCT FROM v_current_revision_id THEN
    RAISE EXCEPTION 'program_draft_stale (current_revision=% attempted_base=%)' …
        USING ERRCODE = '40001';
END IF;
```

Surface it to the operator as a 409 naming current revision, attempted base, and a reload-and-
reconcile action.

## Why it was not changed here

1. **Scope.** This sprint's remit is business-process configuration integrity. Programs has its own
   operator flows, its own distribution pipeline (`configuration_distribution_runs` →
   `configuration_consumptions` → `location_program_categories`), and its own certification
   surface.
2. **It is a behavioural change, not a bug fix.** Publishes that currently succeed would begin
   failing with a conflict. Some of those are the lost updates we want to stop; others may be
   workflows operators rely on. Telling them apart requires exercising the Programs UI, which this
   sprint has not done.
3. **Consistency is not a reason to inherit a defect.** The business-process domain deliberately
   does *not* copy this shape. Making the two match by weakening the new one would be the wrong
   direction.

## Related, discovered alongside

The Programs **distribution** tables have a TS writer inserting columns that no in-repo migration
creates: `programPublicationService.ts:946-1002` writes `subject_key`, `revision_id`,
`revision_number`, `revision_checksum`, `requested_by`, `requested_by_label` into
`configuration_distribution_runs`, and `domain_key`, `subject_key`, `target_kind`, `target_key`,
`target_label`, `provider_result` into `configuration_distribution_targets`. Neither shape appears
in `20260722020000_…sql:114-149`.

`supabase/migrations/20260722153000_configuration_distribution_runs_publication_id.sql:2` admits it:
some environments already have a differently-shaped runs table. **The deployed schema is therefore a
superset that lives outside migrations**, which means a fresh environment built purely from this
repo's migrations would not match production, and anyone reusing the distribution half of the
publication runtime cannot trust the migrations as the schema of record.

The business-process domain uses only the **publication** half (`configuration_publications` plus
the generic immutability guard), which is fully described by its migration, so it is unaffected.
This is recorded because it affects the next domain that reuses distribution.
