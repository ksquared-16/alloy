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

## Interaction doctrine

- Canonical interaction model (primitives): `../operator/canonical-interaction-model.md`
- Interaction grammar (laws): `../operator/interaction-grammar.md`
- Operator story (lived flow): `../operator/operator-story.md`
- Alloy visual language (look/feel; bridge into mockups): `../operator/alloy-visual-language.md`
- Alloy Runtime Specification (synthesis; read before building any domain): `../operator/alloy-runtime-specification.md`
- Cross-cutting operational UX (planes/domains): `../operational-ux-doctrine.md`

---

## Presentation doctrine

- Typography: `../../system/typography-and-presentation-doctrine.md`
- BOS identity: `../../system/bos-identity-doctrine.md`
- Queue record rows: `../../system/queue-record-doctrine.md`
- **Alloy Operational Workspace Doctrine V2** (operational module modals): `../core/navigation-and-workspace-doctrine.md` — **frozen** (July 2026); inset stone field, universal `WorkspaceMetricTiles`, certified Processing / Communications / Work Items; components: `web/components/workspace/doctrine.ts`

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
- **Alloy Operational Workspace Doctrine V2** (operational module modal presentation — frozen July 2026)

Open areas stay in roadmap until frozen — then merge into platform docs.

---

## Work Items projection authority (July 2026)

Work Items is the cross-record **execution visibility** layer — not a second workflow engine and not a replacement for domain systems of record.

| Rule | Detail |
|------|--------|
| Domain authority | Processing, Communications, and Business Process runtimes own actionable state. |
| Virtual projections | May appear in Work Items without creating `operational_tasks`. |
| Manual creation | One canonical WorkItemDraftV1 runtime; explicit operator commit; BOS proposes, operator commits. |
| Refresh | `dispatchOperationalWorkRefresh` coordinates recomputation after authoritative domain mutations. |
| Deferred | Work Item conversation persistence, full activity history, additional domain lanes — see product roadmap. |

