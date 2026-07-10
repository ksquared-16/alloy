# Processing Identity Resolution — Test Strategy

**Baseline:** `origin/staging` @ `65afc8527`. Repo test stack: vitest (`web/vitest.config.ts`) + Playwright (`web/playwright.config.ts`); Python `backend/tests/`. **Repo caveat:** the vitest baseline is ~750 red — gate every slice on `typecheck:build` green + *new* failures only, using an isolated-worktree regression diff (repo convention).

**Determinism mandate:** because extraction/matching are deterministic (no OCR/LLM/AI in the commit path), every unit and scenario test is fully deterministic and reproducible — no model mocking required for the core engine.

---

## 1. Unit tests

| Area | What to assert | Anchor |
|---|---|---|
| **Normalization** | one canonical phone form; +1/10-digit/formatted all normalize equal; email trim/lowercase; name whitespace collapse; DOB parse; parity vs every legacy normalizer on a corpus | `lib/identity/*` vs `bookingIdentityNormalize`, `intakePersonMatch`, `intake/normalize/*` |
| **Candidate generation** | org-scoped queries only; capped lists (not first-match); email→phone→name→name+DOB order; archived included+flagged | `queryMatches.ts` |
| **Signal evaluation** | polarity (support/contradict/exclude), weight, evidence linkage; contradiction downgrades band | `matchIdentity.ts` |
| **Contradiction evaluation** | DOB mismatch on email match → Conflicted; tenant mismatch → Excluded | new |
| **Confidence classification** | signals → band deterministic; Confirmed requires exact key + no contradiction | §7.7 |
| **Recommendation generation** | action per band (`defaultActionForConfidence`); before/after; requires_approval flags | `buildProposals.ts` |
| **Dependency ordering** | plan DAG topological; child depends on household; atomic groups cohere | plan builder |
| **Commit-plan generation** | deterministic build; content hash stable; edit → new version | `CreateLeadCommitSelection` generalization |
| **Idempotency** | double envelope (same `idempotency_key`) → one case; double command → one record | `uq_pcs_primary_source_once`, D0 commands |
| **Stale-plan detection** | precondition record-version mismatch → plan invalid | executor |

## 2. Integration tests

| Flow | Assert |
|---|---|
| Adapter → Case | envelope creates one case + `processing_case_sources`; idempotent on replay |
| Case → facts/evidence | facts persisted with evidence refs; correction creates new fact version, original preserved |
| Facts → candidates | candidates generated + persisted; org boundary held |
| Candidate → recommendation | selection produces recommendation with before/after |
| Recommendation → plan | plan operations reference `command_key`; ordering correct |
| Approval → execution | executor invokes canonical commands (mock command layer asserts calls, not raw writes) |
| Workflow invocation | side-effect ops emit events via `emitEvent`/`executeAdminAction` |
| Partial failure | first-group commit stands; failed group compensates; case → `partially_committed` |
| Retry | re-execute is idempotent (no duplicate records) |
| Tenant isolation | resolver/executor never cross org; RLS denies cross-org candidate |

## 3. Scenario tests (the 25 required)

Each is a deterministic end-to-end fixture (envelope → resolution → plan → commit) asserting the resolution band, the plan, and the committed records.

1. **Brand-new family, one parent, one child** → no candidates; plan creates person+customer+customer_persons+customer_member+opportunity(+participation); no duplicates.
2. **Existing family, new child** → parent Confirmed (email); household resolved; child no_match → create member under existing customer; attach participation.
3. **Existing parent, new enrollment interest** → parent Confirmed; existing customer; new opportunity (or reopen per [O]); no duplicate person.
4. **Existing child, new location interest** → child Strong (household member); new OCM/participation for new cohort; no new child.
5. **Exact email match but conflicting child DOB** → parent Confirmed; child Conflicted (email household vs DOB mismatch) → hold for operator; no silent link.
6. **Shared household phone** → two parents same phone; phone signal supports household but not person uniqueness; resolves by email/name; no wrong-person link.
7. **Shared parent email** → email matches an existing person; corroborate by name/phone; if name mismatch → Conflicted, review (not silent link).
8. **Parent with two households** → person in >1 `customers` via `customer_persons`; candidate generation returns both; operator/policy selects; no auto-merge.
9. **Child with separated guardians** → child links to two households; participation scoped correctly; both guardians retained.
10. **Duplicate website submission** → same `submission_idempotency_key`/source → one case; opportunity dedup → no second lead.
11. **Duplicate packet submission** → same packet source → one case (`uq_pcs_primary_source_once`); no duplicate records.
12. **Authenticated portal update** → `trust_context.authenticated_subject_id` preselects candidate (policy-gated); existing-record link honored.
13. **Anonymous form resembling an existing family** → no trusted identity; Strong/Possible bands → review required; no auto-write.
14. **OCR extraction with incorrect DOB** *(future-shaped; text-extraction analog today)* → wrong DOB produces Conflicted on child; operator corrects fact (new fact version); re-resolve.
15. **Import row with partial identity** → missing phone; email-only Possible; create_new gated on min-evidence ([O] decision 7).
16. **Communication-derived update** *(future source)* → comms fact proposes update; routed to review; never auto-commits identity.
17. **Existing archived duplicate** → candidate generation includes archived, flagged; surfaced so operator can restore/merge rather than create new.
18. **Two equally plausible candidates** → both Possible; no auto-select; operator disambiguation required.
19. **No suitable candidate** → create_new; min-evidence check; `unresolved` allowed as safe terminal.
20. **Merge proposal** → two existing persons detected identical → escalate merge (privileged), not a link side effect; tombstone/alias on execute.
21. **Record changed after approval** → precondition record-version mismatch → plan invalidated → reopen; no stale commit.
22. **Commit partially fails** → atomic group A commits, group B fails → `partially_committed`; compensation for reversible ops; exception recorded.
23. **Commit retry** → re-run after partial → idempotent completion; no duplicate records.
24. **Cross-tenant collision attempt** → envelope org A referencing org B record → candidate generation/commit denied by org scope + RLS.
25. **Source replay with same idempotency key** → no second case, no second mutation.

## 4. Shadow-mode comparison tests

- **Harness:** for a corpus of real (anonymized) form submissions, run legacy `applyFormIntakeSafe` outcome and the engine's proposed plan side-by-side **without executing** the engine plan.
- **Assert:** for each submission, record `{legacy_outcome, proposed_candidates, proposed_recommendation, proposed_plan}` and a divergence class: `agree | engine-prevents-duplicate | engine-would-create-duplicate | different-link | different-review`.
- **Gates (Phase C exit):** `engine-would-create-duplicate == 0`; `agree + engine-prevents-duplicate ≥ target%`; every `different-*` triaged with a rule/normalizer explanation.
- **No production effect:** shadow writes only `processing_*` proposal rows (never identity tables); a kill-flag discards them.

## 5. Regression & safety nets

- **Direct-write guard:** extend `tests/adminV2/actions/noClientDirectMutation.test.ts` intent to a server-side check that Processing commit paths invoke `command_key`s, not raw `.from(identity_table).insert/update`.
- **Idempotency invariants:** property tests replaying random envelope sequences assert no duplicate cases/records.
- **RLS suite:** every `processing_*` table + the B0 policy fixes.
- **Backfill validation:** the D0 de-duplication backfill emits a collision report; tests assert no forced merges (collisions quarantined, not auto-resolved).
- **Performance:** import-scale (Phase F) — candidate-generation latency under N-record batch within budget; alarm on p95 regression.

## 6. Validation commands (per slice)

```
cd web && npm run typecheck:build          # must pass every slice
cd web && npx vitest run tests/identity     # B1
cd web && npx vitest run tests/processing   # B3, C1, D1 (plan), D2 (executor)
cd web && npx vitest run tests/commands     # D0
cd web && npx playwright test <processing>  # D3 review (+ user-owned live walkthrough)
```
Gate on `typecheck:build` + no *new* vitest failures vs an isolated-worktree baseline diff (repo convention; ~750 pre-existing reds are not this sprint's).
