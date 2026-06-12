# Documentation governance

**Status:** Canonical rules for maintaining the doc system (June 2026 rebaseline).

---

## Structure

| Layer | Location | Purpose |
|-------|----------|---------|
| **Schema** | `docs/schema/` | Generated from Supabase CSV exports |
| **Platform** | `docs/platform/` | Canonical platform doctrine and modules |
| **Sprints** | `docs/sprints/` | Execution history — not primary doctrine |
| **Audits** | `docs/audits/` | Point-in-time investigations |
| **Archive** | `docs/archive/` | Superseded material — not current truth |
| **Export packs** | `docs/export/` | Portable handoff bundles |

Navigation hub: `docs/README.md`

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

---

## Source pack budget

AI/Cursor load order uses compact active set:

- Platform canonical docs (this rebaseline)
- Generated schema docs
- Supabase CSV reference
- Locked runtime doctrines in `docs/system/` (performance, queue record, BOS identity)

Sprints and archive **excluded** from default source pack.

---

## Doctrine freeze policy

**Freeze before documenting.** Open debates belong in sprints/audits until resolved, then merge into platform docs as decisions.

Current frozen (June 2026):

- Business Process → Stage → Record operator model
- Queue preview boundary
- AdminV2 reveal gates
- BOS human-in-the-loop
- Enrollment single-WU multi-queue pattern

---

## Review cadence

- **Quarterly:** platform-capabilities + roadmap accuracy pass
- **After major ship:** release-history milestone
- **After migration apply:** schema regeneration

---

## Related

- `design-and-operational-doctrine.md`
- `../../execution/operating-doctrine.md` (transitional expanded rules)
- `../../audits/documentation-audit.md`
