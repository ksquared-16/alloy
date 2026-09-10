---
owner: platform
status: historical
last_reviewed: 2026-09-10
supersedes: []
---

# Documentation truth audit — September 2026

**Point-in-time investigation.** Not doctrine. Corrections this audit made are committed to the
owning canonical documents; this record exists so the reasoning and the unfixed remainder survive.

Scope: repository-wide documentation truth audit against the code, run 2026-09-10 at
`a5288700d`. The documentation baseline was largely frozen in July 2026; **4,846 commits and
181 migrations landed between 2026-07-01 and the audit**, so the delta being audited is large.

Companion: [`api-inventory-and-gaps.md`](./api-inventory-and-gaps.md) — the API documentation
inventory and gap register, which is direct input to the API thread.

---

## 1. Documentation estate map

1,867 tracked markdown files. Authority by tier:

| Tier | Location | Files | Authority | Governed by lint |
|---|---|---:|---|---|
| Navigation | `docs/README.md` | 1 | Entry point for humans and agents | yes |
| Canonical doctrine | `docs/platform/{foundation,core,operator,runtime,modules,experience,trust,analytics,commercial,communications,governance,milestones,rfcs}/` | 241 | **Current truth** | yes |
| Planning / execution | `docs/platform/planning/` | 242 | **Not doctrine** — misplaced, see §4 | yes (frontmatter) |
| Locked runtime | `docs/system/` | 33 | Implementation contracts | yes |
| Generated reference | `docs/schema/` (7), `docs/api/api-index.md` | 8 | Machine-produced | boundary rule |
| API doctrine | `docs/api/` (21 authored) | 21 | Mixed — each file declares its own class | no |
| Vertical / product | `docs/product/` | 29 | Childcare reference implementation | yes (frontmatter only) |
| Runtime execution | `docs/runtime/` | 52 | Execution history + ~10 stranded canon (§5) | no |
| Handoffs | `docs/handoffs/` | 23 | Execution artifacts | no |
| Sprints | `docs/sprints/{active,completed,archive}/` | 699 | Execution history — not current truth | no |
| Audits | `docs/audits/{active,archive}/` | 113 | Point-in-time investigations | no |
| Archive | `docs/archive/` | 283 | Superseded — not current truth | no |
| Marketing | `docs/marketing/` | 5 | Positioning | no |
| Schema source | `docs/supabase/reference/` | 8 CSVs | Export the schema docs generate from | n/a |

Six of these directories — api, product, runtime, handoffs, marketing, supabase — appeared in
**no** governance structure table before this audit; 131 files had no declared layer or
authority. They are now declared in `docs/platform/governance/documentation-governance.md`.

**Outside `docs/` and invisible to the lint:** 117 markdown files, including three execution
artifacts at the repository root — `CLOSEOUT-prefetch-gap-investigation.md`,
`HANDOFF-runtime-v1-polish.md`, `RUNTIME-V1-REALIZATION-LEDGER.md` (all 2026-07-25/26, naming a
worktree and commit state that no longer exist). The lint scans `docs/**` and the root
`README.md` only.

## 2. Navigation model

`docs/README.md` → Platform Handbook → foundation → core → operator → modules → governance →
schema. That chain is intact and its four broken load-order links are fixed. It remains a
**one-hop index**: `orphan-canonical` (381) measures whether a file is named in `docs/README.md`,
not whether it is reachable, so it cannot distinguish unreachable doctrine from the misplaced
planning tree. 242 of the 381 are that tree.

## 3. Canonical ownership matrix

| Concept | Canonical owner | State after this audit |
|---|---|---|
| Platform introduction | `foundation/alloy-platform-handbook.md` | Current; no chapter for Attendance / Financials / Employment |
| Capability register | `foundation/platform-capabilities.md` | **Corrected** — Trust, Comms V2, Payments, Financials, Attendance, Employment |
| Release milestones | `foundation/release-history.md` | **Corrected** — 2026 H2 section added |
| Roadmap | `foundation/product-roadmap.md` | **Corrected** — shipped lanes separated from genuinely future ones, each with evidence |
| Architecture | `foundation/architecture.md` | Runtime register reconciled (the two "nines" disambiguated; kernel stated as substrate, not a tenth runtime). Route staleness remains — residual debt |
| System overview | `foundation/system-overview.md` | **Corrected** — configuration plane is `/organization/*`; `/admin` and `/settings` are redirects. Operator row no longer says "record drawer" |
| Decision register | `foundation/platform-decisions.md` | Stale — last entry 2026-08; ≥6 decisions unregistered |
| Runtime register | `foundation/architecture.md` (9 runtimes) · `platform-manifesto.md` and `freeze-july-2026.md` (12 = the 9 plus 3 contained sub-runtimes) · `platform/runtime/alloy-runtime-kernel.md` (K1–K4 kernel, a different altitude) | **Mostly reconciled** in the continuation pass. The audit's original "9 layers" was a mis-citation: the nine *layers* are `os-runtime-map.md`, a different list from the nine *runtimes*. What remains is a real ownership question — D2 |
| Interaction spine | `operator/canonical-interaction-model.md` + grammar + story | Current; two competing *synthesis* docs |
| Card primitive | `operator/universal-card-system.md` | **Resolved.** Not a collision — one chain at seven altitudes in which every candidate disclaims the primitive. `operational-grammar.md` and `card-language.md` had put behaviour values (*Focused*, *Immersive*) on the sizing axis; corrected to point at the owner. Colour Language de-duplicated to System 5 |
| Workspace / navigation | `core/navigation-and-workspace-doctrine.md` (V3) | Stale on the `/workspace` landing; competes with `operator/operational-workspace-shell.md` |
| Queue | `operator/queue-system.md` | Current with drift |
| Focus Panel / drawer | `operator/focus-panel-architecture-vocabulary.md`, `operator/drawer-system.md` | Current; `docs/system/` drawer docs **bannered and corrected** |
| Work Items | `operator/queue-system.md` §Work Items queue | **Resolved.** queue-system.md was already accurate (Folders · Views · Sources) and is now named as the owner; `operational-workspace-shell.md`'s stale process-rail description corrected. No `work_item*` table exists — it is a presentation layer over `operational_tasks` plus two virtual projections |
| Scheduling / staffing | **MISSING CANONICAL OWNER — recorded gap** | Employment foundation, staff assignment eligibility and staff presence facts shipped Aug 2026; `web/app/adminV2/scheduling/` exists. No module doc owns the domain. Writing one would require defining the domain model, which is product work, not documentation maintenance. Recorded in the roadmap and here; **D6** |
| Identity / roles / access | `governance/roles-and-permissions.md` | **Corrected** to Membership → Role → Capability → Scope; still an 89-line stub over ~30 workstreams |
| Attendance | `modules/attendance-system.md` | Current |
| Billing / financials | `modules/billing-financials-platform.md` | **Header reconciled to its own body** |
| Payments / subsidy | sections of the billing doc; **not indexed** | Content current, ownership implicit |
| Communications | `modules/communications-platform.md`, `communications-identity-platform.md` | **Inbound email corrected** |
| Processing | `modules/documents-and-forms.md` (3 paragraphs) | **Canon stranded** in `docs/sprints/archive/07_2026/` |
| Forms / documents | `modules/documents-and-forms.md` | Stale — August anchoring model undocumented |
| Configuration | `modules/configuration-platform.md` | Stale — "Programs is the only consumer" |
| AI / BOS | `modules/ai-platform.md` | Stale — rows marked Complete are gated off by default |
| Operational Intelligence | `modules/operational-intelligence-platform.md` | Inventory rotted (11 keys documented, 34 registered) |
| Operational Expectations | `core/operational-expectations-system-design.md` | **Posture corrected** — activated-purpose seam |
| API contracts | `governance/api-contracts.md` + `docs/api/**` | **Corrected + classified** |
| Documentation governance | `governance/documentation-governance.md` | **Reconciled with the linter** |

## 4. The largest structural finding

`docs/platform/planning/` is 242 files — **half of `docs/platform/`** — of planning, discovery
and execution tracking, inside the tree governance reserves for current truth. It holds five
unrelated programs (Vacilando OS 130, Conversation Platform V1 41, Scheduling 55,
Access/Identity V2 8, Trust 8), has commits landing daily, and is the source of 95 of 95
remaining missing-frontmatter violations, 20 of 24 malformed, all 10 duplicate basenames, and
242 of 381 orphans.

Governance placement rule 3 forbids exactly this, and **no lint rule implements it** — a
`status: sprint` document inside `docs/platform/` passes silently.

This audit did **not** move the tree. It is too large, too active, and too linked-to from code
to relocate unattended. Its README now states plainly that nothing in it is doctrine. The move
is recorded as a decision for the master thread.

## 5. Canonical content stranded in history

- **`docs/runtime/`** — ~10 of 52 files are normative and have no equivalent under
  `docs/platform/`: `GRAIN-AUTHORITY-MAP.md`, `SUBJECT-AUTHORITY.md`, `CARD-LOADING-AUTHORITY.md`,
  `CARD-READINESS-LIFECYCLE.md`, `DEEPLINK-COMPOSE-OWNERSHIP.md`, `DURABLE-RECORD-ATTENTION.md`,
  and others. **20 `web/` source and test sites cite them**, including a live route. Promotion
  must rewrite those `@see` paths in the same commit or the binding breaks silently.
  `CARD-READINESS-LIFECYCLE.md` self-declares "DESIGN / EXPLORATION. No code." while production
  code cites it.
- **Processing** — the real doctrine (command registry, plan versioning, content-hash approval
  binding, executor compensation) lives only in `docs/sprints/archive/07_2026/`.
- **Identity / Access** — `docs/platform/planning/vacilando-os/qa/access-identity-v2/w45-w51-truthful-access-execution.json`
  is the only place in `docs/` recording the approved canonical model and defining `OD-8`. A JSON
  evidence blob is the sole documentary home of a live workstream.
- **September 2026 has no sprint archive** — `docs/sprints/archive/09_2026/` does not exist.
  September's evidence is scattered across governance, planning and audits. This is a stranding
  forming now, not a past one.

## 6. Duplication and conflict

Resolved here: docs/api authority (declared per file); generated-vs-authored boundary (now a
document property); governance governed-paths and structure table (matched to the linter);
`universal-card-archetypes.md` listed twice in the load order.

Recorded, not resolved — each needs an owner decision, not a documentation edit:

1. **Runtime register** — four documents, three different layer counts, none containing Trust
   Runtime or the Runtime V1 kernel.
2. **Two runtime corpora** — `platform/runtime/runtime-realization-architecture.md` (the
   "Constitution") and `platform/operator/alloy-runtime-specification.md` both claim total
   authority. The README asserts they are complementary; **neither document says so**, and they
   contain zero cross-references. The Constitution mentions "Record of Attention", "Context
   Frame", "Focus Panel" and "Perspective" zero times each.
3. **Card taxonomy** — numbered System 4/5/5A/5B/5C versus the Grammar/Language/Composition
   stack. The density ladder is 4 steps in code, 4 / 5 / 6 across three canonical docs.
4. **Workspace** — `operator/operational-workspace-shell.md` mandates `CompactKpiStrip`;
   `core/navigation-and-workspace-doctrine.md` forbids it. Code sides with the latter (zero
   non-test importers).
5. **Subsidy** — `modules/financial-platform-domain.md` freezes "Third-Party Payer generalizes
   subsidy"; the shipped tables are childcare-specific and the billing doc consciously overrides
   the frozen law, with no `supersedes` link.
6. **What a metric is** — code-owned TypeScript registry versus DB-backed operator-configurable
   definitions.
7. **Two forked copies** of the 8-document access-identity corpus, with the repository itself
   recording the conflict as an open Director decision.

## 7. Verification

| Check | Result |
|---|---|
| `npm run docs:lint` | Runs clean; `generated-boundary` 21 → **0**, `frontmatter-missing` 108 → **95**, `frontmatter-malformed` 25 → **24** |
| `node scripts/generate-schema-docs.mjs` | Regenerates; diff limited to real drift |
| `node scripts/generate-api-inventory.mjs` | Regenerates; 524 → 613 routes |
| `web/tests/scripts/docsLint.test.ts` | All 9 assertions re-executed in plain node + 1 new; 10 passed. **vitest could not run** — no `node_modules` in this worktree and the validation broker refuses an unslotted lane (`metadata missing ALLOY_WORKTREE_SLOT`) |
| Link validation | Only via docs-lint. Backticked path references — the form most of the corrected navigation bugs took — are **not** checked by any tool |
