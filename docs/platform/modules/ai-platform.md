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

## Capabilities registry

`web/lib/bos/bosCapabilityRegistry.ts` — stable `capability_key` entries.

---

## Related

- `../../product/bos-foundation.md` (transitional expanded reference)
- `../foundation/product-roadmap.md` (Paused section)
