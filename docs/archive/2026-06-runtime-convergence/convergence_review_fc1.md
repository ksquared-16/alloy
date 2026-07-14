# Convergence Review — FC-1 (Layout Field Catalog Namespace Alignment)

**Verdict: APPROVED** — *(updated 2026-06-07; the documentation-governance concern is resolved after rebase `2e11a9a7`. Original verdict below was APPROVED WITH CONCERNS @ `cd2f8a54`. See the Re-review addendum at the end.)*
**Reviewed:** `origin/cursor/field-catalog-fc1` @ `cd2f8a54` ("Align layout field catalog to canonical refKey namespaces (FC-1)"), single commit on merge-base `8dd0f2f1`. Net: 10 files, +574/−49. **0 migrations. No lifecycle/readiness/evaluator/runtime/production/seed files touched.**
**Reviewer:** Convergence Review Authority · rubric [`convergence_review_rubric.md`](./convergence_review_rubric.md) · naming [`child_namespace_decision.md`](./child_namespace_decision.md) / [`child_namespace_addendum.md`](./child_namespace_addendum.md).

---

## Task verification points

| Required check | Result | Evidence |
|---|---|---|
| Canonical namespaces enforced | **PASS** | `layoutRefKeyAliases.ts`: `CANONICAL_LAYOUT_REFKEY_NAMESPACES = ["child","inquiry_child","person","opportunity"]`; tests freeze the set and assert `child_inquiry` is **not** canonical (`layoutRefKeyAliases.test.ts:21–26`). |
| `child_inquiry.*` is **alias-on-read only** + **deprecated-on-write** | **PASS** | Read: `normalizeRefKeyOnRead`/`parseLayoutRefKey` map `child_inquiry.* → inquiry_child.*` and record `legacyRefKey`; "stored layout JSON is not rewritten in FC-1." Write: `validateRefKeyForWrite("child_inquiry.*").ok === false`; `builderOps.makeFieldItem` `throw`s `/Deprecated refKey/`; `collectDeprecatedRefKeyWarnings` for doc-level warnings. Tests cover both (`deprecate-on-write` describe block, lines 69–79). |
| No **person == child** assumption becomes permanent | **PASS** | `layoutRefKeyAliases.ts:7–8`: "The `child.*` picker group may temporarily bridge person registry rows — that is **NOT** person == child." Report G2 + decision ND-4: durable `child.*` is **interim** person-bridged; `customer_member` entity_type is the eventual durable home (deferred, not assumed permanent). |
| No lifecycle evaluator/readiness/runtime cutover changes | **PASS** | No such files in the diff. `fc1_registry_completeness_report.md:97`: "Not required for FC-2 planning: lifecycle evaluator changes, drawer runtime cutover, `customer_member` entity_type." |
| `customer_member` allowlist deferral documented | **PASS** | Report G2: "`customer_member` not in `field_definitions` allowlist; durable `child.*` still person-bridged"; decision ND-4 "Defer `customer_member`; interim `person` child-profile rows." |
| Tests cover aliases and write rejection | **PASS** | `layoutRefKeyAliases.test.ts`: alias-on-read (`child_inquiry.*→inquiry_child.*`, `child.participation→inquiry_child.*`, `parseLayoutRefKey` legacyRefKey) **and** write rejection (`validateRefKeyForWrite` false; `makeFieldItem` `toThrow`; warnings). |

---

## Ten gates

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Duplicate systems? | **Concern (docs)** | Code introduces no duplicate system. **However** FC-1 adds its own `docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/child_namespace_decision.md` (+43, ND-1..ND-6) that **differs** from the canonical doctrine version of that same file held by the review authority — two competing "child namespace decision" docs. See Concern 1. |
| 2 | Contract violations? | **No** | RefKey conventions align to the contract; no block/tab/widget/surface change. |
| 3 | Namespace drift? | **No (corrects it)** | Enforces `child.*`/`inquiry_child.*`; deprecates `child_inquiry.*`; reroutes mis-namespaced `child.program/location/room/...` → `inquiry_child.*`. |
| 4 | Runtime divergence? | **No** | Catalog/builder + alias layer only; no runtime read-path or evaluator change. |
| 5 | Child model violations? | **No** | Durable child = `customer_member`/person (interim bridge, explicitly not person==child); OCM = `inquiry_child.*`. Operator label unchanged ("Child"). |
| 6 | Flattening relationships into fields? | **No** | Participation fields are namespaced to `inquiry_child.*` (OCM), not flattened onto durable child. |
| 7 | Production behavior changes? | **No** | Field-catalog/builder + alias module + tests; no production drawer/VM/queue/lifecycle wiring. |
| 8 | Flag safety? | **N/A** | No flags introduced/changed. |
| 9 | Migration safety? | **PASS** | 0 migrations; alias-on-read only; **stored layout JSON not rewritten** (no data change). |
| 10 | Long-term convergence risk? | **Concern** | The interim `person`-bridge for durable `child.*` is documented as temporary — must not calcify; and the duplicate decision doc must be reconciled (Concern 1) so there is one canonical namespace decision. |

---

## Concerns & required follow-ups (conditions of approval)

1. **Reconcile the two `child_namespace_decision.md` documents** (Gate 1 / Gate 10). FC-1 adds a branch-local, FC-1-scoped decision doc that is **consistent in content** but **distinct** from the canonical doctrine version. Before either reaches staging, merge to **one** canonical doc (recommend: the comprehensive doctrine version as the source of truth, with FC-1's ND-1..ND-6 table folded in as the FC-1 decision record) so the platform never carries two competing "child namespace decision" files. *Owner: docs/authority, before FC-1 merges to staging.*
2. **Person-bridge must not calcify** (Gate 10). Durable `child.*` is interim person-bridged. Track `customer_member` (or a person child-profile) as the durable registry `entity_type` so `child.*` stops borrowing person rows; keep the "NOT person == child" guard in code and docs until then. *Owner: field-catalog (FC-2+).*
3. **`child.*` participation keys are deprecated-by-alias.** `child.program/location/room/schedule/status/desired_start_date` are aliased to `inquiry_child.*`; ensure the builder picker only offers genuinely-durable `child.*` keys (e.g. `child.name`, `child.date_of_birth`) as durable options, so authors aren't led to mint participation under `child.*`. *Owner: field-catalog/builder.*

## Notes

- Code quality is high: canonical sets frozen by tests, alias-on-read + deprecate-on-write enforced at both `validateRefKeyForWrite` and `builderOps.makeFieldItem` (throws), the person-bridge explicitly labeled "NOT person == child," deferrals documented in `fc1_registry_completeness_report.md`, and no migration/runtime/lifecycle impact (`stored layout JSON not rewritten`).
- The single substantive concern is **documentation governance** (duplicate decision doc), not implementation — hence **APPROVED WITH CONCERNS**, conditional on follow-up 1 before merge.

*Convergence review of FC-1 @ `cd2f8a54`. Evidence-based; reconcile the duplicate decision doc before staging merge.*

---

# Re-review — Documentation governance patch (2026-06-07)

**Verdict: APPROVED** (supersedes "APPROVED WITH CONCERNS" — the sole concern, Concern 1, is resolved).
**Reviewed:** `origin/cursor/field-catalog-fc1` @ `2e11a9a7`, **rebased onto `d10a6895`** (the canonical reconciliation commit on staging). Scope per task: only the documentation-governance concern.

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | One canonical `child_namespace_decision.md` | **PASS** | The FC-1 branch's `child_namespace_decision.md` is **byte-identical** to `origin/staging`'s canonical (`diff` empty; header "Child Namespace Decision (final, canonical)"), inherited from the merge-base `d10a6895`. |
| 2 | FC-1 no longer introduces a competing decision doc | **PASS** | FC-1's net diff vs `d10a6895` (9 files) **does not touch** `child_namespace_decision.md` (`git diff --name-status` empty for that path). The former 43-line FC-1 ratification doc is gone; its ND-1…ND-8 table now lives **inside** the single canonical doc as §8. |
| 3a | Alias-on-read kept | **PASS** | `layoutRefKeyAliases.ts:5` "alias-on-read only"; `normalizeRefKeyOnRead` / `parseLayoutRefKey` map `child_inquiry.* → inquiry_child.*` (unchanged after rebase). |
| 3b | Deprecate-on-write kept | **PASS** | `layoutRefKeyAliases.ts:5` "reject on write"; `validateRefKeyForWrite` + `builderOps.makeFieldItem` throw; tests retained (`layoutRefKeyAliases.test.ts` +157). |
| 3c | `child_inquiry.*` deprecated | **PASS** | `DEPRECATED_LAYOUT_REFKEY_NAMESPACES = ["child_inquiry"]`; excluded from canonical set. |
| 3d | Temporary person bridge documented | **PASS** | `layoutRefKeyAliases.ts:8` "the child.* picker group may temporarily bridge person registry rows — that is **NOT** person == child"; report `fc1_registry_completeness_report.md` G2 (deferral). |
| 4 | No runtime/lifecycle/drawer cutover added | **PASS** | Net diff (9 files) touches **no** migrations / `AdminEntityDrawer*` / `vmDrawer` / lifecycle / readiness / evaluator / `featureFlag` / seed / `drawerPipeline` / `QueueBlock`. Field-catalog + builder + alias module + tests + completeness report only. |

## Outcome

The only reason FC-1 was "APPROVED WITH CONCERNS" — two competing `child_namespace_decision.md` docs — is **resolved**: there is now exactly one canonical decision doc (on staging and inherited unchanged by FC-1), and FC-1 introduces no rival. The FC-1 **code** was already approved (all six task checks PASS) and is **unchanged** by the rebase (alias-on-read, deprecate-on-write, `child_inquiry.*` deprecated, person-bridge-is-temporary all intact); no runtime/lifecycle/drawer cutover. → **APPROVED.**

## Forward notes (advisory, carried over)

- The **person-bridge for durable `child.*` is interim** — track `customer_member` (or a person child-profile) as the durable registry `entity_type` so the bridge is removed (FC-2+). Guard "NOT person == child" stays until then.
- Builder picker should offer only genuinely-durable `child.*` keys (e.g. `child.name`) as durable options; participation `child.*` keys are deprecated-by-alias.

*Re-review of FC-1 doc-governance patch `2e11a9a7` on `origin/cursor/field-catalog-fc1`. Evidence-based; concern cleared.*
