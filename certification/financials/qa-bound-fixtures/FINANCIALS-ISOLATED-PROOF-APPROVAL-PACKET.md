# Financials isolated proof — approval packet v2 (prepared, NOT approved, NOT executed)

Sprint `OPWORK_B77B3CBB5840_SPRINT_386D603E60C7` · lane `lane_b77b3cbb5840` · installed toolkit `20261031-eeaa6dac6860`
(Gateway runtime `eeaa6dac6860`). Revised 2026-10-31. **v1 of this packet is preserved at `4c1b85bdf93f`.** Its claim
that "v1 is execution-ready" was rejected and is withdrawn: v1 compatibility is not exact connection identity or
target-hold authority.

No database connection, credential read, live suite, environment, resource, access change, cleanup, hold change,
publication or merge was done to prepare this packet. **No target is authorized by this file.**

## 0. Decision

| | State |
|---|---|
| Product code | **v2 adopted locally, tested synthetically.** Authority v2 only, with no v1 fallback, plus non-SQL program pins and proof instrumentation. Code commit `184c50a276e31f815c73ff3cbe44e33a2e8c0b7a`. |
| Execution under the installed toolkit | **Refuses by design.** `eeaa6dac` issues Financials v1 records, and the child refuses them (`fixture_authority_org_unbound`). |
| Blocking dependency | **Platform** (`OPWORK_C86B7CC3C436_SPRINT_94E98241AD37`, `lane_c86b7cc3c436`): the program pin variant, plus both Financials entries registered v2 with the pins in `FINANCIALS-V2-PROGRAM-PINS-HANDOFF.json`, released and installed. This is not a user decision and not this lane's code. |
| User decisions after that | The approval bundle in §4. **None is approved; none is filed.** No active grant exists, and that is not authority. |
| Shared alloy-cert hold | Unchanged. It is not a stop on an isolated certenv. The child refuses shared targets (DB 54422, API 54421) by construction. |
| Legacy incident | Census `gar_7518908144d8d3` / `tha_4d389b4074b7b0` and its disposition are complete and preserved. They are separate from product completion. |

## 1. Candidate and pins

| | |
|---|---|
| Final code commit | `184c50a276e31f815c73ff3cbe44e33a2e8c0b7a` |
| Execution candidate `C` | the commit that adds this revision (documentation-only; named in the run report). Artifacts are byte-identical at both. Any later product commit is a new candidate: re-measure and re-register. |
| Preserved | `061e164b5` (released checkpoint `ick_c475e4049cd6`, unchanged), `4c1b85bdf` (packet v1), `fc5d5ed95` (census) |
| Base | merge-base `origin/staging` `4272e85dc8fb`. No `supabase/` change in the candidate or on staging since, so the schema baseline is unchanged. |
| Script digests (unchanged) | `test:qa:financials-isolated` `78453bfc…c169` · `dev:qa:financials-historical-draft-fixture` `07f838cf…e87e8` |
| Changed program artifacts | All in the handoff JSON: entry, both verifier files, binding, proof, live suite, `certEnvironment`, `vitest.config`, live-suite guard, historical core. `isolatedFixtureAuthorityV2.mjs` `bf6e405f…3876` is byte-identical to Enrollment `80eb7446656f`. |
| Slices | `financials-authority-v2-fail-closed` `1b8d6e2b1754`, `catalog-live-proof-and-command-coverage` `954a715f989a`, `financials-program-pins-child` `184c50a276e3`; each `COMPLETE_COMMITTED_NOT_PROMOTED` |

## 2. What the child now requires before credential use, client, import or spawn

All four callers verify first: the isolated runner, the historical entry, the vitest live-suite guard and the live
suite itself. The checks are the shared Enrollment verifier (byte-identical), plus Financials' org rule, an
API-block guard and program pins:

1. v2 record only, executor-issued (real path in the authority directory), with a live in-flight request naming its
   bytes. The record must be inside its window and match the env and the program on request, fixture, operation, run,
   environment, candidate, binding, npm script, script body digest and HEAD.
2. **Organization.**
   - Isolated tests: exactly `certification_seed` / `seed_manifest`.
   - Historical: the org the executor's QA-run ledger binds to the persona, never the seed org.
3. **Database:** `DATABASE_URL` with the child's whole environment as the client's must equal the record's identity.
   Inherited `PG*` and target-overriding URL parameters refuse; the target must be loopback and never 54422.
4. **Target hold:** re-read from the trusted store. It must be clear, at the same revision and hash, for this request.
5. **API:** `http://127.0.0.1:<port>`, never 54421, and in the **same certenv port block** as the database. This is
   a guard, not identity; the identity is requested as FIN-V2-REQ-2.
6. **Program pins:** explicit `program` variant, no SQL, a digest that recomputes, this candidate and script, every
   required artifact present, and every artifact's bytes in the checkout equal to its pin.

Clients receive only the verified API origin and org.

## 3. Proof instrumentation (authored; never run or imported here)

`catalogAddCharge.live` (9 pinned cases, `tests passed=9 failed=0` required):

- **Picker:** offerable / blocked / unsupported / absent, by the shared rule.
- **Single Add:** preview, write and post agree, with exactly one journal entry, on the Catalog's GL account.
- **Refusals:** unmapped GL, orphan GL, recurring item and other site are each refused at preview and at write, and
  nothing is written.
- **Identity:** same-name items are two charges at two prices, and the template stays a template.
- **Operator command:** `charge.add` for two children through `executeMultiChildAdd`. Each child gets one catalog
  one-time fee (3100), posted at the org's own business date and journaled once. A retry converges.
- **Bulk refusal:** an other-site item is refused for both children, with nothing written.

**Proof report.** The suite writes the report; the runner judges it with `financialsIsolatedProof.mjs`, and an absent
or invalid report is NOT a pass:

- 14 owned tables counted **by exact identity** (fixed per-run ids `ca7a<4hex>-…` or its own two agreements, in the
  bound org): **all 0 before** the first write;
- **after** its own cleanup: customers 1, locations 2, persons 2, members 2, agreements 2, policies 2, GL accounts 3,
  mapping 1, revenue categories 3, products 0, template 0, drafts 0, **non-draft charges 3, journal entries 3**;
- **retained:** 3 × `posted_charge=<uuid> journal_entry=<uuid>`, measured;
- whether an accounting period had to be created for 2026-11-05 or the business date (org-level; retained).

**Cleanup scope:** drafts on its own two agreements, its own 7 products and its own template, each deleted by id in the
bound org. There is no name match, no org-wide delete and no raw SQL. Posted charges and journal entries are immutable
and stay until the environment is retired.

**Historical draft fixture** (unchanged rules, v2 authority):
- 12 fixed-id rows plus 1 template draft in the persona org;
- `count` before and after;
- `reset` ≤ 50 fixture-owned rows; it refuses on any ledger row;
- identity by template id, never by name.

## 4. The smallest approval bundle — AFTER the platform installs §0's dependency

Each step is a governed action that needs per-action operator approval. Nothing here is filed.

| # | Action | Exact inputs | Bound | Needed for |
|---|---|---|---|---|
| A1 | `environment.build_certification_baseline` | `repository: ksquared-16/alloy`, `baseBranch: staging`, `expectedBaseSha: <origin/staging tip at filing>` | 1 env, next free 10-port block in 56100–56299, default lease | both |
| H1 | `environment.record_target_hold_state` | `targetKey: <A1 id>`, `state: clear`, `ownerId: <approving operator>`, `evidenceRef: <A1 receipt>`, `expectedRevision: 0` | first record of that one certenv; never alloy-cert | both (v2 issuance refuses without a clear record) |
| A4 | `environment.qa_run_open` | `plan: bp_v2`, `target: <A1 id>`, `expectedRepository`, `expectedBaseSha`, `expectedMigrationHead` (from A1) | lease ≤ 12 h (default 4); persona `admin` (qa_shared, session) | both |
| A2 | `product.register_candidate_preview_target` | `worktree: /Users/vacilando/Code/alloy-worktrees/financials`, `reason` | one port in 4410–4419 | historical + browser only |
| A3 | `product.activate_candidate_preview` | `target: <A2>`, `candidateSha: C`, `environmentId: <A1>`, `databaseMode: isolated`, `reason` | one production build of `C` | historical + browser only |

**Phase 1 (isolated tests only): A1 → H1 → A4**, then
`vac certify-fixture financials_isolated_tests run … --candidate C --script-sha256 78453bfc…` (one request id).

**Phase 2 (historical draft + persona browser proof): add A2 → A3**, then historical `count` → `ensure` → `verify`, then
the browser proof as `admin` at the preview's loopback origin (the draft at 7500 under its template, distinct from the
9900 Catalog item), then `reset` → `count` = 0 (fresh).

**Teardown (separate approvals):**
- `environment.qa_run_close`;
- `product.retire_candidate_preview` / `release_candidate_preview_target`;
- **`environment.retire_certification_environment` (irreversible).** It destroys the retained 3 posted charges and
  3 journal entries with the environment. It is filed only after the evidence is recorded and is its own decision.

`bp_v2` is a Business Processes plan reused for its finance-capable `qa_shared` personas. No Financials plan exists,
so the plan is a user decision. A Financials-owned plan would be a platform registry change.

## 5. Validation evidence (local, synthetic)

| Check | Result |
|---|---|
| Focused-safe list (broker), live suites excluded by the guard | 46 files / 1015 tests passed at slice 2; re-run on the final candidate is recorded in the run report |
| Authority suites after program pins (4 files + contract) | 272 passed |
| `typecheck`, `typecheck:tests` (broker) | passed on the code-final commit |
| eslint (changed files) | no new problems (the 5 `no-explicit-any` are pre-existing at `d12aaa0b99`) |
| Planted: API-block guard removed | 3 tests failed; restored byte-identical |
| Planted: persona org trusted from env | 8 tests failed; restored byte-identical |
| `vacilando-suite --tier=1 --targeted` | not applicable to this repository: the installed artifact has no `tests/deterministic` |
| Production build | the `061e164b5` full receipt (build/typecheck/test green) is pinned to the old `web/` tree and does not cover this tree. The app graph (`web/app`, `web/lib`) is unchanged since `061e`. One build on `C` is recorded in the run report if run. |

## 6. Remaining engineering (no vague asks)

1. **Platform (FIN-V2-REQ-1):** register both entries v2 / program with the handoff's artifacts at `C`, then release
   and install.
2. **Platform (FIN-V2-REQ-2):** add an API identity to the v2 record. The product will then replace the block guard
   with an exact origin match (one product slice; changes `C`).
3. **Product, after any later commit:** re-measure the artifact hashes and hand them over again.
4. **Promotion of this candidate** (checkpoint, release, PR, merge) has not started. `061e164b5`'s released
   checkpoint is separate and untouched.

## Addendum — 2026-10-31: platform API identity adopted (supersedes §-items noted)

The platform closed FIN-V2-REQ-2 with `vacilando.api_identity.v1` (candidate `4b55fc0b732231300b240f007859f7b378f2a804`,
tree `1e3eac224b16`, checkpoint `ick_9731e872c49e` — locally certified, not installed). The product adopted it in
code commit `064629131ffafaa021836e38932234751d578379` (slice `financials-api-identity-child`,
`COMPLETE_COMMITTED_NOT_PROMOTED`):

- Child check 5 above (API in the same certenv port block) is **superseded**: the block guard is removed; the
  record's `api_identity` is required and the exact origin handed to every client must be it.
- Every client is attested immediately before it exists on the exact frozen configuration
  (`runAttestedFinancialsConnection`).
- The pins in this packet and in `FINANCIALS-V2-PROGRAM-PINS-HANDOFF.json` (`377b458` / `184c50a`) are **deliberately
  unregistered evidence**. The pins to register are in `FINANCIALS-V2-API-IDENTITY-PINS-HANDOFF.json`; the candidate
  is the commit that adds it.
- Approvals A1–A4 / H1 and the irreversible-retirement decision are unchanged. No new product policy decision.
