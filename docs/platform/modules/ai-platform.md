# AI platform

**Status:** Canonical platform module doc.

BOS (Business Orchestration System) — assistive, human-in-the-loop intelligence layer.

---

## Maturity

| Capability | Status |
|------------|--------|
| Orchestrator command bar | Complete |
| Task Assist (comms drafts) | Complete |
| Workflow Assist | Complete (narrow) |
| Needs-attention enrich | Complete (gated) |
| Config/Layout Assist foundation | Complete (partial apply) |
| Autonomous agents | **Future — explicitly paused** |

---

## Rules (frozen)

- BOS is **not** a parallel platform — routes through existing records, permissions, audit
- **Propose → human approve → apply** — no autonomous side effects
- Org `ai_policy` + RBAC permission keys gate features
- Visual identity frozen: `../../system/bos-identity-doctrine.md`

---

## Action execution path

**BOS suggests/proposes; the user confirms; the server executes.** When BOS applies a
registered action, it uses the same `POST /api/admin/actions/execute` route as manual UI
(`runRegisteredAction` → validate → eligibility gate → invariant-owning mutation). BOS
never invents executable behavior or mutates directly: it can only invoke *registered*
action keys, and the server remains authoritative for validation, eligibility, required
inputs, mutation, audit, and result. Reference implementation: `create_lead` (dedicated
BOS rail apply UI is follow-up). See `actions-and-workflows.md` § Action Runtime contract.

---

## Capabilities registry

`web/lib/bos/bosCapabilityRegistry.ts` — stable `capability_key` entries.

---

## Related

- `../../product/bos-foundation.md` (transitional expanded reference)
- `../foundation/product-roadmap.md` (Paused section)
