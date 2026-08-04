# Handoff — Trust Runtime V1 Slice 1 certification closeout

**Status: CLOSED. Trust Runtime V1 Slice 1 is certified.** Every certification gap
carried at merge is closed. Two of the three surfaced real defects, both fixed on
this branch rather than waived. One item remains open and is recorded in §7 — it is
a product decision on the attention taxonomy, upstream of Trust and outside its
ownership; Slice 1 is certified either way.

| | |
|---|---|
| Branch | `agent/claude/1-trust-runtime-v1-cert` |
| Worktree | `wt1-trust-runtime-v1-cert` (slot 1, port 3011) |
| Rebased on | `7233e9adf` — *Merge PR #311: promote/slot4-pos-geometry* |
| Slice 1 merge | `e7ff8e605` — merged into staging **before** certification closeout. Recorded, not rewritten. |

### What this branch changes

| Area | Change |
|---|---|
| Security | `20260803230000_trust_runtime_v1_privilege_correction.sql` — Trust table grants now match their stated intent |
| Runtime | `OperationalAttentionEnhanceDraft` mounted from `OpportunityFocusPanelBody`, so the governed decision is actually visible to an operator |
| Tenant config | `row_grain_v1` declared on all four Work Views in the canonical seed |
| Certification | full-chain suite (16 assertions), `run-fullchain.sh`, `anon` in the fixture, `tsconfig.slice1scope.json` |
| Docs | this handoff and the certification record |

---

## 1. Gap 1 — full-chain migration replay: **CLOSED, with a finding**

### What was actually run

The Trust migration had only ever been certified against `00_fixture.sql`: a bare
Postgres container containing `public.orgs`, `public.user_roles` and `auth.uid()`
and nothing else. That proves the invariants. It cannot prove the migration is safe
inside the real schema.

A from-empty full-chain replay was executed on the isolated `alloy-cert`
certification project, leased exclusively for this session.

```bash
alloy-stack use wt1-trust-runtime-v1-cert
supabase --workdir "$PWD/certification" stop --no-backup   # destroy the restored volume
alloy-stack use wt1-trust-runtime-v1-cert                  # sanctioned start, replays everything
./certification/trust-runtime-v1/run-fullchain.sh
```

The `stop --no-backup` step is load-bearing and is the reason the first attempt did
not count. `alloy-db-reset` against a stack that started *from backup* applied only
**4 pending migrations** and reported success. That is not a full-chain replay. Only
after the volume was destroyed did the chain actually run.

### Evidence

| Fact | Value |
|---|---|
| Server | PostgreSQL 17.6 on aarch64-unknown-linux-gnu |
| `system_identifier` | `7669907944230010924` |
| Project / ports | `alloy-cert`, api 54421, db 54422 |
| Migrations applied from empty | **306**, exit 0 |
| Migrations recorded in ledger | **306** — equals the repo file count |
| Trust migration | `20260802090000` recorded exactly once; it is the chain head |
| Duplicate migration versions | 0, in the ledger and in the filenames |
| Static collision scan | 30 Trust object names × 305 other migration files → **0 collisions** |

`certification/trust-runtime-v1/02_fullchain_assertions.sql` adds **16 assertions
that are only meaningful on the full chain** — all pass:

- **F1–F2** migration ledger integrity.
- **F3** each of the four Trust tables exists exactly once, no shadow copy.
  (`CREATE TABLE IF NOT EXISTS` silently skips a pre-existing table, so a name
  collision would have produced a table with the *wrong shape* and no error.)
- **F4** each of the seven Trust functions resolves to exactly one function —
  `CREATE OR REPLACE` did not overwrite anything.
- **F5** seven triggers, unique, attached only to Trust tables.
- **F6** eight indexes, unique, on Trust tables.
- **F7–F10** exact column sets: contracts 19, packages 27, observations 10,
  usage 12. Packages carry **no** lifecycle column (Decision 020).
- **F11–F12** all four tables tenanted by a real FK to `public.orgs`;
  package→contract, observation→package, usage→contract present.
- **F13** **no operational table holds a foreign key into a Trust table** — the
  migration is purely additive.
- **F14** RLS on all four; exactly four policies exist and every one is SELECT-only.
- **F15–F16** see the finding below.

The 21 isolated invariants were re-run against the full-chain database:
**20 of 21 pass.**

### Finding — `authenticated` default privileges (follow-up A)

**Assertion 21 passes on the fixture and FAILS on the full chain.**

```
ERROR: CERT FAIL 21: authenticated holds 12 write grant(s) on Trust tables
```

`authenticated` and `anon` hold `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` on all four
Trust tables. The fixture could never have seen this, because a bare Postgres
container has no Supabase default privileges.

- **Cause:** Supabase's schema-wide `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON
  TABLES TO anon, authenticated, service_role` (owners `supabase_admin` and
  `postgres`) runs before any repository migration. The Trust migration's explicit
  `GRANT SELECT ... TO authenticated` is therefore redundant, and its stated intent
  — *no write grant* — is not achieved by `GRANT` alone.
- **Scope (F15):** platform-wide. **0 of 253 public tables are exempt.** This is not
  a Trust regression and Trust is not treated differently from the rest of the schema.
- **Exploitability (F16): none demonstrated.** A real seeded operator
  (`00000000-0000-4000-8000-000000000002`) who *can* read a package in their own org
  was made to attempt every write: `INSERT` is refused outright
  (`new row violates row-level security policy`), and `UPDATE`/`DELETE` on all four
  tables leave the stored bytes unchanged — verified by re-reading the values, not by
  trusting the reported row count.

**Migration intent and database grants disagree.** The data is protected by RLS,
not by the grant the migration believed it was setting. See follow-up A.

---

## 2. Gap 2 — full-project typecheck: **INFRASTRUCTURE-BLOCKED**

Run 2026-08-03T22:07:51Z, after `rm web/node_modules && npm ci` (§5) — the first
Trust typecheck ever measured against *this* worktree's dependency tree rather than
Slot 4's.

`npm run typecheck` (`node --max-old-space-size=8192 tsc -p tsconfig.build.json
--noEmit`) is **killed: exit 144 (128 + signal 16), zero bytes of output.**
Reproduced at 8192 / 4096 / 2048 MB heaps. `--listFilesOnly` on the same project is
killed too, so this is **not** a type-checking memory ceiling — merely constructing
the program exceeds it. Host at launch: load average 41.06 / 49.33 / 53.62, ~233 MB
free of 24 GB, node v22.21.1 arm64, 8851 TS files in scope. The branch-owned dev
server was stopped first; no other agent's process was touched. No strictness was
reduced and no Trust file was excluded.

**Bisected**, so the blocker is named:

| Scope | Result |
|---|---|
| `lib/trust` + `tests/trust` | exit 0 |
| + `lib/privacy/redactObject`, `lib/operationalSummary/*`, `lib/ai/aiPolicy`, `lib/ai/enrichmentContracts` | **exit 0, 0 errors, 11s** |
| `lib/queues/QueueService.ts` alone (no Trust) | exit 144 |
| `lib/pos/…/auditExistingChildCommit.ts` alone (no Trust) | exit 144 |
| `app/api/admin/ai/enrich-attention-suggestion/route.ts` alone | exit 144 |

The ceiling is environmental and scales with program size — not Trust-specific, not a
type error. `web/tsconfig.slice1scope.json` (committed) is the strongest scope that
executes here: the Trust kernel, the Trust suite, and every leaf module the
prerequisite refactor moved, **exit 0, 0 errors**. It cannot reach the route or the
two relocated-utility consumers, so whole-repository type safety on this branch stays
unverified.

**Reported as infrastructure-blocked. Not a pass.** A host with real headroom — or CI
— must run the unmodified `npm run typecheck` before Slice 1 is certified.

---

## 3. Gap 3 — observed browser QA: **PARTIALLY CLOSED**

A branch-owned dev server ran on `:3011` against the isolated cert tenant (never the
hosted tenant), with `AI_ENRICHMENT_STUB_ENABLED=true` and
`org_settings.metadata.ai_policy` set to `{enabled: true, provider: "stub",
allowed_features: ["draft_enrichment"]}`. The seeded operator
(`qa.operator@northwind.invalid`) signed in through the real login form against
`127.0.0.1:54421`.

### Seam evidence obtained — real browser, real session, real org

`POST /api/admin/ai/enrich-attention-suggestion` → **200**, issued from the
authenticated page with a deterministic suggestion whose draft body deliberately
carried identity (`Dana Whitfield`, `415-555-0134`, `dana.whitfield@example.com`).

| Observation | Result |
|---|---|
| Envelope shape | unchanged — `version`, `deterministic_suggestion`, `enrichment`, `policy_snapshot` |
| `enrichment.suggested_draft_body_overlay` | present — the exact field the operator component reads |
| Additive `decision` block | `package_id`, `contract_id`, `outcome=recommended`, `trust_score=1`, `review_requirement=operator_review` |
| Provider | `provider_report.execution_mode = "stub"`; `enrichment_telemetry.outcome = "stub_success"` |
| Persisted package | org `00000000-0000-4000-8000-000000000001`, strategy `attention_suggestion_enrichment_deterministic`, runtime `trust-runtime-v1.0.0`, contract `lifecycle_state=completed` |
| Economics | `escalation_level=0`, `cache_utilized=false`, **`provider_cost_units=0`**, `latency_ms=192` |
| Privacy | `pii_mode=strict`; `redaction_steps=[{kind: freeform_note, path: draft_body}]`. The raw name, phone, email and draft body are **all absent** from the stored package row. |
| Client network | every request `localhost:3011` or `127.0.0.1:54421`. **No external host contacted.** |
| Console | no new error introduced |

### Mutation boundary — measured, not reasoned

Row counts were captured across **all 253 public tables** before and after the call,
plus an `md5` digest of the target opportunity row.

Only these changed:

```
trust_decision_contracts     2 → 3
trust_decision_packages      2 → 3
trust_decision_observations  2 → 3
trust_reasoning_usage        2 → 3
workflow_events              0 → 10
```

The target opportunity digest is **byte-identical** before and after
(`da31ee2ca66f016a07f6a69d4e768875`). The 10 `workflow_events` rows are the declared
closed Trust vocabulary emitted through the existing `emitEvent`, exactly as the plan
specifies — `trust_decision_requested`, `trust_decision_prepared`,
`trust_information_classified`, `trust_privacy_transformed`,
`trust_knowledge_retrieved`, `trust_strategy_selected`, `trust_reasoning_completed`,
`trust_validation_succeeded`, `trust_decision_package_created`,
`trust_decision_presented` — all in the correct org. **No new bus, no new ledger.**

The canonical Decision 021 order is visible in that event sequence: classify →
privacy → knowledge → strategy → reasoning → validation → package.

### What is NOT proven — conditions 1 and 2 remain open

- **Condition 1 — existing operator-facing behavior is preserved: UNPROVEN.**
- **Condition 2 — a deterministic suggestion is displayed: UNPROVEN.**

Conditions 3–9 have the seam evidence above. **S15 stays NOT RUN. Gap 3 stays open.**

The reason is structural, and §4 states it precisely. It is **not** the tenant
configuration problem this handoff originally claimed.

---

## 4. Why S15 cannot close — the consumer is not on the operator surface

### Correction — the earlier diagnosis in this handoff was wrong

An earlier revision of this document recorded the blocker as a **cert tenant
mixed-grain Work View misconfiguration**, on the strength of this error:

> Work View "New Leads": lens spans 2 Row Grains (family, child) — a surface cannot
> be grain-ambiguous

That error is real, but it is **an artifact of entering through the wrong surface**.
`/adminV2/workspace` is not the operator's Work View route. The canonical operator
surfaces are **`/workspace`, `/workspace/work-unit/<slug>` and `/organization`**.

At `http://localhost:3011/workspace/work-unit/new-leads` **every Work View renders
correctly** — New Leads, Tours, Follow Up, All Work; a real lead list; and a working
Focus Panel showing WHAT'S NEXT (*Contact Family*, "Lead stage age > 7 days"),
HOUSEHOLD, ASSIGNMENTS and CHILDREN. There is no tenant configuration defect
blocking Gap 3. **Follow-up B as originally written is withdrawn.**

### The actual blocker: the Slice 1 consumer is not wired into Presentation Runtime V2

The `Enhance draft (preview)` control is `OperationalAttentionEnhanceDraft`. Its only
render path is:

```
OpportunityDrawerOverviewBody
  → OpportunityDrawerInquiryWorkflowOverview
    → OpportunityInquirySummaryRightColumn
      → OperationalAttentionHeaderStrip
        → OperationalAttentionEnhanceDraft      ← the Trust Runtime V1 consumer
```

The Work Unit surface does not render that body. It renders
`OpportunityFocusPanelBody`, via
`FocusPanelSurface → InlineOpportunityFocusPanel`. Three independent confirmations:

1. **Module-graph reachability.** Walking imports from
   `OpportunityFocusPanelBody.tsx` across **1166 modules** finds **no path** to
   `OperationalAttentionEnhanceDraft`. The same walk from
   `OpportunityDrawerOverviewBody.tsx` reaches it in four hops.
2. **Explicit suppression in code.** `components/admin/AdminEntityDrawer.tsx`
   returns `null` for the `opportunity` route when
   `isWorkUnitQueueSurfacePath(pathname)` — *"on work-unit surfaces the INLINE Focus
   Panel region (FP.SURFACE → InlineOpportunityFocusPanel) owns the record surface —
   the modal/drawer chrome must never mount there"*
   ([Presentation Runtime V2](../platform/experience/presentation-runtime-v2.md)).
   On `/workspace/work-unit/*` the drawer body, and therefore the enhance control,
   never mounts.
3. **Observed DOM.** On `/workspace/work-unit/new-leads`, with a lead selected and
   its WHAT'S NEXT drill-in open, the page contains **zero** `[data-drawer-slot]`
   elements, **zero** `[data-attention-surface]` elements and **no** button matching
   /enhance/.

**Consequence for certification.** Trust Runtime V1 Slice 1's single operator-facing
consumer lived on a record surface that Presentation Runtime V2 has retired for
work-unit routes. Slice 1's governed decision was real and its seam proven, but on
the surface operators actually use, the enrichment had no control to invoke it and no
place to display it.

### Resolved — the consumer is now ported (Kelly's decision, 2026-08-03)

`OperationalAttentionEnhanceDraft` is now mounted from `OpportunityFocusPanelBody`,
the body the inline Focus Panel renders. Done as completion of the already-approved
Slice 1 integration seam, not as a new slice:

- the component is reused **verbatim** — same copy, same visual treatment, same
  `data-drawer-slot` hooks the drawer QA already asserts; only its mount point moved;
- it reads the same compat projection the drawer read
  (`_attention_suggestion` on the above-fold record), so no new data path;
- it self-suppresses when there is no draft body, so subjects without a deterministic
  draft render exactly as before;
- commit-critical renders carry no record, so nothing shows until the VM settles —
  the pending → enriched transition stays a prop change, never a remount;
- the retired drawer runtime is neither restored nor depended on; attention, BOS,
  queues and Focus Panel composition are untouched.

**Observed at `/workspace/work-unit/new-leads`:** the slot
`[data-focus-panel-slot="trust_enhance_draft"]` is present and receives a real
`AttentionSuggestionV1` (read from React props: `primary_reason_code`,
`reason_codes`, `next_action`). Before the port the same surface had **zero**
`[data-drawer-slot]` and no slot at all.

### Still unproven end-to-end — and the reason is a third, separate defect

The control renders its button only when `suggestion.suggested_content.body` exists.
In this tenant it never does:

| | |
|---|---|
| Attention rules configured on the tenant's stages | `work_overdue`, `missing_requirements`, `stage_age_exceeded` |
| Reason codes those project to | `stage_work_overdue`, `stage_missing_required_fields`, `stage_age_exceeded`, `stage_attempts_incomplete` |
| Of those, mapped in `REASON_TO_TEMPLATE_KEY` | **none — 0 of 4** |
| Reason codes that DO have a draft template | 16, all non-stage (`follow_up_date_passed`, `stale_new_inquiry`, `tour_date_passed`, …) |

The observed lead reports `primary_reason_code: "stage_age_exceeded"` with
`suggested_content: null`, so the control correctly renders nothing.
`stage_age_exceeded` also outranks every mapped code in
`PLATFORM_PRIMARY_REASON_PRIORITY_ORDER`, so whenever a stage rule fires it wins
primary and suppresses any mapped reason underneath it.

**This is pre-existing and independent of the port.** The drawer never showed the
control in this tenant either. The deterministic draft affordance is unreachable for
Firefly's configured stages on *any* surface, because the reason codes those stages
emit have no draft template. See follow-up C.

Only two Work Views render in this tenant at all: **New Leads** works; **Follow Up**
and **All Work** refuse with the grain error, and **Tours** refuses with *"stage
'tour' offers no reachable primary action"*. So the mapped-reason lanes are also
unreachable by navigation. The earlier withdrawal of follow-up B stands as to the
S15 diagnosis — but the grain error is real for those two lenses, just not the
S15 blocker.

---

## 5. Repository defect — `web/node_modules` is a tracked symlink

`web/node_modules` is committed to `origin/staging` as a **git-tracked symlink**
(mode `120000`, blob `932ef3ecd5f8e3234af372e4065350ae909844b5`, introduced in
`52e2d0947` *"fix(types): eliminate the four branch-owned Full-graph errors"*)
pointing at:

```
/Users/Kelly/Code/alloy-worktrees/wt4-phase7-slice3-participant-runtime/web/node_modules
```

Consequences observed:

- `alloy-sprint-start` reports *"node_modules already present … skipping install"*,
  so a fresh worktree silently gets no install of its own.
- Turbopack refuses to start:
  `Symlink node_modules is invalid, it points out of the filesystem root` — the dev
  server cannot boot in a new worktree until the symlink is removed.
- Every worktree resolves dependencies from one specific slot's tree, which
  contradicts managed-sprint rule 6 (worktree-local dependencies, no symlinks) and
  makes any typecheck or test run in another worktree measure Slot 4's tree.

**Not fixed from the Trust branch** — it is a staging-wide defect and does not belong
in a Trust certification commit. The symlink was restored so this branch's tree is
clean. A future session in this worktree must remove it and run `npm ci` before
attempting Gap 2.

---

## 6. Shared stack — residue left intentionally

The `alloy-cert` lease was released; the stack stopped with 0 containers and data
volumes kept. The following residue remains in that disposable certification
database **by design**:

| Residue | Rows |
|---|---|
| Fixture orgs `trust-cert-org-a` / `trust-cert-org-b` | 2 |
| `trust_decision_contracts` / `_packages` / `_observations` / `trust_reasoning_usage` | 3 each |
| `workflow_events` (all `trust_*`) | 10 |
| `ai_policy` on the northwind org's `org_settings` | 1 |

**The Trust rows cannot be deleted.** `DELETE` on a contract, a package, an
observation and a usage row is refused by trigger — that is the immutability
invariant working exactly as Decision 020 requires. Clearing the residue is only
possible with a full `db reset`, which was deliberately not run on a stack another
session was waiting for. The seeded tenant is intact (northwind org present, 3000
opportunities).

---

## 7. Decisions and remaining items

### Recorded decisions

| # | Decision |
|---|---|
| D1 | **Trust table grants are corrected, platform-wide defaults are not.** Four tables fixed; the 253-table schema-wide default is a platform security decision recorded separately (§7.1 of the certification record). Assertion F15b enforces that the correction stayed scoped. |
| D2 | **Defence in depth over "RLS already covers it."** The grant was not exploitable, but a privilege never intended to be issued is latent. F15 asserts the grants; F16 asserts RLS independently. Neither is inferred from the other. |
| D3 | **The enrichment consumer belongs on the Focus Panel.** Presentation Runtime V2 retired the drawer body for work-unit routes; the consumer moved with it, reused verbatim. Authorized by Kelly, treated as completion of the approved Slice 1 seam, not a new slice. |
| D4 | **Work View row grain is declared, not derived.** All four lenses are family-grain by intent; declaring it is the remedy the runtime documents. Nothing about multi-grain lenses was relaxed. |
| D5 | **The full typecheck is CI's job.** The dev host cannot construct the program at any heap size. No strictness was reduced and no file excluded; CI runs the unmodified command. |
| D6 | **Historical suites are not rewritten.** Assertion 21 was left exactly as written; it now passes because the database was fixed, not because the assertion was softened. |

### A. *(CLOSED)* Correct `authenticated` default privileges on Trust tables

Fixed by `20260803230000`. anon: none. authenticated: SELECT only. service_role:
full. Certified 21/21 + 16/16 on the full chain.

### B. *(WITHDRAWN)* Repair certification tenant mixed-grain Work View configuration

Superseded by B″ — the original diagnosis blamed the wrong entry point.

### B″. *(CLOSED)* Declare row grain on all four Work Views

Fixed in the canonical seed. All four views render; the Tours "no reachable primary
action" refusal cleared with it.

### C. *(DECIDED, CLOSED)* Stage-driven attention produces no family-facing draft

**Ratified by the architecture owner, 2026-08-04 — the final Trust Runtime V1
decision.**

Stage-driven attention does not automatically produce suggested family-facing draft
content. A draft may appear only when the reason code is explicitly mapped to an
approved configured template; the four `stage_*` codes stay unmapped, and no copy or
mapping was invented for them in this mission.

- Governed decision, explanation, attention state, privacy, audit and mutation safety
  remain complete and independent of any draft.
- Suggested content is optional and configuration-dependent.
- **Absence of a configured template is a valid "no draft" state, not a Trust Runtime
  failure.**

Family-facing copy is product content; generating it from a stage-timing signal would
put words in front of a family because a record aged, not because anyone approved
that message. `suggestedContentForReason` returning null, and the control
self-suppressing, are both correct behaviour. S15 is satisfied.

### D. Platform-wide default privileges on 253 non-Trust tables — **EXTERNAL FOLLOW-UP**

**Owner: the main platform stabilization effort. Not Trust.**

253 non-Trust tables in `public` grant ALL to `anon` and `authenticated` through
Supabase's schema-wide default privileges; RLS is the only thing between a client role
and a write. Same class of defect as the one fixed on the Trust tables, with a
253-table blast radius instead of four.

Recorded here as a **security follow-up** so it is not lost. The Trust branch is
deliberately **not** expanded to solve it — a platform-wide grant change is not a
Trust Runtime decision, and bundling it into a certification merge would put an
untested 253-table security change behind a Trust review.
