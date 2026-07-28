# Configuration Discovery — session handoff (FP16 M1–M5 + FP17 slices 1–2b)

**Read this first. Resume on the SAME worker slot 4.** Do NOT start Participant Conversation Runtime. Do NOT push/merge/rebase without Kelly's explicit say-so.

---

## Where things are

- **Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt4-phase7-slice3-participant-runtime`
- **Branch:** `agent/claude/4-phase7-slice3-participant-runtime`
- **Reconciled base:** rebased onto current `origin/staging` `7aef5aa6b`. HEAD `4eb34b9b3`, **ahead 22 / behind ~3** (3 non-conflicting staging commits arrived after the last fetch — re-fetch and, if they don't conflict, leave them; the divergence is trivial).
- **Safety backup of pre-rebase HEAD:** branch `backup/pre-staging-reconcile-a04b599e` + tag `pre-staging-reconcile-20260728` (both at `a04b599eb`). Original 18-commit branch is fully recoverable from there.
- **Committed, not pushed.** Clean tree.

## Start the server (Node 22 required — toolkit defaults to Node 16)

```bash
export PATH="/Users/Kelly/.nvm/versions/node/v22.21.1/bin:/Users/Kelly/bin/alloy-dev:$PATH"
alloy-dev-start wt4-phase7-slice3-participant-runtime
```
App: **http://localhost:3014**. Auth is via slot storage-state (already logged in as kelly@kurzmancapital.com / Firefly Early Learning tenant).

## Tests / typecheck

```bash
cd web
npx vitest run tests/pos/ tests/fields/         # discovery + relationship suites
npx tsc --noEmit -p tsconfig.build.json          # production typecheck (clean-cache: rm -f *.tsbuildinfo first)
```
- **vitest needs an arm64 rolldown binding.** If vitest errors with `rolldown-binding.darwin-arm64.node` missing:
  `npm install --no-save "@rolldown/binding-darwin-arm64@$(node -e "console.log(require('rolldown/package.json').version)")"`
- **Pre-existing failures — DO NOT CHASE.** Running `tests/fields/ tests/forms/ tests/pos/` yields **34 failing tests across 21 files** on the clean reconciled base — all from staging's 180 commits, none related to this work. (An earlier revision of this handoff said "~10"; that undercounted because it never baselined `tests/forms/`, which contributes ~24 on its own — PacketReviewRollupView, formLifecycleWorkspace, outcomeConfigPresentation, distributionPresentation, formsWorkspaceShell, etc.)
- **Method for proving no regression** (use this, don't eyeball counts): `git stash push -u`, run the suites, `sort` the `FAIL` lines to a file; `git stash pop`, re-run, `diff` the two. Identical set = no new failures. Verified this way for both commits below.

## The acceptance fixture

- Case id **`98bcca6e-9eec-4a78-828e-b5a825dc7728`** ("Enrollment Record 8.25 v2"), doc id `0c18f50f-d379-469a-828a-fe958ba7e63e`. Reach it: open the left-nav **Processing** (Digital Mailroom modal) → Recent work → "Enrollment Record 8.25 v2". Or dispatch `window.dispatchEvent(new CustomEvent("adminv2:open-processing-modal"))`.
- Permanent regression fixture PDF: `web/tests/pos/fixtures/enrollment-record-8.25.pdf` + captured geometry `…enrollment-record-8.25.geom.json` (tests run the detector over the geometry — deterministic, no PDF lib).
- **This case already has a created form `8fff533a-…` that PREDATES apply (no bindings) — do NOT reuse it for the clean publish journey. Import a fresh copy / new case for the in-order proof.**

---

## What is DONE (committed + tested)

**Native Layout Detection V1** (positional detector, bounded timeout, stage diagnostics, output-copy handling) — accepted earlier.

**Configuration Discovery M1–M5** (`web/lib/pos/discovery/*`):
- `contracts.ts` — versioned contracts (SemanticDocumentModel → BusinessConceptCandidate → ConfigurationProposal), concept taxonomy, operator-language confidence bands.
- `semanticModel.ts` / `conceptDiscovery.ts` / `configurationMatching.ts` / `discoverConfiguration.ts` — 112 questions → **41 concepts** → governed proposals. Reuses `suggestFieldBinding` + concept-key canonical bindings.
- **25→5 new-field audit** — health-screening grid/Y-N/conditionals reclassified `form_only_response` (not durable fields). Regression assertions committed.
- `reconciliation.ts` — 4-part identity (SourceOccurrence/SemanticConcept/ConfigurationProposal/OperatorDecision) + semantic-anchored rerun reconciliation (unchanged/moved/ambiguous/new/stale/removed).
- `discoveryDecisionsDb.ts` + `discovery-decisions` route + `discoveryDecisionBridge.ts` — **durable decisions** in `processing_cases.metadata.configuration_discovery_decisions` (separate from detector output; reconciled on load). Verified live.
- `applyDiscovery.ts` + `apply-discovery` route — structured, **idempotent** application (applied/skipped/already_applied/requires_confirmation/conflicted/failed). reuse→binds `field_source` (excludes output-copy dupes); new field→requires_confirmation+prepared; relationship→canonical command; requirements→confirmed. Verified live.
- UI: `ProcessingConceptReview.tsx` (concept-first summary + grouped cards + Accept/Ignore/bulk-accept/**Apply**) inserted in `PosTemplateSetupColumn.tsx`; detailed review is drill-down. Decisions persist load/save.
- `form-draft/save` route **preserves `configuration_discovery`** (was dropped) so lineage survives generate→publish.

**FP17 (relationship collections from configuration) — slices 1–2b:**
- **Slice 1** `web/lib/fields/relationship/relationshipDefinitions.ts` — the CANONICAL definition registry (future `relationship_definitions` DB rows). `canonicalCollectionProviderRegistry.ts` **derives** the 3 relationship providers from it (`deriveRelationshipCollectionProviders`, `relationshipCollectionProjection`); children/household.members stay **native** (documented rule). Proven **byte-identical** to prior hand-authored defs. `classifyCollectionProvider()`, definition-driven `canonicalCollectionProviderForRole()`.
  - **Renamed `7f7d35bd3`** (Kelly's architectural clarification): was `fields/collection/relationshipCollectionDefinitions.ts` — a canonical model living inside a *consumer's* folder, named as if collections owned it. `RELATIONSHIP_COLLECTION_DEFINITIONS`→`RELATIONSHIP_DEFINITIONS`, `RelationshipCollectionDefinition`→`RelationshipDefinition`, `providerFromRelationshipDefinition`→`relationshipCollectionProjection`. **The Relationship Model is canonical; a collection is ONE projection of it.**
- **Slice 2** `canonicalCollectionResolver.ts` — `authorized_pickup` + any future role resolves **generically from `person_child_relationship_roles`** by role key (`resolveViaCanonicalPersonChildRoles`). Parents/emergency keep legacy path (byte-identical). Certified: empty/resolved/invalid-context/org-isolation.
- **Slice 2b** `applyDiscovery.ts` — relationship results carry the canonical `apply_command_key` (`add_emergency_contact`/`add_authorized_pickup`) + role + scope → the submission-time write path.

## Canonical architecture facts (from investigation — build against these)

- **No `relationship_definitions` DB table.** Operational role keys (`PERSON_CHILD_OPERATIONAL_ROLE_KEYS` in `personChildRelationshipEntity.ts`) are **code**; kinship + `customer_persons.role_type` are config (option sets / industry DB).
- **Canonical relationship write path = `web/lib/platform/commands/runtime/adapters/relationshipExecutionAdapter.ts` → `web/lib/admin/relationship/executeRelationshipAction.ts`** (writes `person_child_relationships` + `person_child_relationship_roles`). Commands: `add_parent_guardian`, `add_emergency_contact`, `add_authorized_pickup`, …; scopes `this_child`/`selected_children`/`all_children_in_household`; registry `relationshipActionRegistry.ts`. **Discovery relationship application must flow through this — never write relationship rows directly.**
- **Field System** owns new-field creation (`field_definitions`). Discovery must create through the canonical Field System service, never write `field_definitions` directly.
- Forms projection is still capped at 3 refs / excludes pickup (`canonicalFormsRelationshipProviderDerivation.ts`, `formsCollectionRepeatBinding.ts`, `formsRelationshipOperationalSupport.ts`, `FormsRelationshipRoleKey`).

## Decisions locked (Kelly, this session)

1. **Definition source:** table-shaped in-code registry now, migrate to DB config later (mechanical).
2. **Risk posture:** additive + byte-identical, then widen.
3. **Sequencing:** backend-first vertical slices, continuous across turns.

## Architecture (read before touching relationship code)

`docs/platform/core/data/relationship-model.md` now carries the canonical layering, the
native-vs-configured rule, and an **audited conformance ledger**. The short version:

> Entity Model → **Relationship Definitions (canonical owner)** → Configuration Model →
> Relationship Collection **Projection** → Forms · Conversation Runtime · Configuration Discovery ·
> Processing · BOS · APIs. **No consumer may become the owner.**

The future-proof test — "adding Physician is ONE definition row, with no edit to any consumer" —
**does not hold yet.** 12 gap classes are catalogued in that ledger with file references; gaps 2, 3, 6
and 13 are now CLOSED. Gap #1 (the closed `PERSON_CHILD_OPERATIONAL_ROLE_KEYS` union) is a
compile-time block and gap #9 (`householdRelationshipSectionDefinitions.ts`) is a live *second*
definition registry. Work the ledger, not ad-hoc greps.

## NEXT (in order) — remaining mission scope

1. ~~**Widen Forms projection**~~ **DONE `c2b8c5f52`** — derived from `collectableRelationshipDefinitions()`; closed ledger gaps 2/3/6/13 and fixed a live defect (emergency_contacts + authorized_pickups were registered providers Forms could never bind, and their submissions were rejected as `unsupported_item_entity`). Regression test: `tests/fields/formsRelationshipProjectionWidening.test.ts`.
2. **Real Field-System field creation** for confirmed new fields: validate key uniqueness + label similarity + owner/type/options/sensitivity → create via the canonical Field System service → store the field-definition id → bind form question(s) → idempotent retry → surface applied/conflicted/failed in `ProcessingConceptReview`.
3. **Real relationship-write proof** via `executeRelationshipAction`: guardian + emergency + authorized_pickup; one Person holding multiple roles; **no duplicate Person**; no duplicate relationship on retry; child/household scope isolation.
4. **Concept-review UX completion (M5D):** choose-another-existing-field, field-catalog search, similarity candidates, edit new-field owner/type/options, reclassify between dispositions, undo, ignore-with-reason, **distinct** pending/accepted/changed/stale/applied/conflicted/failed chips, resolve-stale-after-rerun, application-result review. "Accepted" ≠ "Applied" must stay visible.
5. **Clean in-order journey on a NEW case** (the prior publish proof was invalid — form predated apply): import→detect→review→accept canonical→change one match→reclassify one→ignore one→approve one genuine new field→accept guardian/emergency/pickup collections→save+navigate away→reopen (decisions persist)→rerun unchanged (reconcile)→harmless layout variant (moved semantics)→resolve stale→apply→**real new-field creation**→relationship provider bindings→retry (idempotent, no dups)→detailed form bindings→form-only unbound→requirements→classroom-copy output-only→publish→reopen published form→verify bindings+providers+requirements+lineage→**submit a test response with emergency contacts + authorized pickups**→Processing receives collection metadata→commit plan→execute via canonical services→**no duplicate Person/relationship**.
6. **Authenticated Playwright** committed for that journey (screenshots/trace at each major state). Manual browser is supplemental only.
7. **Docs:** update `docs/platform/core/data/relationship-model.md` (configured relationship definitions + native exceptions), `docs/platform/modules/configuration-platform.md` (governed proposal application), `docs/platform/modules/documents-and-forms.md` (already has FP16; add FP17 derivation).

## Gotchas

- `form-draft/save` rebuilds the draft from posted fields — it now preserves `configuration_discovery`, but any new save-path must keep it.
- Apply is idempotent via a proposal-identity ledger in `metadata.configuration_discovery_application`.
- `detectLayoutStructure.ts` uses `as SectionAcc | null` assertions at two read sites — the closure-mutated `state.cur` holder control-flow-narrows to `never` on the current type graph; keep the assertions.
- Re-detect recomputes discovery with fresh proposal ids; decisions rehydrate by **semantic identity** (survives). Don't key UI decisions by proposal id alone across reruns.
- Mint a fresh signed URL for the fixture PDF via `GET /api/admin/documents/0c18f50f-.../signed-url` (10-min TTL).

## Commit trail (this initiative, newest first)

`4eb34b9b3` slice2b relationship command · `3a4f69e2d` slice2 pickup read · `0c0743326` slice1 derivation · `89f5040a4` reconcile tsc fix · `2d6ae4daa`/`a04b599eb`… FP16 M1–M5 (audit, reconciliation, persistence, apply, providers, docs). Native Layout Detection commits precede these.
