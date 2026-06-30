# Design and operational doctrine

**Status:** Canonical index for cross-cutting operational rules.

---

## Documentation doctrine

- Active docs describe **today's behavior** — update with code in same PR
- Canonical platform docs live under `docs/platform/` and `docs/schema/`
- Sprint docs are execution history — not doctrine when platform doc exists
- Do not duplicate frozen topics — link instead

Full rules: `../../execution/operating-doctrine.md`

---

## Performance doctrine (locked)

AdminV2 reveal gates, queue empty semantics, composed payload readiness — **protected infrastructure**.

- `../../system/adminv2-runtime-performance-doctrine.md` — locked gates
- `../../system/platform-performance-doctrine.md` — passes and principles

**Do not weaken** during ordinary UI work.

---

## Experience doctrine (canonical)

The platform Human Interface Guidelines. Every operator-facing feature conforms.

- **Operational Experience Doctrine** (the Five Laws): `../experience/operational-experience-doctrine.md`
- **Operational Motion Doctrine** (one motion language): `../experience/operational-motion-doctrine.md`
- **Premium Interaction Principles** (field manual): `../experience/premium-interaction-principles.md`

These **generalize** the locked performance doctrine below: the AdminV2 reveal gates are the Experience Doctrine's first implementation. Where the Experience Doctrine asks for more than the locked docs currently enforce (universal soft navigation, KPI in-gate, universal dirty-guard, cross-surface optimism, a motion language), those deltas are tracked in `../../sprints/06_2026/premium-operational-experience/sprint-roadmap.md` and must update the locked docs in the same change that implements them.

## Presentation doctrine

- Typography: `../../system/typography-and-presentation-doctrine.md`
- Motion (timing/easing/choreography): `../experience/operational-motion-doctrine.md`
- BOS identity: `../../system/bos-identity-doctrine.md`
- Queue record rows: `../../system/queue-record-doctrine.md`

---

## Configuration doctrine

- Config steers, code owns invariants
- Four-plane settings model
- Ownership: `../../system/configuration-ownership-doctrine.md`

---

## Deployment guardrails

- Staging parity before production behavior claims
- No service role in client
- Migrations reviewed before apply

See `deployment-and-environments.md`.

---

## Contradiction handling

If code must change doctrine, update docs in same change and note in roadmap until follow-up completes.

---

## Doctrine freeze policy (June 2026)

Document **decisions**, not debates. Frozen areas:

- Operator hierarchy: Business Process → Stage → Record
- Navigation spine (not dept-first)
- Queue preview boundary
- BOS human-in-the-loop
- AdminV2 reveal gates

Open areas stay in roadmap until frozen — then merge into platform docs.
