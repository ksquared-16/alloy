# Enrollment Status Seed + Migration Plan

**Path:** `docs/sprints/06_2026/enrollment_status_seed_and_migration_plan.md`  
**Date:** 2026-06-10  
**Status:** **Frozen — Phase 1 seed/migration (no queue membership or runtime behavior change)**  
**Doctrine:** [`enrollment_lifecycle_status_matrix_contract.md`](./enrollment_lifecycle_status_matrix_contract.md)

> **Alloy owns the operating model. The customer owns the labels.**

**Scope:** `status_definitions` vocabulary + `metadata` mappings for person, case, child identity, and enrollment disposition layers. **Not** queue SQL, drawer VM, or OCM row backfills (demo family reseed planned).

**Migration:** `supabase/migrations/20260610140000_enrollment_status_matrix_seed_metadata.sql`

---

## 1. Current audit findings

### 1.1 Table model (`status_definitions`)

| Column | Notes |
|--------|--------|
| `org_id` | Nullable for global/industry defaults; org rows are copy-on-write overrides |
| `entity_type` | `opportunities`, `opportunity_customer_members`, `persons`, … |
| `status_key` | Stable identifier — **never renamed** in this sprint |
| `status_label` | Customer-editable display |
| `sort_order`, `is_active`, `is_system`, `is_default` | Standard |
| `industry_key` | Optional vertical scope |
| **`metadata`** | **JSONB NOT NULL default `{}`** — **exists; use for layer mapping** |

No new metadata column required.

### 1.2 Prior seed migrations (reference)

| Migration | Layer |
|-----------|--------|
| `20260430143000_opportunity_customer_members_outcome_status_key.sql` | OCM MVP dispositions (childcare orgs) |
| `20260430232500_enrollment_pipeline_statuses_and_queue_buckets_v1.sql` | Opportunity **pipeline** keys + queue buckets |
| `20260422100000_opportunity_status_lifecycle_stage_metadata.sql` | Universal `metadata.lifecycle_stage` on opportunities |
| `20260530120000_person_child_lifecycle_statuses_and_dates.sql` | Person child lifecycle keys (all orgs) |
| `20260602120000_person_status_applicability_metadata.sql` | `applies_to_profiles` on persons |
| `20260601100000_child_lifecycle_status_definitions_v2.sql` | OCM keys (enrollment orgs) |
| `20260601110000_opportunity_case_status_definitions_v2.sql` | Case keys open/closed/inactive/archived |

### 1.3 Live DB snapshot (staging-linked project, 2026-06-10)

**Opportunities (`entity_type = opportunities`)** — pipeline keys active; case container keys partial:

| Present | Missing / gap |
|---------|----------------|
| `new_inquiry`, `contact_attempted`, `tour_scheduled`, `tour_completed`, `tour_no_show`, `follow_up_attempted`, `enrolling`, `waitlisted`, `enrolled`, `lost`, `closed`, `inactive`, `archived`, `ready_to_enroll`, … | **`open`** not seeded on enrollment org (migration inserts) |
| Legacy non-enrollment keys (`needs_a_quote`, `booked`, `won`, …) | Left untouched |

**OCM (`entity_type = opportunity_customer_members`)**:

| Present | Gap (seed adds) |
|---------|-----------------|
| `new_inquiry`, `tour_requested`, `tour_scheduled`, `tour_completed`, `waitlisted`, `offer_pending`, `enrolled`, `enrolling`, `interested`, `withdrawn`, `deferred`, `not_enrolling` | `needs_qualification`, `qualified`, `decision_pending`, `waitlist_paused`, `registration_pending`, `paperwork_pending`, `start_date_scheduled`, `not_a_fit`, `not_moving_forward`, `family_withdrew`, `aged_out` |

**Persons (`entity_type = persons`)**:

| Present | Notes |
|---------|--------|
| `active`, `inactive`, `archived`, `withdrawn`, `graduated`, `future_start` | `alloy_layer` metadata added by new migration |

### 1.4 Runtime dependencies (do not break)

| Consumer | Depends on |
|----------|------------|
| `enrollment_pipeline` queue buckets | Opportunity keys: `new_inquiry`, `contact_attempted`, `tour_scheduled`, … |
| `lifecycleVisibilityEvaluator` | Stage `included_status_keys` on opportunities (transitional) |
| `ENROLLMENT_STAGE_STATUS_KEYS` | Canonical opportunity key list per stage |
| `status_transition_rules_v1` | Opportunity `status_key` edges |
| Admin actions / workflows | Specific `status_key` strings in `condition_config` |
| OCM pickers | `entity_type = opportunity_customer_members` definitions |
| Person status UI | `applies_to_profiles` on persons rows |

**This sprint:** metadata only + insert missing definition rows. **No** `is_active = false` on pipeline keys. **No** queue_definition changes.

---

## 2. Metadata format (canonical)

Stored on `status_definitions.metadata` — merged with existing keys (`COALESCE ||`).

### 2.1 Cross-layer field

| Field | Values |
|-------|--------|
| `alloy_layer` | `person_status` \| `child_identity_status` \| `case_status` \| `legacy_case_pipeline` \| `enrollment_disposition` |
| `seed_source` | Migration id for audit |

### 2.2 Person / child identity (`entity_type = persons`)

```json
{
  "alloy_layer": "person_status",
  "applies_to_profiles": ["child_lifecycle", "person_generic"],
  "applies_to_roles": ["child", "parent", "guardian", "employee"]
}
```

Child-only identity keys use `alloy_layer: "child_identity_status"` and `applies_to_profiles: ["child_lifecycle"]`.

### 2.3 Case status (`entity_type = opportunities`, container keys)

```json
{
  "alloy_layer": "case_status",
  "lifecycle_stage": "case"
}
```

### 2.4 Legacy case pipeline (`entity_type = opportunities`, pipeline keys)

```json
{
  "alloy_layer": "legacy_case_pipeline",
  "deprecated_for_new_config": true,
  "enrollment_operator_stage": "tour",
  "lifecycle_stage": "qualification"
}
```

Preserves existing `lifecycle_stage` (intake/qualification/execution/…) where already set.

### 2.5 Enrollment disposition (`entity_type = opportunity_customer_members`)

```json
{
  "alloy_layer": "enrollment_disposition",
  "entity_scope": "enrollment_track",
  "stage_key": "tour",
  "active": true,
  "terminal": false,
  "outcome_category": null
}
```

Terminal example:

```json
{
  "alloy_layer": "enrollment_disposition",
  "entity_scope": "enrollment_track",
  "stage_key": "qualification",
  "active": false,
  "terminal": true,
  "outcome_category": "lost"
}
```

**Note:** Matrix doc §2.1 also documents `status_layer` / `enrollment_stage_key` / `is_active_disposition` — runtime Phase 2 may alias; **`alloy_layer` + `stage_key` + `active` + `terminal`** are the seeded keys for this sprint.

### 2.6 Deprecated / alias metadata (no row deletion)

| Key | entity_type | metadata |
|-----|-------------|----------|
| `interested` | OCM | `alias_of: new_inquiry`, `deprecated: true` |
| `enrolling` | OCM | `deprecated: true`, `replacement_key: registration_pending` |
| `withdrawn` | OCM | `deprecated: true`, `alias_of: family_withdrew` |
| `ready_to_enroll` | opportunities | `deprecated: true` (prior migration) |

---

## 3. Seeded records (target defaults)

### 3.1 Person status (all orgs)

| `status_key` | Label | `alloy_layer` |
|--------------|-------|---------------|
| `active` | Active | `person_status` |
| `inactive` | Inactive | `person_status` |
| `archived` | Archived | `person_status` |

### 3.2 Child identity status (all orgs, `persons`)

| `status_key` | Label | `alloy_layer` |
|--------------|-------|---------------|
| `active` | Active | `person_status` (shared profile) |
| `inactive` | Inactive | `person_status` |
| `withdrawn` | Withdrawn | `child_identity_status` |
| `graduated` | Graduated | `child_identity_status` |
| `archived` | Archived | `person_status` |
| `future_start` | Future Start | `child_identity_status` (optional) |

### 3.3 Case status (enrollment orgs, `opportunities`)

| `status_key` | Label | `alloy_layer` |
|--------------|-------|---------------|
| `open` | Open | `case_status` |
| `closed` | Closed | `case_status` |
| `inactive` | Inactive | `case_status` |
| `archived` | Archived | `case_status` |

### 3.4 Enrollment dispositions (enrollment orgs, `opportunity_customer_members`)

| Stage | `status_key` | Label | active | terminal | outcome_category |
|-------|--------------|-------|--------|----------|----------------|
| lead | `new_inquiry` | New inquiry | true | false | — |
| qualification | `needs_qualification` | Needs qualification | true | false | — |
| qualification | `qualified` | Qualified | true | false | — |
| tour | `tour_requested` | Tour requested | true | false | — |
| tour | `tour_scheduled` | Tour scheduled | true | false | — |
| tour | `tour_completed` | Tour completed | true | false | — |
| tour | `decision_pending` | Waiting for family decision | true | false | — |
| waitlist | `waitlisted` | Waitlisted | true | false | — |
| waitlist | `waitlist_paused` | Waitlist paused | true | false | — |
| enrolling | `offer_pending` | Offer pending | true | false | — |
| enrolling | `registration_pending` | Registration pending | true | false | — |
| enrolling | `paperwork_pending` | Paperwork pending | true | false | — |
| enrolling | `start_date_scheduled` | Start date scheduled | true | false | — |
| enrolled | `enrolled` | Enrolled | true | false | `success` |
| qualification | `not_a_fit` | Not a fit | false | true | `lost` |
| lead | `not_moving_forward` | Not moving forward | false | true | `lost` |
| tour | `family_withdrew` | Family withdrew | false | true | `withdrawn` |
| lead | `deferred` | Deferred | false | true | `deferred` |
| lead | `not_enrolling` | Not enrolling | false | true | `lost` |
| qualification | `aged_out` | No longer eligible | false | true | `lost` |

---

## 4. Legacy keys left untouched (active, metadata tagged)

### Opportunities (pipeline — queues still filter these)

`new_inquiry`, `new`, `contact_attempted`, `contacted`, `qualification`, `tour_scheduled`, `tour_completed`, `tour_no_show`, `follow_up_attempted`, `waitlisted`, `enrolling`, `ready_to_enroll`, `enrolled`, `lost`

Tagged `alloy_layer: legacy_case_pipeline` + `enrollment_operator_stage` hint where mapped.

### OCM (retained rows)

`interested`, `enrolling`, `withdrawn` — deprecated/aliased in metadata, **not** deleted.

### Non-enrollment opportunity keys

`needs_a_quote`, `quote_started`, `booked`, `scheduled`, `won`, `application_in_progress`, … — **no changes** in this migration.

---

## 5. Migration rules (applied)

| Rule | Implementation |
|------|----------------|
| Upsert only | `INSERT … WHERE NOT EXISTS` + `UPDATE metadata = metadata \|\| …` |
| No customer key deletes | Zero `DELETE` statements |
| No key renames | Stable `status_key` only |
| Preserve runtime keys | Pipeline opportunity keys stay `is_active = true` |
| Demo records | **No** `opportunities.status_key` / OCM backfill |
| Idempotent | Safe to re-run; `seed_source` stamped |

---

## 6. Risks

| Risk | Mitigation |
|------|------------|
| Queue lanes still use opportunity pipeline keys | Explicitly out of scope; Phase 5 membership migration |
| `enrolling` OCM key vs `enrolling` stage name | Deprecated metadata + `registration_pending` replacement |
| `withdrawn` collision (OCM vs child person) | OCM `withdrawn` aliased to `family_withdrew`; child roster uses persons |
| Metadata dual vocabulary (`stage_key` vs `enrollment_stage_key`) | Documented; runtime resolver in Phase 2 |
| `open` case status missing on some orgs | Migration inserts for enrollment orgs |
| Global vs org rows | Seeds target **org-scoped** enrollment orgs; global rows untouched |

---

## 7. Next runtime migration phases

| Phase | Work |
|-------|------|
| **2** | Settings UI + API read `alloy_layer` / `stage_key`; extend `normalizeStatusDefinitionMetadata` |
| **3** | `opportunity_customer_members.enrollment_stage_key` column + optional backfill from metadata |
| **4** | Layout blocks: enrollment stage vs disposition labels |
| **5** | Queue membership: OCM track + stage, not opportunity pipeline |
| **6** | Automations/BOS on `stage_key` + `outcome_category` transitions |
| **Demo reseed** | Refresh family/person/child **record** values after status_definitions stable |

---

## 8. Verification

```sql
-- Layer coverage on seeded rows
SELECT entity_type, status_key, metadata->>'alloy_layer', metadata->>'stage_key'
FROM status_definitions
WHERE metadata->>'seed_source' = 'migration_20260610140000_enrollment_status_matrix_seed_metadata'
ORDER BY entity_type, sort_order;

-- Case open present for enrollment orgs
SELECT org_id, status_key FROM status_definitions
WHERE entity_type = 'opportunities' AND status_key = 'open';

-- New OCM keys
SELECT status_key FROM status_definitions
WHERE entity_type = 'opportunity_customer_members'
  AND status_key IN ('needs_qualification','family_withdrew','decision_pending');
```

Apply:

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260610140000_enrollment_status_matrix_seed_metadata.sql
```

(Strip `?pgbouncer=true` from pooler URLs for `psql`.)

---

## Related documents

| Doc | Role |
|-----|------|
| [`enrollment_lifecycle_status_matrix_contract.md`](./enrollment_lifecycle_status_matrix_contract.md) | Layer doctrine + default matrix |
| [`entity_status_lifecycle_stage_and_location_scope_contract.md`](./entity_status_lifecycle_stage_and_location_scope_contract.md) | Five-layer model |
| [`enrollment_status_stage_binding_reality_check_v1.md`](./enrollment_status_stage_binding_reality_check_v1.md) | Transitional `enrollment_operator_stage` on opportunities |
