---
title: GPT project sources installation
owner: platform
status: canonical
last_reviewed: 2026-10-01
supersedes: []
---

# Installing `alloy-context.v1` as GPT project sources

Operator-facing. Machine-readable equivalent: [`gpt-project-sources.json`](gpt-project-sources.json).

**Do not execute Phase 2 from this document.** This describes the installation; performing the GPT
source replacement is a separate, later action.

---

## 1. Remove first

Remove **every** existing Alloy source from the project. A partial replacement is worse than no
replacement: an old file left in place keeps supplying superseded doctrine, and the model cannot tell
which generation it is reading.

Specifically remove anything from these trees, which must never be a GPT source:

`docs/sprints/` · `docs/archive/` · `docs/platform/planning/` · `docs/audits/` ·
`docs/product/` · `docs/handoffs/` · `docs/platform/milestones/` · `docs/marketing/` ·
`docs/platform/qa/` · `docs/platform/rfcs/` · `certification/`

## 2. Add Tier 1 — always loaded (5 files)

```text
docs/context/alloy-platform-synthesis.md
docs/context/alloy-inference-contract.md
docs/context/alloy-canonical-owner-map.md
docs/context/alloy-benchmark-context.md
docs/platform/governance/glossary.md
```

These five are the standing context. **Do not add a sixth.** The cap is enforced by
`web/tests/docs/contextPackageValidator.test.ts`.

`alloy-benchmark-context.md` is `FETCH_LIVE`: it carries certification state and measured counts, so
refresh it whenever the package version changes rather than treating it as fixed.

## 3. Add Tier 2 — domain sources (17 files)

Add these so they are available, and load them **per domain** rather than all at once:

```text
developer-platform-api    docs/api/api-architecture.md
                          docs/api/README.md
runtime                   docs/platform/foundation/architecture.md
business-process          docs/platform/core/business-process-system.md
                          docs/platform/core/status-and-state-system.md
identity-access           docs/platform/governance/roles-and-permissions.md
enrollment-placement      docs/platform/core/placement-system.md
staff-scheduling          docs/platform/governance/staff-coverage-authority.md
attendance                docs/platform/modules/attendance-system.md
subsidy                   docs/platform/modules/financials-canonical-authorities.md
commercial                docs/platform/modules/commercial-configuration.md
operational-intelligence  docs/platform/core/operational-calculations.md
communications            docs/platform/modules/communications-platform.md
configuration             docs/platform/governance/configuration-publication-model.md
ai-bos                    docs/platform/trust/reasoning-runtime.md
operations-temporal       docs/platform/core/effective-dated-assignment-doctrine.md   (shared)
product-urls              docs/system/routing-doctrine.md                             (shared)
```

Two notes that prevent predictable mistakes:

- **`financials-canonical-authorities.md` is listed under `subsidy`, not Financials.** Only its
  Subsidy section is certified. Do not read the rest as current Financials truth.
- **The two shared sources load alongside their consumers.** Any placement, scheduling or attendance
  question needs `effective-dated-assignment-doctrine.md`; any URL question needs
  `routing-doctrine.md`.

## 4. Tier 3 — reference, on demand only

26 files, listed in [`gpt-project-sources.json`](gpt-project-sources.json) with
`load_condition: on-demand:<lane>`. Add them only if the project supports on-demand retrieval;
otherwise leave them out rather than promoting them, which would defeat the tiering.

Generated contracts in this tier — the OpenAPI document and the declared route-capability table — are
cited **verbatim** and never paraphrased.

## 5. Financials / Payments

Add **no** Financials source. The lane is `PENDING_DISABLED`.

If asked about payments, refunds, the ledger or collection, the correct answer is that the domain is
**not certified**, its semantics changed as recently as 2026-09-30, and current behaviour must be read
from the implementation rather than from documentation. Subsidy and Commercial **are** certified and
may be answered normally.

## 6. Verifying the installation

Ask the model three questions whose right answers are all counter-intuitive. If it gets these wrong,
the install is incomplete or an old source survived:

| Question | Correct answer |
|---|---|
| Where is Alloy's configuration control plane? | `/organization` is the landing; `/settings/*` holds sub-surfaces; `/admin/*` is still canonical for non-settings modules. **Not** `/admin/settings`. |
| Does Alloy have a partner API? | Yes — `/api/v1`, frozen and versioned, 18 paths with an OAuth token exchange. Outbound event delivery does not exist. |
| May a staff member hold two operational primary assignments? | Yes, if the date ranges do not overlap. A child may not. |

## 7. Replacing a package version

A new package version replaces the prior one **wholesale**. Do not merge versions.

1. Read `package_id` and `schema_version` from [`alloy-context-package.json`](alloy-context-package.json).
2. Remove all sources from the previous version.
3. Install Tier 1, then Tier 2, per the new manifest.
4. Record the installed `package_id` and `source_staging_sha` so drift is detectable.

Financials certification is expected to produce `alloy-context.v1.1` — a compatible revision that
enables the pending lane — unless including it requires a schema change, which would make it v2.
