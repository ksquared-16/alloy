---
owner: platform
status: ratified
last_reviewed: 2026-07-19
---

# Runtime V1 — Known Limitations

This is **not a backlog and not a bug list.** It is the intentional record of Runtime V1's boundaries —
the things V1 deliberately does not do, recorded so future engineers understand they are *decisions*,
not defects. A limitation here is a place where **future product pressure** — not speculation — may one
day justify Runtime V2. Do not "fix" these to fix them.

## 1. New Focus Panel card *types* require registration (not zero-code)

Re-composing the **existing** card types — different order, placement, span, visibility, which cards,
a different published Summary composition — is honored today with zero engineering (live-proven). A
genuinely **new card key** the runtime has never seen is not zero-code: three closed sets stop it — the
key allowlist (`FOCUS_PANEL_CARD_KEYS`), the per-key model producer (`buildCardModels`), and the closed
`FocusPanelCardKey` union. Adding a new card type is a bounded, scoped change (the 5-step plan in the
Scalability Certification), not an architecture reopening. **This is a V1 boundary by design:** V1
proved config-driven *composition*; config-driven *new card types* is a V2 pressure point.

## 2. Operational workspaces share the warm-first *data* lifecycle, not the *commit* lifecycle

Processing, Work Items, Operational Intelligence, and Inbox are **warm-first Runtime consumers**: they
warm the exact data on nav intent, serve warm-first, dedupe to one request per scope, and open with no
visible load. They are **not** yet full K1→K2→K3 *commit* consumers — they remain `openWorkspaceModal`
modals rather than committed destinations. Promoting a modal open to a runtime commit is a natural V2
extension, now that the data lifecycle is unified under `createWarmCache`.

## 3. Three bespoke warm caches were intentionally not folded onto `createWarmCache`

`oipWorkspaceWarmCache` (fuzzy site-key fallback), `communicationsWorkspaceWarmCache` (multi-dataset
orchestrator), and `drawerFamilyWorkspacePrefetchCache` (prefix invalidation + in-flight exposure) are
legitimately *different shapes*. Forcing them onto the single-cache primitive would be speculative
abstraction-stretching. They stay bespoke until a real need proves the primitive should grow.

## 4. Inbox paints warm but still revalidates on reopen

The Inbox's two loops are fixed and its content paints warm on reopen, but ~18–25 comms datasets still
revalidate in the background (not a visible load). Driving it to literal zero-fetch reopen is a
comms-workspace warm-first pass — deferred; content is already warm.

## 5. Flag-gated legacy communications code remains behind a soft default

`CommunicationsDrawerSectionLegacy` (~1090 lines) and the deprecated `/adminV2/communications` route sit
behind `comms_v2_*` flags that are default-ON but still honor an explicit `NEXT_PUBLIC_COMMS_V2_*=false`.
Deleting them is a **product decision** to make the flags permanent, then a mechanical removal — not a
runtime architecture change.

## 6. One superseded-but-wired settlement fetch remains

The late right-rail settlement fetch in `useWorkUnitSettlement.ts` is redundant with the answer's
`actionsProjection` but still executes and feeds the region status. Removing it is a scoped V1.1
refactor (null `rightRailTarget`, remove the effect + merge, verify value-identity) — not a freeze-safe
blind delete.

## 7. Runtime Test-Suite modernization is separate engineering work

See [`runtime-test-hygiene-initiative.md`](./runtime-test-hygiene-initiative.md). The runtime test
suites carry historical debt (architecture-cutover assertions that encode superseded behavior, brittle
source-grep tests, cross-file module-cache contamination). This is **independent** of Runtime V1
architecture and must not reopen Runtime implementation to solve.

---

## Expected Runtime V2 pressure from future products

These are where future product work will *naturally* expose whether V2 is ever necessary. Do not build
for them now:

| Future product | Where it will pressure Runtime |
|---|---|
| **Scheduling / Attendance** | time-windowed, high-frequency destinations → warm-cache staleness windows; the per-lens Row Grain constraint (already surfaced as the Active-Pipeline grain-ambiguous config error) |
| **Commercial / Programs** | non-enrollment business processes → the "Runtime contains no product-specific behavior" claim; the archetype/registry generalization |
| **Director / cross-org** | multi-scope attention → destination identity; the pill-vs-tile host-identity product question |
| **Any product with a NEW card type** | the first real exercise of limitation #1 — the natural trigger to open Runtime V2's archetype-driven renderer |

**These are intentional Version 1 boundaries. They are not Runtime defects.**
