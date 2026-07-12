# Premium Operational Experience — Sprint Roadmap

**Path:** `docs/sprints/archive/06_2026/premium-operational-experience/sprint-roadmap.md`
**Status:** Roadmap (June 2026). Sequencing for closing the [Experience Audit](./experience-audit.md) under the two new doctrines.
**Ranked by:** operator impact × foundational value, balanced against implementation effort and architectural risk.

---

## How this is sequenced

The audit's sixteen issues collapse into **four tracks**, each closing one of the Experience Doctrine's laws. The tracks are ordered so that:

- **Foundational unlocks come first** — but only when their risk is contained by a fallback.
- **Cheap, high-trust wins are pulled early** regardless of track, because they cost little and stop active harm (silent data loss, stale-row distrust).
- **The motion language lands before its dependents**, because half its roadmap items become *Small* once tokens exist.

The result is not strict track order. It is: **stop the bleeding → build the language → enforce the law → land the keystone.**

---

## Scoring legend

- **Impact** (operator): 1–5. **Effort**: S/M/L. **Risk** (architectural): Low/Med/High. **Foundational**: does it unlock other work?

---

## Phase 0 — Stop the bleeding (week 1, low risk, high trust)

Pull these forward out of track order. Each is Small, each stops an active illusion break or trust failure, none requires the big architectural moves.

| Item | Issue | Impact | Effort | Risk | What ships |
|------|-------|:------:|:------:|------|-----------|
| Universal dirty-guard | DRW-3 | 4 | **S** | Low | Lift the Person-drawer unsaved-changes guard into the save coordinator as a platform invariant; every dirty surface blocks close/back with the same affordance. **Stops silent loss of typed edits.** |
| Enforce KPI in the reveal gate ✅ **DONE** | WS-1 | 3 | **S** | Low | **Shipped.** Workspace: replaced the hardcoded `workspaceRevealKpiRegionReady() => true` bypass with real KPI structural readiness (quick-rollup / empty / cached / error), routed into `computeWorkspaceRevealGate`. Work-unit: verified already-correct (`kpi_ready` via `workUnitRevealKpiReady` already gates `above_fold_ready`); locked with tests. Slow per-dept growth values intentionally settle after reveal (not blocked). **Stops the workspace looking half-built.** Tests: `tests/adminV2/kpiRevealGating.test.ts`. |
| Suppress outbound skeleton ⚠️ **PARTIAL** | WU-1 | 4 | **S** | Low | **Shipped (scoped).** `WorkUnitSlugRouteHost` now holds instead of flashing its cold shell once `usePathname()` has left this work unit (`isLeavingWorkUnitSurface` guard) — closes the soft-transition window where "Loading work unit" could paint at a Workspace/dept URL. Arrival loading unchanged. Tests: `web/tests/admin/workUnitOutboundHold.test.ts`. **Honest residual:** the dominant leave path is still a full-document reload (`adminV2CommitNavigation` → `window.location.assign`), whose document-swap flash is owned by **Track 1 (persistent runtime)** and explicitly out of scope here. |

**Exit criteria:** No surface shows a loading state while leaving. No editable surface discards typed work. KPI is inside the reveal gate (or its deferral is a documented, motion-governed exception).

**Note on WS-1 scope correction (discovered during build):** the audit's claim that work-unit "never checks `kpi_ready`" was inaccurate — `computeWorkUnitRevealGate` already consumes it (line 119) and the page already feeds real state. The *only* hardcoded bypass was the workspace `kpi_region_ready` helper. Also, workspace KPI *values* derive from `loadWorkspaceGrowthRollup` (2×N per-department network); blocking reveal on them would hang the surface, so the gate now waits on KPI **structure** (cheap, synchronous) while values settle post-reveal into reserved geometry per the Motion Doctrine. The imperceptible-`settle` motion for those values is the paired Motion-adoption follow-up (MOT-2, Phase 2).

---

## Phase 1 — Build the motion language (weeks 1–2, Track 3)

Land before its dependents — DRW-1, DRW-2, and MOT-2 are each *Small* once tokens exist, and every other track's motion draws from here.

| Item | Issue | Impact | Effort | Risk | What ships |
|------|-------|:------:|:------:|------|-----------|
| Motion tokens | MOT-1 | 3 | **M** | Low | `web/lib/motion/motionTokens.ts`: 4 durations, 4 easings, 5 choreography presets (mirrors `presentationTypography.ts`). |
| Migrate CSS onto tokens | MOT-1 | 3 | **M** | Low | Collapse 50+ durations → 4 and 3 easings → the named palette across the four CSS files. Lint for raw values. |
| `settle` for deferred values | MOT-2 | 2 | **S** | Low | Sub-threshold ramp into reserved geometry; applied to KPI deferral exception and all post-reveal refinement. |
| Drawer `recede` (close) | DRW-1 | 3 | **S** | Low | Engineer the exit window (reuse phase machine); symmetric close choreography; sidebar drawers get an entrance. |
| Drawer `swap` crossfade | DRW-2 | 3 | **S** | Med | Motion phase on the swap machine; atomic header+body commit; no stale flash. |

**Exit criteria:** Zero raw durations/easings in components. Drawers open and close symmetrically. Record swaps crossfade with atomic identity. Deferred values settle below the eye's threshold. Motion is a code-review checklist item.

---

## Phase 2 — Enforce the reveal & truth law (weeks 2–3, Track 2)

Make the atomic-reveal law universal and make optimism cross surface seams.

| Item | Issue | Impact | Effort | Risk | What ships |
|------|-------|:------:|:------:|------|-----------|
| One workspace readiness object | WS-2 | 3 | **M** | Med | All above-fold regions (summaries, health, KPI, actions) feed one gate; no region resolves on its own clock. |
| Cross-surface optimistic propagation | CARD-2 | 3 | **M** | Med | Save coordinator publishes patches to a shared record-patch channel; sibling surfaces subscribe. |
| Optimistic carry-through + silent revalidate on queue return | WU-2 | 4 | **M** | Med | Drawer patches carry to the queue cache on close; lane revalidates silently. **Stops the stale-row trust break.** Depends on CARD-2. |

**Exit criteria:** The workspace reveals as one frame, every region included. An edit made anywhere is correct on every surface showing the record, at the first frame.

---

## Phase 3 — The editing law (weeks 3–4, Track 4)

Resolve the two-pattern fork into one safe editing model.

| Item | Issue | Impact | Effort | Risk | What ships |
|------|-------|:------:|:------:|------|-----------|
| Editable Card Interaction Doctrine (adopt) | CARD-1 | 3 | **M** | Med | Lock inline + optimistic + coordinated-save + one `acknowledge` + universal dirty-guard + legible rollback (codified in Experience Doctrine §Law 5). One save-acknowledgement primitive. |
| Migrate legacy editable pattern | CARD-1 | 3 | **M** | Med | Move `EditablePersonContactCard` (Pattern B) onto `LayoutRuntimeDrawerEditProvider` (Pattern A); delete the fork. |

**Exit criteria:** Editing any field on any card or drawer feels identical and feels safe. One editing model, one acknowledgement, one guard.

---

## Phase 4 — The keystone: persistent runtime (weeks 4–7, Track 1)

The highest-impact, highest-risk work. Done last so the surfaces it carries are already premium, and done deliberately with a fallback so it cannot regress reliability. **NAV-1 is the single most valuable change in the product; it is also the one most able to break it.**

| Item | Issue | Impact | Effort | Risk | What ships |
|------|-------|:------:|:------:|------|-----------|
| Work-unit soft-nav resilience | NAV-1 (dep) | — | **L** | High | Move slug resolution + critical bootstrap to a route handler / RSC boundary (or nav-blocking warm step) so `router.push` cannot land on a computing page — removing the *reason* the full reload exists. |
| Navigation-surviving cache tier | NAV-2 | 4 | **L** | Med | sessionStorage-backed VM/bootstrap snapshots under existing TTL contracts; soft nav stays warm; hard reload rehydrates last surface pre-network. |
| Soft `navigate` for surface nav (flagged) | NAV-1, WU-3 | 5 | **L** | High | Replace `window.location.assign()` with intercepted soft navigation behind a flag, gated on resilience; full-reload kept as instrumented automatic fallback. |
| Persist drawer stack | DRW-4 | 2 | **M** | Low | Serialize stack to the surviving store / URL; rehydrate on mount. Rides NAV-2. |
| Retire cold-open overlay on warm paths | DRW-5 | 2 | **S** | Low | NAV-2 warmth means recently-seen records skip the overlay; broaden row-intent prefetch coverage. |

**Exit criteria:** Operator navigation never reloads. The shell genuinely persists. Recently-seen surfaces and records are warm. Scroll/focus/motion state survives navigation. Cancelled-navigation rate stays at or below the full-reload baseline (instrumented). One physics for all navigation.

---

## Sequencing rationale (why not strict track order?)

- **Phase 0 before everything:** DRW-3 (silent data loss) and WS-1 (half-built look) are active harm at near-zero cost and risk. Shipping them first buys trust and momentum.
- **Motion (Track 3) before Reveal/Editing:** DRW-1, DRW-2, MOT-2 collapse from Medium to Small once tokens exist; and the `acknowledge` primitive that the Editing law needs is a motion artifact. Build the language, then everything that moves is cheaper.
- **Reveal/Truth (Track 2) before Editing (Track 4):** WU-2's stale-row fix needs CARD-2's cross-surface channel, which is the same mechanism the editing law relies on. Build the propagation spine, then lock the editing model on top of it.
- **Persistent Runtime (Track 1) last:** it is the keystone, but the surfaces it carries should already be premium so the payoff is maximal and the blast radius is understood. It is the one track that can degrade reliability, so it ships behind a flag with a fallback, after the cheaper wins have already moved the experience.

---

## Risk register

| Risk | Track | Mitigation |
|------|-------|-----------|
| Soft nav reintroduces cancelled-navigation dead UI (the original reason for full reload) | 1 | Resilience work lands *first*; soft nav is flagged; full reload remains an automatic, instrumented fallback; watch cancelled-nav rate. |
| Cross-surface optimistic propagation desyncs surfaces on partial failure | 2 | Reuse the proven per-section rollback; propagation carries the same rollback; revalidation is the reconciler of record. |
| Token migration regresses a bespoke animation someone relied on | 3 | Inventory before migrate; the four-speed/four-curve set was chosen to cover the existing range; expressive/ambient classes preserve the few intentional outliers. |
| Editing migration changes save semantics for a live drawer | 4 | Pattern A is already production-proven; migrate behind parity tests; the legacy pattern's pessimism becomes optimism — a strict UX improvement, not a contract change. |
| Doctrine deltas drift from the locked performance docs | all | Per documentation governance, any change that strengthens a law updates `platform-performance-doctrine.md` / `adminv2-runtime-performance-doctrine.md` in the same PR. |

---

## Definition of done (sprint)

The sprint is complete when an operator working a full shift cannot point to a single moment where they noticed the software — verified against the [Moments of Broken Illusion](./moments-of-broken-illusion.md) list reaching zero open entries, and the Experience Doctrine's conformance checklist passing on every operator surface.

The software disappears. The work remains.
