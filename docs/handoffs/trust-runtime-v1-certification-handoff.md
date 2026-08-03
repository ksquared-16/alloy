# Handoff — Trust Runtime V1 Slice 1 certification closeout

**Status: INCOMPLETE. Not failed, not closed.** Two of the three certification gaps
carried by [`certification/trust-runtime-v1/README.md`](../../certification/trust-runtime-v1/README.md)
remain open. One is closed with a real defect found. Nothing here revises Slice 1,
and Slice 2 has not been started.

| | |
|---|---|
| Branch | `agent/claude/1-trust-runtime-v1-cert` |
| Worktree | `wt1-trust-runtime-v1-cert` (slot 1, port 3011) |
| Staging base | `db212fe1c` — *Merge PR #307: Slot 4 promotion 3* |
| Session date | 2026-08-03 |
| Slice 1 merge | `e7ff8e605` — **merged into `origin/staging` before certification closeout.** That sequence is recorded, not rewritten. |

Slice 1 itself is unchanged by this branch. The only commits here are certification
artifacts and this handoff.

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

## 2. Gap 2 — full-project typecheck: **NOT RUN**

`npm run typecheck` was never executed on this branch. It was queued behind Gap 3
and the session was stopped first. It remains exactly as the prior session left it:
open, with the scoped `tsconfig.trustcert.json` proof passing and whole-repository
type safety unverified.

A prerequisite surfaced that the next session must handle first — see the
repository defect in §5. Without a real worktree-local `node_modules`, a typecheck
in this worktree measures Slot 4's dependency tree, not this one's.

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
consumer lives on a record surface that Presentation Runtime V2 has retired for
work-unit routes. Slice 1's governed decision is real and its seam is proven, but on
the surface operators actually use, **the enrichment has no control to invoke it and
no place to display it.** S15 is not blocked by tenant data or by this branch — it is
unsatisfiable until the consumer is ported to the Focus Panel. See the revised
follow-up B.

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

## 7. Follow-ups — scoped, NOT implemented

### A. Correct `authenticated` default privileges on public tables

- Full-chain assertion 21 fails; the condition spans **253 tables**, not just Trust.
- RLS still blocks every write, so no exploit is demonstrated.
- **Migration intent and database grants disagree** — migrations that state a
  read-only posture via `GRANT SELECT` do not achieve it, because schema-wide default
  privileges have already granted ALL.
- Out of scope for a Trust branch: the fix is a platform-wide grant/revoke decision,
  not a Slice 1 revision.

### B. *(WITHDRAWN)* Repair certification tenant mixed-grain Work View configuration

Raised on a wrong diagnosis and **withdrawn** — see §4. The Work Views render
correctly at `/workspace/work-unit/<slug>`; the grain error appears only when
entering through `/adminV2/workspace`, which is not the operator route. No tenant
repair is required. Replaced by B′.

### B′. Port the Trust Runtime enrichment consumer onto the Work Unit Focus Panel

- `OperationalAttentionEnhanceDraft` is reachable **only** from
  `OpportunityDrawerOverviewBody`; `OpportunityFocusPanelBody` has no path to it
  across 1166 modules.
- `AdminEntityDrawer` deliberately returns `null` for opportunity routes on work-unit
  surfaces (Presentation Runtime V2), so the drawer body never mounts where operators
  work.
- **Scenario S15 and QA conditions 1 and 2 are unsatisfiable until this is done** —
  no amount of tenant configuration or test data changes it.
- This is a Presentation Runtime wiring decision, **not** a Slice 1 revision and
  **not** Slice 2. Whether the enrichment affordance belongs on the Focus Panel at
  all is a product call for Kelly, not an engineering default.

---

## 8. Operator surfaces — use these, not `/admin` or `/legacy-admin`

The canonical operator surfaces are **`/workspace`**,
**`/workspace/work-unit/<slug>`** and **`/organization`**. `/adminV2/workspace`
redirects but is not the operator route and produced the false grain diagnosis in §4;
`/admin/*` and `/legacy-admin/*` are legacy and must not be used to judge operator
behavior. Clicking a Today's Work row on `/workspace` lands on
`/workspace/work-unit/new-leads` — that is the surface certification must observe.

## 9. Where to resume

1. Remove the tracked `web/node_modules` symlink locally and `npm ci` (§5).
2. Run Gap 2 — full `npm run typecheck`, no strictness reduction, no Trust
   exclusions, no substituting the scoped project.
3. Gap 3 conditions 1 and 2 need a **decision from Kelly** on follow-up B′ first —
   they cannot be closed by testing harder.
4. Re-establish the base-vs-branch baseline against the *current* staging SHA before
   attributing any suite failure. The prior figures (12 `tests/workspace`, 5
   `tests/queues`) were measured against an older base and have **not** been
   re-confirmed.
5. Then, and only then, make a certification recommendation.

**Do not begin Slice 2.**

## Related

- [`certification/trust-runtime-v1/README.md`](../../certification/trust-runtime-v1/README.md)
- [`TRUST-RUNTIME-V1-IMPLEMENTATION-PLAN.md`](../platform/planning/trust-runtime/TRUST-RUNTIME-V1-IMPLEMENTATION-PLAN.md)
- [`Trust Platform Decisions`](../platform/trust/trust-platform-decisions.md) — 019–022
