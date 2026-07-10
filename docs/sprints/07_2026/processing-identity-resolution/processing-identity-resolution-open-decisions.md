# Processing Identity Resolution — Decision Register (V1 FROZEN)

**Baseline:** `origin/staging` @ `65afc8527`. **Status:** Decision-finalization pass complete. This register is now **implementation-authoritative** — Cursor implements these; it does not re-decide them.

**Status legend:** 🔒 **Frozen for V1** · 🧩 **Deferred behind an abstraction** (Processing does not depend on the unresolved detail) · 👤 **Requires product-owner approval** (default stated; safe to proceed on default).

Evidence: **[C]** confirmed in repo, **[D]** doctrine, **[P]** proposed.

---

## Decision A — Canonical identity graph 🔒 (with one 🧩 sub-point)

**Question.** Fix the V1 roles of `persons`, Parent, Guardian, Child, `customers`, Family, Household, `customer_persons`, `customer_members`, `opportunities`, Lead, Enrollment Record, Active enrollment; and state what Processing resolves and how a provisional graph maps to records.

**Evidence.** `docs/platform/core/entity-model.md`: `persons` = "canonical human identity", `customer_persons` = "person↔customer link with role_type", `contacts` = "legacy", `customers` = "household/account shell" **[C/D]**. `record-system.md` relationship model: "Guardians, emergency contacts, authorized pickup... are relationship actions, not inline person fields" **[D]**. `status-and-state-system.md`: `opportunities.status_key` = case; per-child enrollment state = participation **[D]**. `resolveIntakeRecordResolution.ts` resolves guardians→household(`customer_persons`)→children→lead **[C]**. `customer_members` has `person_id` nullable **[C]**.

**Frozen model (V1).**
| Concept | V1 role |
|---|---|
| `persons` | Canonical human identity (one human, many scoped links) |
| **Parent** | **A role on Person**, expressed as `customer_persons.role_type` (adult household membership) — NOT a separate entity |
| **Guardian** | **A child-scoped relationship role** (relationship action / `customer_member_contacts`) — NOT a separate entity |
| **Child** | **`customer_members`** record (household member; `dob`), **optionally** backed by a `persons` row when identity is asserted — V1 transitional |
| `customers` | The **Family = Household = account shell** (single table; no separate household table) |
| **Family / Household** | **Derived container**, projected from `customer_persons` (adults) + `customer_members` (children); NOT an independently matchable identity |
| `opportunities` | **Lead / case** (household coordination; `status_key` open\|closed) |
| **Enrollment Record** | Per-child **participation** — forward authority `process_instances`, OCM legacy (Decision B) |
| **Active enrollment** | `child_enrollment_agreements` + `child_placements` (committed terms) |

**What Processing resolves.** **Both.** An **Identity Subject** is a provisional real-world party (parent/child/household). A **Candidate Match** binds a subject to an existing DB record or proposes create. The engine resolves real-world subjects *and* maps them onto canonical records.

**Provisional graph → records.** parent subject → `persons` (+ `customer_persons` link to the household `customers`); child subject → `customer_members` (+ optional `persons`); household node → `customers`; enrollment intent → `opportunities` + participation.

**Semantic command boundary (so Processing never couples to transitional tables).** Processing emits typed record commands only: `create_person`, `link_person_to_household`, `create_household`, `add_child_to_household`, `create_lead`, `link_person_to_lead`, `create_process_participation`, `update_record_fields`. The command implementations own the physical mapping (persons / customers / customer_persons / customer_members / opportunities / process_instances / field_values). Processing never names OCM, `field_values`, or `contacts` in a plan.

**Consequences.** Runtime: the executor targets commands, not tables. Schema: no new identity entities in V1. Migration: the parent/child entity-platform migration can proceed independently. Operator: reviews subjects → candidates, not raw tables.

**Status.** 🔒 Frozen for V1. **🧩 Sub-point:** *whether children are always person-backed* is deferred behind `add_child_to_household` (the command decides; Processing is agnostic). **Blocks:** D0 (record commands), B3 (resolver mapping).

---

## Decision B — OCM vs `process_instances` 🧩 (frozen via abstraction)

**Question.** Which substrate owns child participation, must Processing choose, and how does the Commit Plan express it?

**Evidence.** `20260713000000_process_instances.sql` header: *"This REPLACES opportunity_customer_members (OCM) as the runtime owner of child participation. OCM remains only as a temporary migration/data source."* `state` replaces `OCM.outcome_status_key`; unique scope `(org_id, process_key, subject_id, context_id)`; Enrollment = `process_key='enrollment'`, subject=`child`(customer_member), context=`opportunity` **[C]**. `20260713000100_process_instances_backfill_from_ocm.sql`: one PI per OCM row, idempotent **[C]**. Create-lead already writes `process_instances`; intake/relationship/REST still write OCM **[C]**.

**Options.** (a) couple Processing to OCM; (b) couple to `process_instances`; (c) **emit a semantic participation operation; a registered command owns translation.**

**Recommendation (c).** The Commit Plan expresses `create_process_participation` (alias `attach_child_to_process`) with `{process_key:'enrollment', subject: child_ref, context: opportunity_ref, intent: {program, cohort, start_date, schedule}}`. A registered command (`add_participation`, invoking the enrollment outcome/Execution-Runtime typed domain) translates it into current storage — writing `process_instances.state` via the runtime (and OCM only if/while the runtime still requires it, owned by the command). Processing envelopes, resolutions, and plans never change when the command flips to `process_instances`-only.

**Consequences.** Runtime: participation writes go through one command. Schema: none new. Migration: OCM→`process_instances` cutover happens **entirely inside the command**, invisible to Processing. Operator: sees "enrollment interest for {child}", not a table.

**Status.** 🧩 Deferred behind the semantic participation command. **Frozen:** Processing never writes OCM or `process_instances` directly. The command's internal target (dual-write vs PI-only) is a platform decision that does **not** block Processing. **Blocks:** D1 (plan op vocabulary), the enrollment-commit slice.

---

## Decision C — Email & phone semantics 🔒 (reverses prior lean toward email-uniqueness)

**Question.** Freeze normalization, storage, matching, uniqueness, isolation, and trust for email/phone.

**Evidence.** Three incompatible phone forms (E.164 / digits-10 / raw); 9 email normalizers; `persons` has **no** uniqueness; `contacts` has **global (non-org)** unique on email/phone; households legitimately share phone; child-uses-guardian-email is common **[C]**. Initiative directive: *"Do not treat email or phone as universally unique identity keys unless evidence and real-world semantics support it."*

**Frozen rules (V1).**
- **One canonical normalizer** (`web/lib/identity`): email = `trim().toLowerCase()`, empty→null; phone = **E.164** canonical storage (`+1XXXXXXXXXX` NANP) with one `phoneLookupVariants` for matching legacy non-E.164 rows; name = `trim().toLowerCase()` + collapse `\s+`; dob = `YYYY-MM-DD`.
- **Storage:** persist canonical `normalized_email` / `normalized_phone` (generated or backfilled columns) for indexed generation.
- **Candidate generation:** exact match order email → phone → name+dob; org-scoped.
- **Matching:** email/phone are **strong supporting signals, never sole auto-link authority under contradiction**. Shared values are **allowed** and are a **household-level positive signal, person-level neutral**.
- **Uniqueness:** **NO hard unique on `persons` email or phone** (spouses share; children use guardian email; numbers get reused). Duplicates are prevented by the **resolution engine + operator + submission/opportunity idempotency keys**, not by a person-level unique constraint. Add **non-unique** normalized indexes for fast generation. Add **`customer_members` natural-key unique(org_id, customer_id, normalized_child_key)** (same name+dob child in one household *is* a genuine duplicate). 
- **Cross-tenant:** everything org-scoped; **retire the global `contacts` email/phone uniques** (replace with org-scoped or drop) as part of the person-first parity track.
- **Trusted vs untrusted:** portal-authenticated identity and existing-record/packet tokens = **trusted** (may preselect a candidate under policy, Decision J); anonymous submission contact info = **untrusted** (review). Archived records are **included in generation, downgraded/flagged**. Contradictory values → Conflicted → review. Duplicate persons with identical contact info → surfaced as a **merge candidate** (Decision H), never auto-merged.

**Real-world cases (all handled by "signal, not unique key"):** spouses sharing → household signal; child using guardian email → child inherits household, not linked to guardian person; separated households → many-to-many `customer_persons`; reused phone over time → phone match + contradiction check; one email many roles → role-scoped links; duplicate persons same contact → merge candidate.

**Migration path.** Converge normalizers into `lib/identity` (behavior-preserving) → backfill normalized columns → add non-unique indexes → add `customer_members` natural-key unique after de-dup → retire global `contacts` uniques after inbound person-first parity.

**Status.** 🔒 Frozen for V1. This **supersedes** the earlier open-decision-6 lean toward `unique(org_id, email)` on persons. **Blocks:** B1a (normalization), D0 (constraints), Phase E (contacts uniques retirement).

---

## Decision D — New-record threshold 🔒 (thresholds 👤 default-approved)

**Question.** Minimum evidence before Processing may recommend Create Person / Child / Family / Lead / Enrollment Record; and the three eligibility tiers.

**Evidence.** `defaultActionForConfidence` (`no_match`→create) **[C]**; child matcher uses name+DOB **[C]**; `create_customer` only as a household container.

**Frozen minimums (V1 — product-owner finalized).**

| Create | Minimum evidence |
|---|---|
| **Person** | A **usable name** **and** at least one **usable contact, trusted identity, or relationship/context signal.** Qualifying: name+email · name+phone · name+authenticated portal identity · name+trusted existing-record token · name+explicit parent/guardian relationship inside a coherent household submission. **Name alone** may create a provisional Identity Subject but is **not** eligible for authoritative Person creation |
| **Child** | A **usable child name** **and** at least one of: DOB · expected DOB · usable age · explicit relationship to a resolved/approved guardian · authenticated existing-Family context. **Child name alone → unresolved / request information** |
| **Family** | At least one **approved Person or Child create/link** operation **and** no selected existing Family suitable for the resolved household graph. **Never create an empty Family shell** |
| **Lead** | A resolved-or-approved **Family** **and** a resolved-or-approved **Child** **and** a valid **enrollment-interest signal** (selected location · selected program · desired start timeframe · explicit request for enrollment information · another configured intake trigger). ("Create Lead" is the *create* branch — existing open leads are handled by update/attach per Decision E) |
| **Enrollment Record / participation** | An existing-or-approved **Family** **and** an existing-or-approved **Child** **and** valid **process/location context** **and** **no** matching active process participation or equivalent open enrollment process. Processing emits the semantic op `create_process_participation` (Decision B) |

**Three tiers.** (1) **Recommendation eligibility** — engine may *propose* create when min-evidence met. (2) **Operator-approval eligibility** — operator may approve when min-evidence met and no unresolved blocking contradiction (or overrides with a recorded reason). (3) **Policy auto-commit eligibility** — **none for creation in V1** (Decision J).

**Edge cases.** No strong candidate → create_new if min-evidence else `request_information`/`unresolved`. Multiple plausible → no auto-select; `review_required`. Contradictory → `Conflicted`; hold. Missing required facts → `needs_information`. Operator declares new despite a possible match → allowed with recorded override + a **potential-duplicate exception** logged for later merge review.

**Status.** 🔒 Frozen for V1 (product-owner finalized). **Blocks:** D1 (Commit Plan + approval — recommendation generation).

---

## Decision E — Lead vs Enrollment Record 🔒 (one 👤 knob)

**Question.** Freeze the distinctions and the rules that pick a recommendation.

**Evidence.** `opportunities`=case, participation=per-child, `child_enrollment_agreements`/`child_placements`=active; `findExistingIntakeOpportunity` dedups open opportunities **[C]**; canonical vocabulary from `commercial-model-v2-language`/glossary **[D]**.

**Frozen recommendation rules (V1).**
| Recommendation | When |
|---|---|
| **Create Lead** | No open opportunity for the resolved/new household **and** enrollment intent or lead-capture context |
| **Update Lead** | Matched open opportunity + new case-level info (contact/source) → field op |
| **Create Enrollment Record** | Child (new/existing) has intent for a program/location not already an open participation |
| **Update Enrollment Record** | Matched participation + changed intent (start/schedule) → field op |
| **Resume existing process** | Matched **closed** opportunity/participation + re-engagement signal → reopen via outcome command (not a new record) |
| **No-op** | Matched records + no material change |
| **Request information** | Intent present but required identity/enrollment facts missing |

Duplicate submission → attach to existing, log dedup (no new lead). New child in existing family → link household + create child + participation (+ existing/created lead). New location/program interest → new participation.

**Reopen-vs-new policy (product-owner finalized).** Default window **180 days**, **organization-configurable** — represented through **governed organization configuration or a versioned policy input**, **never hardcoded inside the identity resolver.**
- Matching **open** Lead/Enrollment Record → update / attach / no-op as appropriate.
- Matching **closed** record **within 180 days** → recommend **reopen / resume**.
- Matching **closed** record **older than 180 days** → recommend a **new** interest while **retaining historical linkage**.
- **Withdrawn, denied, archived, compliance-sensitive, or otherwise restricted** states → **may override the time window** and **require explicit operator review**.

**Status.** 🔒 Frozen for V1 (product-owner finalized: 180-day default, org-configurable, policy-driven — not hardcoded). **Blocks:** D1.

---

## Decision F — Commit Plan approval granularity 🔒

**Question.** Individual / group / whole-plan approval; dependency, invalidation, rejection, operator-added ops, provenance, versioning.

**Evidence.** `CreateLeadCommitRecord.include_in_commit` per-record flags **[C]**; `BosProposalEnvelopeV1` versioned + fail-closed on stale **[C]**.

**Frozen (V1).** **Whole-plan approval with per-operation include/exclude flags**, operations grouped by dependency (DAG via `depends_on`). Operators approve the plan; may exclude *optional* operations; **cannot** exclude an operation a retained op depends on (excluding a parent cascades to dependents, surfaced). **Invalidation:** any change to the operation set, targets, values, or resolution decisions → new plan `version` + `content_hash` → prior approval **void** (fail-closed). **Rejection** of a recommendation removes its op + cascades; plan re-versions. **Operator-added operations:** permitted **only from registered recommendation types** (e.g. "also create sibling", "attach document") — **no freeform operations**; every op originates from a registered recommendation type. **Versioning:** monotonic `version` + `content_hash`; supersede chain; approval binds to `(version, content_hash)`.

**Status.** 🔒 Frozen for V1. **Blocks:** D1 (Commit Plan), D3 (review UI).

---

## Decision G — Commit atomicity 🔒 (with 3 plan examples)

**Question.** Atomic groups, async ops, outbox, partial failure, compensation, retry, stale-plan, record-version checks, and whether comms failure can roll back identity.

**Evidence.** 3 non-transactional writers today **[C]**; mutation RPC is atomic state+outbox **[C]**; outbox/projection contract **[D]**.

**Frozen (V1).**
- **Atomic identity group:** person(s) + household + `customer_persons` links + child members commit in **one transaction**; all-or-nothing.
- **Sequenced dependent group:** lead/opportunity + `opportunity_persons` + participation is a **second atomic group** depending on the identity group (needs its ids).
- **Async (outbox):** communications, tasks, documents, workflow automations, activity projections fire **after** commit via events — never inside an identity transaction.
- **Partial failure:** stop at the first failed group; committed groups stand; case → `partially_committed`; per-op exception recorded; compensation runs for **reversible** ops in the failed group.
- **Compensation boundary:** only reversible ops (link/unlink/attach) compensate. **Record creation is never auto-deleted** (hard-delete prohibited) — it is flagged for the operator.
- **Retry:** idempotent per op key; re-execute completes remaining groups.
- **Stale plan / record-version:** each op asserts `precondition_record_version`; mismatch → op fails closed → reopen/re-plan.
- **External communication failure may roll back identity creation? NO** — comms is a downstream outbox effect; its failure never rolls back identity.

**Three plan examples.**
1. **Brand-new Family (Parent + Child + Lead).** G1 (atomic): `create_person(parent)` → `create_household` → `link_person_to_household` → `add_child_to_household`. G2 (depends G1): `create_lead` → `link_person_to_lead` → `create_process_participation(child→enrollment@lead)`. Async: `lead_created` → comms/tasks/projections.
2. **Existing Family + new Child + interest.** Preconditions: matched `customers` id + parent person id + record versions. G1 (atomic): `add_child_to_household(new member)`. G2 (depends G1): if no open lead → `create_lead` (G2a) then `create_process_participation` (G2b); else participation only. Async: events.
3. **Existing Person update + document attach, no lifecycle.** G1 (atomic): `update_record_fields(person)` with `precondition_record_version` (contact-field changes flagged review, Decision J). G2: `attach_document(→person/opportunity)` (reversible). No lead/participation. Async: activity event.

**Status.** 🔒 Frozen for V1. **Blocks:** D2 (executor).

---

## Decision H — Merge boundary 🔒 (propose-only in V1)

**Question.** Match vs link vs merge; is merge in V1 execution or proposal-only; authority; source/target; conflict; tombstones; relationship migration; audit/reversibility.

**Evidence.** No merge exists; all "merge" is match-and-link or in-memory collapse **[C]**; "no silent merges" doctrine **[D]**.

**Frozen (V1).** **Match** selects an existing record for this submission. **Link** creates an association row. **Merge** collapses two *existing* records, changing authority. **In V1, merge is proposal/escalation only:** Processing may surface a **`propose_merge` recommendation / duplicate exception** when it detects two existing records that are the same party, but **merge execution is NOT part of ordinary intake commit.** Merge execution = separate **privileged** workflow (Phase F): privileged role, always human; operator selects survivor(target)/merged(source); conflict resolution, tombstone/alias redirects, relationship/history/document/work/comms reprojection, full audit + reversibility. V1 delivers only the proposal + (deferred) `identity_merges` schema.

**Status.** 🔒 Frozen for V1 (merge = propose-only; execution deferred to Phase F). **Blocks:** nothing in V1 commit; Phase F later.

---

## Decision I — First source rollout 🔒 (revises earlier "forms first")

**Question.** Compare Option 1 (forms shadow → forms commit), Option 2 (Create Lead commit → forms shadow → forms commit), Option 3 (document/packet first). Pick one; define exact order.

**Evaluation.** Create Lead has the **most mature review + commit-selection** (`resolveIntakeRecordResolution` + `CreateLeadCommitSelection` + operator-in-loop) and the **lowest production blast radius** (operator-initiated, not high-volume anonymous), so it is the safest place to first run the **executor** in production. Public forms are the **highest volume** and the **best legacy-vs-proposed comparison** — ideal for **shadow** (zero write risk) — and the **biggest duplicate-prevention win** for the first *high-value* commit, but riskier to cut first. Document/packet writes nothing today (poor first commit — nothing to prove).

**Frozen rollout order (V1).**
1. **Shadow: public form submit** (highest-volume comparison; zero production writes) — proves resolver + plan + signals at scale.
2. **First reviewed commit: Manual Create Lead** — first place the executor writes in production; operator-in-loop; low blast radius; proves the full plan→approval→executor chain.
3. **Reviewed commit: public forms** — de-risked by (1) shadow data and (2) the Create-Lead-proven executor; largest duplicate-prevention win.
4. Document/packet reviewed commit (wires the real resolver seam).
5. book-v2 quote-start (share the ambiguity-aware matcher).
6. gutters + backend cleaning leads (retire direct writes).
7. vendor application.

This **revises** the earlier recommendation (which put forms first for both shadow and commit): shadow stays on forms, but the **first executor cutover is Create Lead**.

**Status.** 🔒 Frozen for V1. **Blocks:** migration Phases C/D ordering; implementation D-slices.

---

## Decision J — V1 policy boundary 🔒 (deterministic-first, human-authoritative)

**Question.** Which actions may be auto-interpreted / preselected / recommended / approved / committed.

**Frozen (V1).**
| Action | V1 policy |
|---|---|
| Auto-**interpret** (extract/normalize/generate/score) | **Yes** — deterministic engine, always |
| Auto-**recommend** | **Yes** — the engine always produces recommendations |
| Auto-**preselect** a candidate | Only with **trusted identity** (portal-auth or existing-record/packet token) **and** Confirmed band — and still requires operator approval in V1 |
| Auto-**approve** | **No** — a human approves |
| Auto-**commit** | **No** for any identity creation/link/merge/contact-field change |

**Only** pure **no-ops** (matched + no change, no write) may auto-complete a case — policy-gated, **off by default**. **Never auto-committed in V1 (frozen list):** create person/child/family/lead/enrollment; link/unlink; contact-field changes; merge; any op with a contradiction; any op on an untrusted anonymous submission.

**Status.** 🔒 Frozen for V1. Auto-preselect-without-review and no-op auto-complete are 🧩 deferred behind the policy engine (Phase G), off by default. **Blocks:** nothing in V1 (policy engine is Phase G); establishes the executor's hard guardrails.

---

## Mapping of the original 20 open questions

| Orig # | Now resolved by | Result |
|---|---|---|
| 1 Family model | A | Container projected from relationships 🔒 |
| 2 Parent vs Person | A, C | Person-first; Parent = role; contacts retired for identity 🔒 |
| 3 Child representation | A | `customer_members`, optional person backing 🧩 |
| 4 Lead vs Enrollment / dual substrate | B, E | Semantic participation command; PI forward, OCM legacy 🧩 |
| 5 Trusted sources | C, J | Portal + tokens trusted; preselect-only, review 🔒 |
| 6 Shared email/phone | C | Signals not unique keys; no person-level unique 🔒 (reversed) |
| 7 Min evidence for create | D | Thresholds frozen 🔒 (product-owner finalized) |
| 8 Multi-household | A, C | Many-to-many `customer_persons`; operator selects 🔒 |
| 9 Multi-child submission | A, G | All children, one plan; remove `commit_limited_to_primary` 🔒 |
| 10 Multi-household submission | A | Split into linked cases per household 🔒 |
| 11 Merge authority | H | Propose-only V1; privileged execution Phase F 🔒 |
| 12 Approval granularity | F | Whole-plan + per-op include flags 🔒 |
| 13 Commit atomicity | G | Atomic groups + sequencing + compensation 🔒 |
| 14 Reusable decisions | (defer) | Re-resolve each time V1 🧩 |
| 15 Reprocessing | (data-model) | New generation appended, prior retained 🔒 |
| 16 Retention | (data-model) | Retention **classes** frozen 🔒 (product-owner finalized); `retention_class` supported from foundation; purge jobs later |
| 17 AI participation | J | Propose-only, off by default 🔒 |
| 18 First source | I | Shadow forms; commit Create Lead first 🔒 (revised) |
| 19 Legacy retirement | I, migration | Per-source at phase exit 🔒 |
| 20 Automation boundary | J | No auto-commit of identity in V1 🔒 |

## Product-owner decisions — now finalized (no longer open)
- **D** new-record thresholds — **finalized** (table above).
- **E** reopen-vs-new — **finalized**: 180-day default, organization-configurable, policy-driven (not hardcoded).
- **Retention** — **finalized** as retention **classes** (see `processing-identity-resolution-data-model.md` §Retention): committed-case-lineage = life of record + org/legal; uncommitted ordinary = 24 mo; rejected/duplicate = 24 mo; raw OCR/transient = 12 mo after completion; plans/approvals/attempts/results/audit = 7 yr minimum; PII logs = only as long as operationally necessary. `retention_class` supported from the foundation; purge jobs are a later phase.

## Remaining non-blocking items (implementation-time, not architecture)
- Concrete per-org configuration **values** for the reopen window and retention windows (defaults above stand).
- **Purge-job implementation** timing (schema supports `retention_class` now; jobs land in a later phase).

Nothing on either list blocks the first implementation package (B1a).
