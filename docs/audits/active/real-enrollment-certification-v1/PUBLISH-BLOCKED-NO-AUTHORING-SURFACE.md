# Publish revision 1 — STOPPED: the two fields have no writer

**Run:** `erun_b1f2f6f06b8e9ae4` · **Nothing written.** Draft, packet, Forms and tenant untouched.

The stop is the one §1 anticipated — *"If no sanctioned write path exists, STOP and name the exact
missing execution path."* It does not exist, and the reason is not permissions.

## 1. Preconditions re-proven before any write

| Required | Found |
|---|---|
| draft id `fa0b9c36` | ✅ `fa0b9c36-d596-449f-a4b6-4f17856414f7` |
| `draft_revision` = 1 | ✅ 1 |
| `business_process_revisions` = 0 | ✅ 0 |
| `process_instances` = 0 | ✅ 0 |
| `entry_points_v1` absent | ✅ `null` |
| `requirements_v1` absent on all stages | ✅ absent on all 8 |

Unchanged since the previous run. `updated_at` still 2026-08-18.

## 2. The missing execution path, named exactly

**Neither authorized change has an authoring surface anywhere in the product.**

```
POST /api/admin/business-process/configuration/validate   ✅ exists
POST /api/admin/business-process/configuration/publish    ✅ exists
─────────────────────────────────────────────────────────────────
   a route that writes entry_points_v1                    ❌ does not exist
   a route that writes requirements_v1                    ❌ does not exist
```

The canonical draft-authoring surface is `PATCH /api/admin/departments/{departmentId}/lifecycle-builder`.
It supports **14 actions** — `add_stage`, `create_process`, `ensure_stage_transition`, `remove_process`,
`remove_stage`, `rename_stage`, `reorder_stage`, `set_active_process`, `clear_active_process`,
`update_process_command_set`, `update_process_description`, `update_process_name`,
`update_stage_description`, `update_stage_grain`.

**None of them sets an entry point or a requirement.** A sweep of the whole API surface confirms it:

* `grep -rn "entry_points_v1" app/api` → **no matches**
* `grep -rn "requirements_v1" app/api` → **no matches**
* `requirements_v1` appears in **14 library modules** that read, resolve, normalize, publish and
  consume it — and in **zero** app-side writers.
* `entry_points_v1` exists in exactly three library files: the parser/serializer, the entry-stage
  resolver, and publish validation.

`saveLifecycleStageRuntimeConfig` is not it either, despite the name: its own docstring puts
`lifecycle_progression_requirements_v1` in a different category (a top-level metadata sibling), and
it never touches `requirements_v1`.

**This is not the sandbox.** A fully authenticated admin sitting in the browser could not author
these two fields either — there is no control, no action, and no endpoint. The platform can read,
validate, publish, resolve and execute both sections. It cannot write either one.

Worth naming plainly: `REQUIREMENT_KINDS_AUTHORABLE_V1` declares `form` requirements *authorable*,
and the authoring path it implies was never built.

## 3. What was checked and ruled out

| Candidate | Verdict |
|---|---|
| `vac governed-action` | Catalog holds `database.read_census`, `repository.push`, `repository.merge_pull_request`, `promotion.open_pr`, `database.apply_migration`. **No configuration-write action.** `apply_migration` is for committed staging migrations, not a tenant's draft. |
| Toolkit CLI | No BP/publish/seed command in the toolkit. |
| Repo scripts / seeders | The only production caller of `publish_business_process_revision_v1` is the HTTP publish route. No seeder, no CLI. |
| Product HTTP API | Publish and validate exist; **authoring does not** (§2). |
| A direct service-role script | Refused by the sandbox classifier last run. Not retried, not bypassed, and per the instruction not substituted with raw SQL. |

## 4. The smallest sanctioned addition — named, not built

Two actions on the existing `PATCH …/lifecycle-builder` route, mirroring the 14 already there:

* **`set_process_entry_point`** — `{ process_id, intent, stage_key }` → sets
  `entry_points_v1.by_intent[intent]`. Publish validation already covers it: an unknown intent or an
  unresolvable stage is refused (`process_entry_intent_unknown`, `process_entry_stage_unresolvable`).
* **`set_stage_requirements`** — `{ process_id, stage_key, requirements[] }` → sets
  `requirements_v1`. `parseStageRequirementsV1` / `serializeStageRequirementsV1` already exist and
  round-trip; `isAuthorableRequirementKind` already refuses the four unauthorable kinds.

Both then flow through the existing `saveDraft` → validate → publish chain unchanged. No new
authority, no second requirement engine — the pure helpers, the validator and the publish RPC all
exist already; only the door is missing.

That is a bounded platform slice of the same shape as the `description` repair, and it is the
prerequisite for BP revision 1. It needs your authorization; I have not written it.

## 5. Everything else remains ready

Unchanged from the previous runs and re-proven or preserved here: entry stage `enrolling`; the five
Form identities in certified order; dimensions `level: required · scope: record · timing: stage_exit ·
enforcement: blocking`; a BP-derived packet already proven semantically identical to Studio packet
`579327c1` (5 forms, same order, same identities, 3 uploads, 5 signatures, 0 bank-credential asks,
zero drift); and the §7 round-trip gate now clean at 14 documented normalization differences with the
authored change adding exactly the two authorized keys.

The moment an authoring surface exists, publication is a single pass.
