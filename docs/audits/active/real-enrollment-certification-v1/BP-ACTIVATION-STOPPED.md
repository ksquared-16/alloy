# BP activation — STOPPED before mutation

**Run:** `erun_068dbac429e7eadd` · **Nothing was written.** Draft, packet, Forms and tenant state are untouched.

Everything §2–§6 asked for is decided and proven. The stop is at §7, on the rule §7 itself sets: the
pre-publish diff showed a change outside the authorized set, and it is a real one.

---

## 1. Tenant BP state — re-read, unchanged

| | |
|---|---|
| Draft id | `fa0b9c36-d596-449f-a4b6-4f17856414f7` |
| Org / department | `00000000-…-0001` / `00000000-…-0020` |
| Process | key `enrollment`, id `…0021`, active, `primary_entity: opportunity` |
| `draft_status` / `draft_revision` | `draft` / **1** |
| `base_revision_id` | `null` |
| `validation_errors` / `validated_at` | `[]` / `null` |
| Last updated | 2026-08-18 |

**Stages (8):** `lead`, `tour`, `decision`, `closed` (family_track, grain `family`, sort 0–3) ·
`waitlist`, `enrolling`, `enrolled`, `closed_withdrawn` (child_track, grain `child`, sort 4–7). All active.

**Transitions:** no `transitions` key at process or payload level — movement is expressed through
`stage_operating_plan_v1.outcomes` and `manual_status_transition_policy_v1`.

**Confirmed again:** `business_process_revisions` = **0** · `requirements_v1` **absent on all 8** ·
`entry_points_v1` **null**. Nothing changed since the last run.

---

## 2. Entry stage — `enrolling`, unambiguous

Not inferred from array order. Of the eight, only three are child-grain, and the journey's subject is
a child (`startEnrollmentService` creates the instance with `subjectId = customerMemberId`):
`waitlist` is before the paperwork, `enrolled` is after it, **`enrolling` is it.**

```
entry_points_v1 = { version: 1, by_intent: { enrollment_start: "enrolling" } }
```

`create_lead` is **not** required: publish validation only checks that authored intents are known and
resolve to active stages. No ninth stage invented.

The intent resolves end to end — `startEnrollmentService` passes `source: "enrollment_start"`, which
`createEnrollmentProcessInstance` writes to `metadata.source`, which
`entryIntentFromProcessInstanceMetadata` reads back as `enrollment_start`.

---

## 3. The five requirements — identities and dimensions

| # | Artifact | `form_definition_id` |
|---|---|---|
| 1 | Oregon Certificate of Immunization Status | `17bc2de8-0f83-48a6-aabc-bcd72725bce8` |
| 2 | Oregon Nonmedical Exemption | `9a86ec71-e589-41d8-bd09-617dfe23d0d8` |
| 3 | School of Enrichment Admissions Packet | `5eb82c56-9459-42d9-a17d-725f2f6b0b19` |
| 4 | Tuition & Enrollment Agreement | `3f682c60-6e7c-4b41-a3cb-64f35c1a6d94` |
| 5 | Parent Handbook Acknowledgement | `34a5ced4-ecc3-41ae-8dc5-9f54bd29694b` |

Each as `ref: { kind: "form", form_definition_id }` — definition identity, never a version, so D-94
holds: a new Enrollment resolves the currently published version and the session pins it.

**Dimensions**, kept as four independent axes and taken from precedent rather than invented — the
repo's own canonical example is literally `req-immunization` in `stageRequirementsV1.test.ts`:

* `level: "required"` — the narrowest level that says "must be done". `enforced` is what makes a gap
  *blocking* in the readiness evaluators, and adding transition-blocking is not what this
  certification asked for.
* `scope: "record"` — the journey's own subject. It is also the only scope Phase 1 evaluates
  (`READINESS_PHASE_1_SCOPE_TYPES = ["record"]`); `each_child` would broaden across the household.
* `timing: "stage_exit"` — the paperwork is the work of Enrolling.
* `enforcement: "blocking"` — matches the precedent, and is honest here because a Form requirement is
  provable: `form_submissions` is its evidence owner.

---

## 4. 🛑 Why this stopped — the canonical write path drops operator data

The round-trip control ran **before** the diff: serialize the *untouched* parsed draft and compare it
to what is stored. It is not identity. Fifteen lines differ, and they are not all normalization.

**Deterministic normalization — authorized by §7:**

* `work_views_v1[0..2].compat_queue_key` removed — `normalizeCatchAllWorkViewCompatBinding` strips a
  stage-specific binding from an include-all view by design, so it resolves on the department
  aggregate.
* `manual_status_transition_policy_v1` materialized from defaults.
* `completes_work` / `successful` materialized on 9 stage-operating-plan outcomes.

**Not normalization — a defect:**

```
processes[0].description: REMOVED = "Lead to enrolled — inquiry, tour, decision, placement."
```

`parseLifecycleBuilderV1` assembles the process record and **never reads `row.description`**. Because
`description` *is* listed in `PROCESS_OWNED_KEYS`, `captureUnknownFields` also excludes it from the
unknown-field residue that exists to preserve exactly this kind of value. It falls through both paths
and is dropped by any parse→serialize.

It is **writable and never read back**: `updateProcessDescription` has a live caller
(`/api/admin/departments/[departmentId]/lifecycle-builder`), the field is documented as *"shown on
/workspace department tile"* — and the next save of the draft by any path deletes whatever an
operator typed.

**Every canonical path is affected.** `saveLifecycleStageRuntimeConfig`, the module named as the
requirement write path, uses the same `draftBuilder` + `saveDraft` round trip. There is no canonical
authoring path that preserves it.

Publishing would have written that deletion into **immutable revision 1**. `publishDraft` reads
`draft.payload` directly, so publish alone is safe — it is the *save* that loses it, and authoring
requires a save.

### Two ways forward — your call

1. **Fix the parser** (read `row.description` in the process assembly, one line + a round-trip
   control), then author and publish. Correct, and it repairs the defect for every tenant — but it
   changes a shared platform module, which is more than this run authorizes.
2. **Accept the loss** for the certification tenant, explicitly, and proceed.

I recommend (1). The description is small, but "operator types a value, the platform deletes it on
the next save" is a defect worth one line, and baking it into an immutable revision is the wrong way
to discover it. Either way the choice is yours — that is what the pre-publish diff is for.

---

## 5. BP-derived packet — proven without publishing

`planRequirementDerivedPacket` is the same pure projection the launch uses. Run against the *planned*
builder it yields:

```
5 form requirements → 5 ordered steps → 3 uploads → 5 signatures → 0 bank-credential asks
```

| | Derived | Studio `579327c1` |
|---|---|---|
| Forms | 5 | 5 |
| Uploads | **3** | 3 |
| Signatures | **5** | 5 |
| Bank-credential asks | **0** | 0 |

**Semantic drift: none.** Same five artifacts, same order, same form identities. Every step's
currently-published version *is* the version the Studio packet pinned — so the runtime resolves the
same bytes the certification reviewed. Packet ids differ by design; the derived key would be
`bp_rev_<revision-1-id>_enrolling`.

**Direct Payment Authorization is not among the requirements.** No routing-number ask, no
account-number ask, no payment-method mutation, `PAYMENT_SETUP_REQUIRED → FINANCIAL_PAYMENT →
HELD_PENDING_FINANCIALS` preserved and non-blocking.

---

## 6. Consent hardening debt (recorded, not built)

The 11 Parent Authorization concepts in the reference handbook — emergency medical care, permission
to leave the premises, photo release, hold harmless, and the handbook acceptance itself — keep their
source and legal content, and the executable **Parent Handbook Acknowledgement** artifact and its
signature stay in the packet.

**None of them is a BP requirement**, so nothing became a blocking requirement the runtime cannot
honestly satisfy. No canonical Consent record is created, and this certification does **not** claim
the handbook signature proves independently withdrawable, versioned canonical consent. The platform
agrees: `consent` is a declared requirement kind that is deliberately unauthorable, because *"no
canonical consent record exists anywhere in the platform."* Post-certification hardening.

---

## 7. Browser verification — still owed

Unchanged and untouched. The `:3014` server was not restarted and the packet was not mutated.
Self-serve path preserved: `http://127.0.0.1:3014/login` → Processing → Studio → Packets.

---

## 8. Parent-run readiness — **NO, by one decision**

| Prerequisite | |
|---|---|
| Entry stage identified | ✅ `enrolling`, unambiguous |
| Five Form requirements composed | ✅ identities + dimensions settled |
| All five Forms published | ✅ 5/5 |
| Derivable runtime packet | ✅ proven, zero drift |
| Participant Runtime route | ✅ `/forms/embed/[token]` |
| No required Financials capability | ✅ deferred, non-blocking |
| No unresolved blocking requirement | ✅ |
| **Published BP revision** | ❌ **0** — blocked on the decision in §4 |
| Operator session | ❌ manual sign-in still owed |

Nothing about the packet, the Forms, or the requirement model blocks the first real parent run. What
blocks it is one decision — §4 — and a manual sign-in.

**Once you choose,** authoring and publishing is a single pass: save the draft with the entry point
and five requirements, validate, `publish_business_process_revision_v1`, verify revision 1, then the
first real operator action is *create the certification family/child → Start Enrollment*.
