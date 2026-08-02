---
owner: platform
status: proposed
last_reviewed: 2026-08-01
supersedes: []
---

# Trust Platform

**Status:** Initial Trust Platform corpus published (August 2026). GPT is the platform architect; this tree is the canonical home for Trust Platform doctrine.

**Amended 2026-08-02 — architecture-owner ratification.** Four conflicts found during Trust Runtime V1 implementation assessment were resolved by the architecture owner and encoded as [`Decisions 019–022`](./trust-platform-decisions.md), with Decision 014 amended: the Reasoning Boundary and its test, Decision Package immutability and lineage, the canonical V1 runtime order, and single ownership of validation, trust evaluation and execution. Amended documents: `trust-platform.md`, `trust-philosophy.md`, `trust-platform-manifesto.md`, `trust-runtime.md`, `reasoning-runtime.md`, `privacy-runtime.md`, `decision-contract.md`, `decision-package.md`, `knowledge-platform.md`, `trust-governance.md`, `platform-integration.md`, `trust-platform-decisions.md`.

**Front door:** [`trust-platform.md`](./trust-platform.md).

**Role of this folder:** Repository placement, frontmatter, cross-references, formatting, and publication index — **not** architectural design. Published bodies are assumed canonical as received from GPT.

**Related (existing platform doctrine):**

- [`../foundation/alloy-platform-handbook.md`](../foundation/alloy-platform-handbook.md) — teach-the-platform map
- [`../foundation/platform-capabilities.md`](../foundation/platform-capabilities.md) — capability inventory
- [`../foundation/platform-decisions.md`](../foundation/platform-decisions.md) — durable cross-platform decisions
- [`../modules/ai-platform.md`](../modules/ai-platform.md) — BOS / assistive intelligence (adjacent; not a substitute for Trust Platform)

---

## Publication index

Track each Trust Platform document as it lands. Update this table when a document is published or advanced.

| Document | Path | Status | Published |
|----------|------|--------|-----------|
| Trust Philosophy | [`trust-philosophy.md`](./trust-philosophy.md) | published (canonical) | 2026-08-01 |
| Trust Platform Manifesto | [`trust-platform-manifesto.md`](./trust-platform-manifesto.md) | published (canonical) | 2026-08-01 |
| Trust Platform | [`trust-platform.md`](./trust-platform.md) | published (canonical) | 2026-08-01 |
| Trust Runtime | [`trust-runtime.md`](./trust-runtime.md) | published (canonical) | 2026-08-01 |
| Decision Contract | [`decision-contract.md`](./decision-contract.md) | published (canonical) | 2026-08-01 |
| Decision Package | [`decision-package.md`](./decision-package.md) | published (canonical) | 2026-08-01 |
| Knowledge Platform | [`knowledge-platform.md`](./knowledge-platform.md) | published (canonical) | 2026-08-01 |
| Information Classification | [`information-classification.md`](./information-classification.md) | published (canonical) | 2026-08-01 |
| Privacy Runtime | [`privacy-runtime.md`](./privacy-runtime.md) | published (canonical) | 2026-08-01 |
| Reasoning Runtime | [`reasoning-runtime.md`](./reasoning-runtime.md) | published (canonical) | 2026-08-01 |
| Operational Learning | [`operational-learning.md`](./operational-learning.md) | published (canonical) | 2026-08-01 |
| Trust Governance | [`trust-governance.md`](./trust-governance.md) | published (canonical) | 2026-08-01 |
| Trust Economics | [`trust-economics.md`](./trust-economics.md) | published (canonical) | 2026-08-01 |
| Platform Integration | [`platform-integration.md`](./platform-integration.md) | published (canonical) | 2026-08-01 |
| Trust Platform Decisions | [`trust-platform-decisions.md`](./trust-platform-decisions.md) | published (canonical) | 2026-08-01 |

**Status vocabulary for this index**

| Index status | Meaning |
|--------------|---------|
| `stub — awaiting GPT` | File exists; body not yet published |
| `published` | GPT canonical body committed; frontmatter/links wired |
| `canonical` | Promoted to current platform truth after review gates |

---

## Intended corpus (directory map)

```text
docs/platform/trust/
  README.md                         ← this index
  trust-philosophy.md
  trust-platform-manifesto.md
  trust-platform.md
  trust-runtime.md
  decision-contract.md
  decision-package.md
  knowledge-platform.md
  information-classification.md
  privacy-runtime.md
  reasoning-runtime.md
  operational-learning.md
  trust-governance.md
  trust-economics.md
  platform-integration.md
  trust-platform-decisions.md
```

---

## Publication rules (editor / publisher)

1. Do **not** redesign or reinterpret GPT architecture.
2. Place each document under `docs/platform/trust/` with frontmatter consistent with other platform docs.
3. Match Alloy documentation style (structure, diagrams, link form).
4. Preserve forward references exactly; use TODO links when targets do not yet exist.
5. Wire handbook / capabilities / platform-decisions only when instructed or when the published doc requires it.
6. Run `npm run docs:lint` (and `docs:lint:ci` when changing governed files) after each publish.
7. Commit **documentation only**.
8. Update this publication index after every document.
9. Wait for the next GPT document before inventing further content.
