# Documentation follow-up closeout

**Date:** 2026-06-12  
**Branch:** `staging`  
**Commits:** Rebaseline (`63795a44`) + follow-up cleanup (this pass)

---

## Summary

Completed post-rebaseline cleanup: internal link sweep on active/transitional docs, Cursor rules load-order update, schema generator validation. Live staging schema export **not run** — no `DATABASE_URL` in shell; sourcing `web/.env.local` requires explicit operator approval.

---

## Commit 1 — Rebaseline (already on staging)

```
docs: rebaseline platform documentation around Business Process System
```

46 files — `docs/platform/`, `docs/schema/`, audits, sprint indexes, generator script.

---

## Commit 2 — Follow-up (this pass)

### Links fixed

| File | Change |
|------|--------|
| `docs/platform/core/business-process-system.md` | Broken `enrollment-and-pipeline.md` → `../../product/crm-system.md` |
| `docs/platform/governance/documentation-governance.md` | Wrong `../audits/` → `../../audits/documentation-audit.md` |
| `docs/core/system-overview.md` | Process-first hierarchy; platform doc links for workspace/enrollment |
| `docs/system/repository-state-2026-06.md` | Developer load order → `docs/platform/*`; related-docs pointer |
| `docs/system/record-system.md` | Canonical pointer; queue context → `platform/operator/queue-system.md` |
| `docs/system/entity-model.md` | Canonical pointer to `platform/core/entity-model.md` |
| `docs/system/workspace-system.md` | Process-first purpose line + canonical links |
| `docs/product/crm-system.md` | Supplemental banner; navigation → Business Process → Stage → Record |
| `docs/execution/roadmap-and-gaps.md` | Platform maturity + canonical roadmap/capabilities pointers |
| `docs/execution/operating-doctrine.md` | Source-pack load order → platform docs |

**Not swept (intentionally):** `docs/archive/**`, `docs/export/**`, month sprint folders (`05_2026/`, `06_2026/`) — historical references retained per guardrails.

---

## Cursor rules updated

**File:** `.cursor/rules/alloy-project-context.mdc`

- Load order starts with `docs/README.md` and canonical `docs/platform/*` paths (per rebaseline list)
- Business Process → Stage → Record operator model documented
- Work units demoted to runtime construct reference
- `docs/product/crm-system.md` marked supplemental (not primary framing)
- Transitional `docs/system/*`, `docs/core/*`, `docs/execution/*` demoted behind platform docs

---

## Schema refresh status

| Step | Status |
|------|--------|
| `npm run generate:schema-docs` | **Passed** — 7 files under `docs/schema/` |
| `npm run export:supabase-schema` | **Not run** — `DATABASE_URL` not available in shell |
| Live staging CSV refresh | **Deferred** — run manually: |

```bash
# From repo root, with staging credentials:
DATABASE_URL='postgresql://...' npm run export:supabase-schema
npm run generate:schema-docs
```

Current schema docs reflect **last committed CSV export** on disk (165 base tables, 7 views as of generator run 2026-06-12).

---

## Validation

| Check | Result |
|-------|--------|
| `npm run generate:schema-docs` | Pass |
| Application code changes | None |
| Sprint folder moves | None (guardrail) |
| `product/crm-system.md` rename | None (guardrail) |
| New canonical docs | None (guardrail) |

---

## Remaining risks

1. **Stale links in archive/sprints/export packs** — large surface; not in default load path
2. **Live staging schema drift** — CSVs may lag until manual export with credentials
3. **Transitional `docs/system/*` files** — still contain enrollment-heavy detail; full merge optional
4. **Month sprint folder migration** — blocked until reference sweep completes
5. **`docs/execution/operating-doctrine.md`** — still references legacy file-count budget; merge into governance doc optional

---

## Recommended next cleanup

1. Run staging schema export when credentials approved; commit CSV + regenerated schema docs
2. Sweep `docs/system/*.md` headers to add platform canonical pointers (drawer, actions, configuration)
3. Update `docs/audits/*.md` cross-links to platform paths where audits remain active
4. Physical sprint migration to `active/` / `completed/` / `archive/` after link grep clean
5. Optional: fold `roadmap-and-gaps.md` detail into platform roadmap and trim transitional file

---

## Related

- Initial rebaseline audit: `documentation-audit.md`
- Initial closeout: `documentation-closeout-report.md`
- Navigation hub: `../README.md`
