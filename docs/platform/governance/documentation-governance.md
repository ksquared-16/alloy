---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Documentation governance

**Status:** Canonical rules for maintaining the doc system (June 2026 rebaseline; metadata contract July 2026).

---

## Machine-readable metadata contract

Every **governed** document carries YAML frontmatter validated by `scripts/docs-lint.mjs`.

### Required shape

```yaml
---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
superseded_by:
---
```

| Field | Required | Meaning |
|-------|----------|---------|
| `owner` | Yes | Concept owner (`platform`, `operator`, `modules`, `sprint`, etc.) |
| `status` | Yes | Authority class (vocabulary below) |
| `last_reviewed` | Yes | ISO date of last doctrine review |
| `supersedes` | Optional | Paths or doc ids this doc replaces |
| `superseded_by` | **Required when `status: superseded`** | Successor path or doc id |

Optional fields (`concept`, `layer`) may be added when the lint system enforces them reliably. Wave 1 uses `concept` only on sprint execution artifacts.

### Status vocabulary

| Status | Meaning |
|--------|---------|
| `canonical` | Current platform truth |
| `frozen` | Approved doctrine or architecture locked at a point in time |
| `proposed` | Approved for consideration; not current truth |
| `generated` | Machine-produced; do not hand-edit |
| `sprint` | Implementation or execution artifact |
| `historical` | Preserved context; not current truth |
| `superseded` | Replaced; must identify successor via `superseded_by` |

### Lifecycle

```
proposed → canonical / frozen → superseded → historical / archive
```

Generated references (`docs/schema/`, `docs/api/`) use `status: generated` and must name their generator in the document body.

---

## Placement rules

1. **One canonical owner per concept** — no duplicate doctrine for the same topic.
2. **No new markdown files at `docs/` root** — only `docs/README.md` is permitted.
3. **No sprint artifacts inside `docs/platform/`** — execution history lives under `docs/sprints/`.
4. **No duplicated canonical doctrine** — merge or archive duplicates; banner survivors.
5. **Canonical docs must not depend on sprint files as current truth** — sprint links are historical references only; docs-lint reports violations.
6. **Generated files must name generator and source** — see schema/API regen commands below.
7. **Doctrine-changing product PRs must update the owning canonical document** in the same PR.
8. **Sprint closeout documents do not become doctrine by declaration alone** — summarize into `release-history.md` and archive sprint detail.

### Governed paths (Wave 1)

- `docs/README.md`
- `docs/platform/**`
- `docs/sprints/active/documentation-rebaseline-v2/**`

Remaining repository docs are **baselined** for metadata adoption in later waves.

---

## Structure

| Layer | Location | Purpose |
|-------|----------|---------|
| **Schema** | `docs/schema/` | Generated from Supabase CSV exports |
| **Platform** | `docs/platform/` | Canonical platform doctrine and modules |
| **System** | `docs/system/` | Locked runtime implementation detail (authoritative) |
| **Sprints** | `docs/sprints/` | Execution history — not primary doctrine |
| **Audits** | `docs/audits/` | Point-in-time investigations and planning artifacts |
| **Archive** | `docs/archive/` | Superseded material — not current truth |
| **Export packs** | `docs/archive/2026-06-handoff-packs/` | Portable handoff bundles (scheduled for retirement) |

Navigation hub: `docs/README.md`

---

## Validation

```bash
npm run docs:lint              # full report
npm run docs:lint:ci           # narrow blocking on changed files
cd web && npm run test -- tests/scripts/docsLint.test.ts
```

CI: `.github/workflows/docs-lint.yml` — report-only debt with **narrow blocking** on changed governed files (broken canonical links, invalid root placement, malformed frontmatter).

Pre-existing debt is baselined in `scripts/docs-lint-baseline.json`.

---

## Canonical vs supplemental

**Canonical (industry-agnostic):**

- Business processes, records, entities, communications, documents, actions, configuration

**Supplemental (industry examples):**

- Enrollment-specific CRM detail (`docs/product/crm-system.md`)
- Childcare waitlist/tour sprint artifacts
- Export handoff packs

Primary doc set stays industry-agnostic; vertical implementations link as supplements.

---

## Update rules

1. Behavior change → update matching platform doc in **same PR**
2. Schema change → regenerate CSVs + `node scripts/generate-schema-docs.mjs`
3. New canonical topic → update `docs/README.md` load order
4. Sprint closeout → summarize into `release-history.md` + `platform-capabilities.md`; archive sprint detail

---

## Anti-patterns

- New markdown file per feature without README index update
- Aspirational architecture not reflected in code
- Duplicating frozen doctrine in sprint docs
- Organizing primary docs around CRM/enrollment-only framing
- Placing planning audits (`docs/audits/documentation-*-2026-07.md`) in the agent load order as doctrine

---

## Source pack budget

AI/Cursor load order uses:

- **`docs/README.md`** navigation hub
- **`.cursor/rules/alloy-project-context.mdc`** — authoritative agent load order
- Platform canonical docs under `docs/platform/`
- Generated schema docs under `docs/schema/`
- Supabase CSV reference
- Locked runtime doctrines in `docs/system/` (performance, queue record, BOS identity)
- Agent repo boundaries: `docs/platform/governance/agent-repo-boundaries.md`

Sprints, audits, and archive **excluded** from default source pack unless explicitly needed for the task.

---

## Doctrine freeze policy

**Freeze before documenting.** Open debates belong in sprints/audits until resolved, then merge into platform docs as decisions.

Current frozen (July 2026):

- Business Process → Stage → Record operator model
- Queue preview boundary
- AdminV2 reveal gates
- BOS human-in-the-loop
- Platform architecture freeze (`platform/milestones/freeze-july-2026.md`)
- Operational Expectations architecture (`platform/milestones/operational-expectations-architecture-closeout.md`); realization program: `platform/milestones/operational-expectations-engineering-realization.md`

---

## Review cadence

- **Quarterly:** platform-capabilities + roadmap accuracy pass
- **After major ship:** release-history milestone
- **After migration apply:** schema regeneration
- **After doc structure wave:** docs-lint baseline refresh

---

## Related

- `design-and-operational-doctrine.md`
- `../../execution/operating-doctrine.md` (transitional expanded rules)
- `../../audits/documentation-architecture-audit-2026-07.md` (planning artifact)
- `../../sprints/active/documentation-rebaseline-v2/migration-manifest.md` (execution manifest)
