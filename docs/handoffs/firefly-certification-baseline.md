# Firefly Certification Baseline — handoff

Program: **Clean Tenant → One-Family End-to-End QA**
Tenant: Firefly Early Learning `93667019-bd28-49b5-a688-acc9bb1e0a19`, hosted project `ikaxilmwmrmbagoidedu`
Status as of 2026-08-03: **reset amended and certified locally; hosted dry run complete; execution NOT authorized.**

---

## 1. Why this document exists

The reset was authorised as QA discipline, not as a corruption remedy. The goal is an unambiguous
baseline:

```text
Preserved configuration + one product-created family + real operator actions
= all operational state in the tenant
```

The dry run says the current utility **cannot deliver that equation on this tenant**. Section 4 is
the reason. Read it before authorising anything.

---

## 2. What the reset utility now does

`web/scripts/resetOperationalState.ts` — `npm run dev:reset:operational-state`. Dry-run by default.

New in this slice:

- **`--include-closed-opportunities`** — widens candidate selection to every operational
  opportunity in the target org, open and closed. Absent, behaviour is byte-identical to before
  (lead status keys + enrollment work units).
- **Target identity gate** — resolves the org in the connected database and refuses if it is not
  there; refuses on project mismatch when `RESET_SUPABASE_PROJECT_REF` is set. The failure this
  guards is a correct-looking run pointed at the wrong tenant.
- **Paged widened query** — PostgREST would silently cap a whole-org read. An understated dry-run
  total is the number a delete gets authorised from.
- **Scope and per-status breakdown** in the dry-run report.

Tests: `web/tests/scripts/enrollmentRuntimeResetIncludeClosed.test.ts` (21). Narrowed typecheck:
`web/tsconfig.opsreset.json`. Focused baseline 81/81.

The dependency-graph tests drive the real `resolveDemoIds`, so they prove a selected closed
opportunity actually expands into family, children, work, bookings and documents — and that the
same graph expands to nothing with the flag off.

---

## 3. Deletion contract — what the reset is anchored on

**The deletion graph is anchored on opportunities.** Everything deleted is reachable from a
selected opportunity by foreign key. Configuration is preserved by construction:
`work_units` and `departments` are hard-coded to zero in `enrollment_runtime_reset` mode, and
locations are report-only.

This anchor is the utility's defining property and its limitation.

---

## 4. THE BLOCKER — the reset cannot produce a clean tenant here

Hosted before-state vs. proposed deletion:

| Table | Before | Deleted | **Survives** |
|---|---:|---:|---:|
| opportunities | 8 | 8 | **0** |
| process_instances | 13 | 13 | **0** |
| tour_bookings | 2 | 2 | **0** |
| opportunity_persons | 6 | 6 | **0** |
| **customers** | **59** | 8 | **51** |
| **persons** | **53** | 21 | **32** |
| **customer_persons** | **40** | 13 | **27** |
| **customer_members** | **20** | 13 | **7** |
| **processing_cases** | **61** | — | **61** |
| **workflow_events** | **440** | 23 | **417** |
| **documents** | **73** | 20 | **53** |
| field_values | 25 | 1 | 24 |
| communication_threads | 6 | 1 | 5 |
| communication_messages | 7 | 1 | 6 |
| contacts | 5 | 0 | 5 |
| form_submissions | 3 | 0 | 3 |
| operational_tasks | 7 | 6 | 1 |

**51 of 59 households and 32 of 53 people are not reachable from any opportunity, so the reset
cannot see them.** They are historical test families — exactly what the baseline is meant to
eliminate. `processing_cases` (61) is outside the delete order entirely.

Executing this reset would zero the opportunity-anchored core and leave ~86% of operational rows in
place, while the verification step reports **success** — because it only asserts that
`opportunities`, `opportunity_customer_members`, `operational_tasks` and `process_instances` are
empty. That is the dangerous outcome: a baseline believed clean that is not, which reintroduces
precisely the "is this defect product behaviour or inherited data?" ambiguity the program exists to
remove.

**Closing this needs a second anchor** — org-scoped operational identities not referenced by any
preserved record — which is a change to the deletion contract, not another flag. It deserves its
own design and its own shared-reference proof.

---

## 5. Secondary findings for the QA journey

- **`--include-closed-opportunities` is unexercised on this tenant.** All 8 opportunities are open
  (`new` 5, `open` 2, `tour_scheduled` 1), all in stage `lead`. Zero closed. The flag is proven by
  tests, not by hosted evidence.
- **Lead is the certified Lead Operating Model V1** and it binds. The three open Contact Family
  rows carry `operating_plan_template_key: "contact_family"`, satisfying
  `taskMatchesStageWorkTemplate`'s first condition. The `first_contact` mismatch recorded in
  `0d8d4114e` is **not present on hosted** — that was a seeded local tenant.
- **Tour is placeholder scaffolding** — outcomes named `outcome_1`…`outcome_11`, templates
  `work_1/work_2/work_3` on `work_definition_key: manual_ad_hoc`. Steps 10–17 of the journey will
  fail on configuration, not platform.
- **`work_views_v1` is ABSENT** on every department. The New Leads Work View reports grain
  ambiguity and renders nothing.
- Lead declares no `outgoing_transitions` while two of its rules reference `lead_to_tour`. Confirm
  this resolves before trusting step 12.
- `lifecycle_builder_v1` (Enrollment dept) sha256
  `4609859e495aef95f8155e5c024184fb00be0e719d29cfc8a3204b33adcd8dd4`, 20073 bytes —
  6 stages, 9 work templates, 26 outcomes, 25 outcome rules, 2 outgoing transitions.

---

## 6. POST-RESET PRODUCT RULE (binding)

> After the Firefly Certification Reset, no operational state may be created or corrected through
> direct database edits during one-family certification.

Permitted creation paths:

- the real operator UI
- registered Operational Commands
- real Processing/import paths, once those capabilities are explicitly under QA
- approved automation using the same canonical authority paths

If a family cannot progress through the UI or a registered command, **that is a product defect.**
Do not patch stage, status, Current Work, booking, assignment, or enrollment state by hand to keep
the journey moving. A journey kept alive by hand proves nothing.

---

## 7. Certification journey (do not start before the baseline is real)

1. Create one brand-new Lead through the real product.
2. Verify canonical Contact Family work is provisioned.
3. Verify configured outcomes appear.
4. Record Left Message.
5. Verify follow-up.
6. Record Awaiting Response.
7. Verify attention and follow-up behaviour.
8. Record Reached / Qualified.
9. Verify work completes while stage remains Lead.
10. Run Schedule Tour.
11. Verify one canonical booking.
12. Verify the booking signal triggers Lead → Tour.
13. Verify Work Views, counts, Focus Panel, Current Work, and Activity.
14. Continue through Decision.
15. Continue through Waitlist where applicable.
16. Continue through Enrolling.
17. Continue through Enrolled.

No direct stage patches. No broad seeding.

---

## 8. Bulk import — future capability, not this slice

> Bulk import must create the same canonical identities, relationships, process participation,
> stage membership, Current Work, outcomes, and projections as the real product flow. Import is
> another intake placement over canonical platform authorities — not a direct table-loading
> shortcut.

Sequence, once the one-family journey is certified:

```text
Certified product-created family
→ artifact and authority map
→ import contract
→ dry-run preview and validation
→ identity resolution
→ operator approval
→ canonical commit
→ post-import reconciliation
→ scaled school dataset
```

Eventual scope: families/households, parents and guardians, children, relationship roles, location
and program references, requested enrollment information, existing enrollment state, effective
dates, validation and error rows, deduplication and identity review, dry-run preview, partial
acceptance policy, idempotent retry, source lineage, audit, rollback/compensation, and exact
post-import reconciliation.

Do not let import planning delay the reset or the one-family journey.

---

## 9. Defect classification (use in all future evidence)

| Category | Meaning |
|---|---|
| Platform | Runtime, command execution, authority, provisioning, projection, refresh |
| Configuration | Published process, Work Views, Work Templates, outcomes, transitions, actions, surfaces |
| UX | Operator cannot understand what happened, what is required, or what to do next |
| Test Data | Historical or synthetic records violate current canonical contracts |
| Import | Source mapping, identity resolution, validation, canonical commit, reconciliation |

One primary category per defect, even when there are secondary consequences.

---

## 10. Shared-tenant safety notes

- Firefly is shared infrastructure. Quiesce other writers before any **execute**.
- Slot 1 (`wt1-trust-runtime-v1-cert`) held a legitimate active lease on the isolated `alloy-cert`
  stack during this slice, with a dev server on 3011. Its worktree carries BOTH a Firefly
  `.env.local.agent` and a cert `.env.certification.local`; process env is not readable on macOS and
  the served HTML exposed no project ref, so **which backend it was using could not be proven**. It
  was left running — a dry run performs zero writes. **Resolve its target before Phase 5.**
- Nothing was paused during this slice, so nothing needs resuming.
- Credentials: the trusted root env `/Users/Kelly/Alloy/web/.env.local` was sourced into a single
  command per invocation. No key was copied into the worktree, printed, logged, or committed.
