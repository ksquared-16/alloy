# Conversation Platform — Health Report

**As of 2026-07-31, post-Phase-0.**

Scores are 1–10. They describe the **communications surface**, not all of Alloy.

---

## Overall readiness: **6.5 / 10 — ready to build on, not ready to ship**

The floor is safe and the map is accurate. The platform itself is barely started,
and three structural duplications remain.

---

## Scores

| Dimension | Score | Direction |
| --- | --- | --- |
| **Security** | 8.5 | ▲▲ from ~3 |
| **Migration state** | 8.0 | ▲ (local); ⛔ blocked for promotion |
| **Documentation** | 8.5 | ▲▲ |
| **Testing** | 6.5 | ▲ |
| **Architecture coherence** | 6.0 | ▲ |
| **Runtime convergence** | 4.5 | ▲ slightly |
| **Code duplication** | 4.0 | — unchanged |
| **Feature completeness** | 1.5 | — unchanged |

---

## Security — 8.5

**Strong, and the strongest thing about the platform right now.**

Eliminated: unauthenticated card charging; two unauthenticated SMS routes; an
unauthenticated SMS oracle; home-access disclosure over text; a brute-forceable
5-digit acceptance code; seven-day credentials on children's photographs;
credential persistence into shared metadata; path-guessable document signing.

Confirmed sound and left alone: storage is fail-closed already (private bucket,
RLS enabled with zero policies), so no redesign was warranted.

**Why not higher.** Two reasons, both honest:
- Enforcement is universal at the choke point but **four send paths bypass it**.
- The legacy dispatch guard is process-local, so its protections are
  single-instance only. Adequate for a dormant route; not for a live one.

**The finding that keeps this from being a 9:** a route passed commit review,
called the authorization helper correctly, returned errors to unauthorized
callers — and still handed authorized callers a week-long credential minted
before the check. If one existed, others may. The mitigation is inventories plus
test-pinning, both now in place.

## Migration state — 8.0 locally, blocked for promotion

Four additive migrations, certified in three modes: clean replay of all 301 from
scratch, upgrade replay, idempotent rerun. Schema and CHECK constraints verified
against D3 in the resulting database. No drops, no destructive backfills, no
one-way doors.

**⛔ The blocker is not ours.** Staging carries a 28-migration Processing-Identity
backlog with `db push` blocked by three orphan ledger versions. Nothing here
promotes until that clears.

## Documentation — 8.5

This package: executive summary, runtime architecture, convergence matrix, debt
register, retirement ledger, readiness report, Phase 1 plan, health report, and
lifecycle map. Plus seven discovery findings files with `file:line` citations, a
decision packet, and phase contracts.

**Why not higher.** Documentation this fresh is accurate; the question is whether
it stays so. The retirement ledger and debt register are the parts most likely to
rot, because they must be *updated* rather than merely read. Phase 1's exit
criteria require updating them, which is the mitigation.

## Testing — 6.5

**Good:** ~180 new behavioral tests across TS and Python. Cross-runtime parity
tests driving real functions through a contract table. A DB-backed and
route-level harness. Critically, the convergence claims most likely to rot are
now **pinned by tests rather than asserted in review** — a direct response to
A-5.

**Bad:** 25 pre-existing web failures across 13 files, all source-shape
`readFileSync` assertions, at least one a verified false positive. The backend
suite has 2 environment errors (`pytest`, `twilio` absent). A permanently red
suite trains people to ignore red — the single biggest testing risk here.

**Also:** no end-to-end test exercises enqueue → dispatch → receipt across both
runtimes. Each side is tested; the seam is not.

## Architecture coherence — 6.0

**Good.** The conceptual model is now sound and written down: classification as
an authoring fact, eligibility as two layers, a data contract as the cross-runtime
seam, provenance-not-shape as the trust rule. These were discovered, not assumed,
and they are the durable output of Phase 0.

**Bad.** The implementation only partly reflects the model. There is no
Conversation entity — Thread stands in for it. Three surfaces compose messages
three ways. The preview endpoint renders differently from the send path.

The gap between "coherent model" and "coherent code" is exactly Phases 1–3.

## Runtime convergence — 4.5

| Capability | Converged? |
| --- | --- |
| Enqueue gate | 10 / 14 paths |
| Dispatch worker | ✅ single |
| Renderer (send) | ✅ single |
| Renderer (preview) | ❌ separate engine |
| Composer | ❌ 3 surfaces |
| Thread loading | ❌ 3 paths, 3 caches |
| Document authorization | ✅ single |
| Provider adapters | ✅ registry (plus the contained legacy GHL path) |
| Eligibility | ✅ 2 deliberate layers |

**Legacy GHL dispatch writes no message row at all**, so it is structurally
invisible to every row-level gate. It is contained, not converged, and
decommissioning is recommended.

## Code duplication — 4.0

Unchanged by Phase 0, which was a safety track and deliberately did not
consolidate. Ranked by risk:

1. Four send paths bypassing the gate — *correctness* risk
2. Preview vs send renderer — *trust* risk
3. Three composer surfaces — *maintenance* risk
4. Three thread-loading paths + three caches — *consistency* risk

## Feature completeness — 1.5

Of thirteen workstreams: eleven at 0%, Preferences ~30% (STOP/START/HELP
delivered; eligibility foundation-only), Template Platform ~20% (send-path
renderer only).

**Program: ~4%.** Phase 0 was security work. It should not be read as platform
progress, and this report does not read it that way.

---

## Outstanding risks

| # | Risk | Severity | Owner |
| --- | --- | --- | --- |
| 1 | Four send paths bypass eligibility | **High** once real opt-outs exist | Phase 1 |
| 2 | Staging migration backlog blocks all promotion | **High** | outside this initiative |
| 3 | Another "correct-looking but wrong" gate exists | **Medium** | inventories + test-pinning |
| 4 | Scheduled sends have no lease → double-send | Medium at >1 worker | Phase 2 |
| 5 | Preview ≠ send rendering | Medium | Phase 3 |
| 6 | 25 red tests normalize a red suite | Medium | unowned — **needs a decision** |
| 7 | Legacy vertical revived without re-engineering | Low, high impact | decommission decision |
| 8 | Dev script dispatches to a real address | Low | unowned |

---

## Verdict

**Build on it. Do not ship it yet.**

Phase 0 did what it was scoped to do and stopped where it was told to. The result
is a platform whose *foundation* is in good shape (security 8.5, migrations 8.0,
documentation 8.5) and whose *body* is barely begun (features 1.5, convergence
4.5).

That is the correct shape for entering Phase 1. The failure mode to avoid is
reading the strong foundation scores as platform readiness — which is exactly why
the closeout separates Delivered from Foundation-only.

**Single highest-value next action:** converge the four remaining send paths.
Until that lands, every eligibility claim in this document carries an asterisk.
