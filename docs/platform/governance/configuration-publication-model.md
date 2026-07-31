# Alloy Configuration Publication Model

Sprint: `bp-config-integrity` (slot 6), Law 4. Design + implementation contract.
Companions: [`configuration-integrity-laws.md`](./configuration-integrity-laws.md),
[`configuration-overwriter-root-cause.md`](./configuration-overwriter-root-cause.md).

## The model

```
  Draft            editable, may be invalid, one per subject, mutable
    │
    ▼  validate
  Validated draft  validation_errors == [] ; draft_status = 'validated'
    │
    ▼  publish  (single RPC, single transaction)
  Revision         IMMUTABLE payload snapshot + checksum + revision_number
    │
    ▼
  Publication      IMMUTABLE act: who published which revision, when
    │
    ▼  projection (same transaction)
  Runtime          departments.metadata.lifecycle_builder_v1
```

**Drafts may be invalid. Published configuration may not.** That asymmetry is the whole point:
operators need somewhere to build a half-finished process without the platform refusing to save.

## The seven questions

| Question | Answer |
|---|---|
| What is **editable**? | `business_process_drafts.payload` — one row per department, freely mutable, may be invalid. |
| What is **draft**? | The same row. `draft_status ∈ {draft, validated}`; `validation_errors` is the reason it cannot publish. |
| What is **published**? | The latest `configuration_publications` row for `(org, 'business_process', department_id)`. |
| What is **immutable**? | `business_process_revisions` and `configuration_publications` — UPDATE/DELETE blocked by trigger. |
| What can be **rolled back**? | Any prior revision, by *republishing it forward* as a new revision. History is append-only; nothing is ever rewritten. |
| What detects **conflicting edits**? | `draft.base_revision_id` compared against the current published revision, inside the publish transaction, under `FOR UPDATE`. |
| What is the durable **runtime source**? | `departments.metadata.lifecycle_builder_v1`, written by the publish RPC in the same transaction as the revision. Runtime readers are unchanged. |

---

# What is reused, and the one gap that must be closed

Reused from `20260722020000_configuration_publication_runtime_v1.sql` with no modification:

- `configuration_publications` — already generic: `domain_key`, `subject_id`, `revision_id`,
  `revision_number`, `payload_checksum`, `published_by`, `audit_event_id`. Nothing in the table,
  its constraints, or its indexes is Programs-specific. A second domain supplies a new `domain_key`.
- `configuration_publication_immutable_guard()` (`:226`) — a **generic** trigger function keyed on
  `TG_TABLE_NAME`. Attach it to the new revisions table verbatim.
- The RLS shape (`:852`–`:890`): authenticated org-readers via `has_org_role`, all mutation through
  `service_role`.
- `workflow_events` as the audit spine, linked by `configuration_publications.audit_event_id`.

## The gap: lineage is recorded but never enforced

`publish_program_revision_v1` takes `FOR UPDATE` on the program and draft rows, so concurrent
publishes serialize. But it **never compares `base_revision_id`**. At `:443` it only *writes* it:

```sql
UPDATE public.program_drafts
SET base_revision_id = v_revision.id, …
```

So `base_revision_id` is **provenance, not a guard**. A draft opened against revision 3 can publish
straight over revision 7, and the model records the overwrite as if it were a normal succession.

That is precisely the failure mode Law 4 forbids — *"a stale draft must never overwrite a newer
publication."* The existing runtime is therefore necessary but **not sufficient**, and the business
process domain closes the gap rather than inheriting it.

> **Recommendation beyond this sprint:** the same check belongs in
> `publish_program_revision_v1`. Programs has the identical latent defect. Out of scope here — it
> needs its own certification against Programs' own operator flows — but it should be raised.

---

# Revision model

- `revision_number` is allocated `coalesce(max(revision_number), 0) + 1` **under the subject-row
  `FOR UPDATE` lock**, matching the Programs pattern. The lock is what makes the max+1 race-safe;
  the `UNIQUE (org_id, department_id, revision_number)` constraint is the backstop.
- `payload` is the complete `lifecycle_builder_v1` object — the whole process inventory, not a diff.
  Publication is all-or-nothing (Law 5), so a revision is a self-contained snapshot.
- `payload_checksum` is computed by the caller over the **canonically serialized** payload and
  passed in. Canonical serialization (stable key order) matters: without it, two semantically
  identical payloads produce different checksums and no-op detection breaks.
- Revisions are never updated or deleted. Correction means a new revision.

# Conflict model

At publish, inside one transaction:

1. `SELECT … FOR UPDATE` the department row — serializes concurrent publishes for this subject.
2. Resolve the current published revision from `configuration_publications` (latest
   `revision_number` for `(org, 'business_process', department_id)`).
3. **Compare** `draft.base_revision_id` with that revision id:
   - both absent → first publish, allowed;
   - equal → draft is current, allowed;
   - **different → `business_process_draft_stale`**, naming current and attempted revision.
4. Refuse unless `draft_status = 'validated'` and `validation_errors` is empty.

The 409 surfaced to the operator names the current revision, the attempted base, and the
recommended action (reload and reconcile). Law 3 governs *what* is valid; Law 4 governs *whether the
writer was looking at the current world*.

**Non-publish writers.** The ~15 direct `departments.metadata` writers remain the real exposure:
CAS on the publish path does not stop `applyVerticalBootstrap` replacing the column. Publication
becomes the *only* sanctioned path; converging those writers onto it is tracked as the follow-on to
this slice, not silently assumed done.

# Rollback model

Rollback is **forward-only**. To restore revision *N*, copy its payload into a new revision *M = max+1*
carrying `rolled_back_from_revision_id = N`, and publish that.

- Immutability holds — no revision is ever rewritten.
- History stays linear and auditable; the rollback is itself a publication with an actor and a
  timestamp.
- The runtime projection is rewritten in the same transaction, so runtime and publication never
  disagree.

There is **no existing rollback path in the Programs implementation** to inherit; this is new.

---

# Schema (added by this slice)

```
business_process_drafts
  id, org_id, department_id                  UNIQUE (org_id, department_id)
  payload jsonb                              the editable lifecycle_builder_v1
  base_revision_id  -> business_process_revisions(id)   the conflict token
  draft_status      draft | validated
  validation_errors jsonb                    CHECK: validated => errors == []
  created_by/at, updated_by/at

business_process_revisions                   IMMUTABLE (trigger)
  id, org_id, department_id
  revision_number int                        UNIQUE (org_id, department_id, revision_number)
  payload jsonb                              full snapshot
  payload_checksum text
  source_draft_id, rolled_back_from_revision_id
  published_by, published_at
```

`configuration_publications` is **reused unchanged**, with `domain_key = 'business_process'` and
`subject_id = department_id`.

## RPCs

- `publish_business_process_revision_v1(org, department, actor, checksum)` → validate + CAS +
  revision + publication + audit event + runtime projection, one transaction.
- `rollback_business_process_to_revision_v1(org, department, target_revision, actor)` → forward
  republish of a prior payload.

---

# Why the projection stays in `departments.metadata`

The revision table could have become the runtime source, but `lifecycle_builder_v1` is read from
that column by a large number of runtime paths. Repointing them all is a separate, riskier change
that would bury Law 4 inside a migration of the read surface.

Instead the publish RPC writes the projection **in the same transaction** as the revision, so:

- runtime readers are untouched — zero blast radius on read;
- publication and runtime cannot disagree, because Postgres commits them together;
- the revision table becomes the authority for *history*, and the column remains the authority for
  *current runtime*, with a checksum linking them.

Moving runtime onto revisions directly is a later, optional step. It is not required by any law.
