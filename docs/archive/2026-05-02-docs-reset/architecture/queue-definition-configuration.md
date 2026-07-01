# Queue stages (labels / status buckets) — where config lives

This document is a closeout reference to reduce drift between seed scripts, DB state, and AdminV2 UI.

## Source of truth today

- **Queue labels and status buckets** for a work unit’s queue UI come from **`work_units.queue_definition`** (JSON), specifically the **`queues`** array on that object (each entry has at least `key`, `label`, and related metadata used by the queue layer).
- The enrollment pipeline’s default shape for dev/staging is written by the script **`web/scripts/ensureEnrollmentPipelineWorkUnitV1.ts`**, which upserts the enrollment work unit and merges/preserves a v1 **`queue_definition`** (including `queues` and any `ui` hints).

## Admin UI

- **AdminV2 does not** currently ship an editor for `queue_definition` or per-queue labels/buckets.
- **Future work:** a dedicated settings surface should load and **safely patch** `QueueDefinition` (validate schema, preserve unknown keys, avoid partial writes that drop queues). No separate “label table” is assumed unless product adds one later.

## Related demo seed

- **`web/scripts/seedEnrollmentPipelineDemoData.ts`** seeds opportunities against a resolved enrollment work unit; it does **not** define queue bucket labels. Queue labels shown in the UI still come from **`queue_definition.queues`** as above.

---

## Appendix: optional SQL — demo opportunities in org `7803388d-cdee-4afb-89cf-23a137f39423`

**Do not run blindly.** Inspect counts and FKs first. Intended use: remove `enroll_demo_*` opportunities that landed in the wrong org.

```sql
-- 1) Inspect
SELECT id, metadata->>'seed_key' AS seed_key, status_key, created_at
FROM opportunities
WHERE org_id = '7803388d-cdee-4afb-89cf-23a137f39423'
  AND metadata->>'seed_key' LIKE 'enroll_demo_%'
ORDER BY created_at;

-- 2) Delete demo-tagged rows in that org only (adjust if your schema requires child deletes first)
DELETE FROM opportunities
WHERE org_id = '7803388d-cdee-4afb-89cf-23a137f39423'
  AND metadata->>'seed_key' LIKE 'enroll_demo_%';

-- 3) Optional: remove enrollment_pipeline work unit in that org if it exists only for mistaken demo
--    and has no production dependencies. Verify no other opportunities reference it.
-- SELECT id, key, name FROM work_units
-- WHERE org_id = '7803388d-cdee-4afb-89cf-23a137f39423' AND key = 'enrollment_pipeline';
-- DELETE FROM work_units WHERE id = '<id from SELECT>';  -- only after manual review
```

If `DELETE FROM opportunities` fails on FK constraints, delete or reassign dependent rows per your schema (activities, assignments, etc.) before retrying.
