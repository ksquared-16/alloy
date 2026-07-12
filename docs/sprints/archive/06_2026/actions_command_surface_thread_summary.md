# Actions / Command Surface / Work Views — thread summary

**Status:** Closeout summary for the Create Lead reliability + Work View Conditions thread (June 2026).
**Scope:** Operational Command Runtime, Command Surface, Create Lead fixes, Work Unit right rail vs
Focus Panel Manage separation, Work View Conditions V2.

This is a navigational summary. Canonical detail lives in the module/core docs and the per-feature
sprint docs referenced below.

---

## Mental model (unchanged, reaffirmed)

- **Action Definition vs Action Placement.** A definition (`action_definitions` / registered
  capability) is *what Alloy can do*; a placement (`action_placements`) is *where an operator sees
  it*. Config places actions; code owns executable behavior. See
  `../../platform/modules/actions-and-workflows.md` § Action Runtime contract.
- **Operational Command Runtime.** One registered capability + placement + context resolution +
  eligibility + required subjects + required inputs + preview + execution + audit + refresh. Manual
  UI and BOS are placements over the same runtime — no per-surface mutation path.
- **Operator Intent vs capability.** Operators choose an intent ("Open Lead", "Move Forward"); the
  runtime resolves it to a capability. Internal keys never leak to operators.
- **Command Surface.** Platform-owned shell (header/body/footer/success/failure), identical across
  `work_unit`, `focus_panel_manage`, `queue_row`, `bos` variants; config influences content only.
- **Work Unit right rail = work-unit scoped** (no inherited subject; operator resolves a required
  subject). **Focus Panel Manage = record scoped** (`current_record`). These are separate placement
  surfaces with separate resolution and must never share the same action list — enforced by
  `shouldDrawerReplaceCommandRailActions`. See actions doc § *Work Unit rail vs Focus Panel Manage*.

---

## What shipped (this thread)

| # | Change | Commit (origin/staging) |
|---|--------|-------------------------|
| 1 | Create Lead customer insert uses `customers.status_key` (dropped `customers.status` → PGRST204) | `bf7fc31fa` `fix(actions): use status_key for customer lead creation` |
| 2 | Open Lead → Work Unit Focus Panel via canonical route helper (no legacy drawer); humanize child status fallback | `12e0e532e` `fix(commands): open created lead in focus panel and humanize child status` |
| 3 | Post-create projection refresh: dispatch canonical queue event, register `create_lead` as membership mutation, work-unit refresh targets | `5e944a905` `fix(commands): refresh work unit projection after create lead` |
| 4 | Suppress lead-stage child outcome status (write `null`, not `new_inquiry`); relabel `new_inquiry` → "New Lead"; org cleanup script | `4948afa6b` `fix(enrollment): suppress lead-stage child outcome status` |
| 5 | BOS intake parity: Program dropdown, multiple parent emails, canonical location resolution, field-source parity, explicit Open Lead | `1707a4586` `feat(create-lead): complete BOS intake parity` |
| 6 | Work View Conditions V2: typed Lead Stage / Lead Status / Child Enrollment Status / Campus / Program / Needs Attention; legacy Stage/Status deprecated | `aafd90af7` `fix(processes): clarify work view condition fields` |

**Create Lead current state:** create succeeds; success state stays visible; **Open Lead** (explicit
click) closes the modal and opens the Focus Panel by record id; New Leads pill/rows refresh without a
full reload; the child badge is suppressed at intake; BOS intake fields match the standard sources;
no operator-facing "Inquiry" language.

**Status cleanup:** product language is **Lead**. `new_inquiry` is retained as an internal key
(queue/lifecycle compatibility) but always displays as "New Lead"; legacy child OCM `new_inquiry`
rows are migrated to `null`.

**Work View Conditions V2:** condition fields come from a typed registry
(`workViewConditionFieldRegistry.ts`), grouped by subject — **Lead Stage** (process stages),
**Lead Status** (opportunity statuses), **Child Enrollment Status** (OCM dispositions), **Campus**
(`site`), **Program**, **Needs Attention**. Generic `Stage`/`Status`/`location` conditions are
**deprecated** and normalized to canonical keys on load. See
`work_view_conditions_v2.md` and `../../platform/core/business-process-system.md` § Work View conditions.

---

## What remains unresolved

- **Opportunity case status key still `new_inquiry`.** Renaming the opportunity key to `new_lead`
  (with alias support) is **deferred** pending queue/lifecycle config validation. Only the child
  outcome status was changed in this thread.
- **Org data migration is opt-in.** The label-relabel migration applies on deploy; the child
  `new_inquiry → null` cleanup is a dry-run-first, org-scoped script
  (`scripts/suppressLegacyChildNewInquiryStatus.ts`) run per org (executed for org
  `93667019-…`; other orgs on demand).
- **Server-side required-input parity** with stage intake-spec `field_rules` (notably location) is a
  documented follow-up — see `create_lead_command_flow_audit.md` § Phase 6.
- **Full BOS rail apply UI** for action proposals remains follow-up; executors/modals are runtime-ready.
- **Name-extraction edge case:** two parent names on separate lines with emails on later lines can
  collapse to a single parent at extraction (emails then both attach to that parent). Name+email on
  the same line, or comma-separated emails, parse correctly.
- **Command Surface chrome swap deferred:** `CreateLeadModal` is hosted (not rewritten) by
  `CreateLeadCommandSurface`; replacing its visible chrome with `CommandSurfaceShell` is the next step.

---

## Risks

- **Shared intake engine.** `extractFactsFromText` is shared (Create Lead + forms/POS). The
  multi-email scan is additive and deduped, but changes here ripple — keep broad intake/POS regression.
- **Queue alias expansion** accepts both `new_lead` and `new_inquiry` at runtime; if the opportunity
  key is later renamed, re-verify lane membership and per-org stored `queue_definition`.
- **Legacy `new_inquiry` rows** in un-migrated orgs render "New Lead" via the canonical-label fallback,
  but rely on that fallback until the org script runs.

---

## Recommended next sprint

1. **Opportunity key canonicalization** (`new_inquiry → new_lead`) behind queue/lifecycle config
   validation + alias support + a guarded, org-scoped migration.
2. **Server-side Create Lead required-input parity** (location and other stage `field_rules`).
3. **Command Surface chrome convergence** — render `CreateLeadModal` body through `CommandSurfaceShell`.
4. **BOS rail apply UI** for confirmed action proposals.
5. **Name-extraction hardening** for multi-parent / multi-line layouts.

---

## Related docs

- `../../platform/modules/actions-and-workflows.md` — Action Runtime, Command Runtime, Command Surface, Create Lead contract
- `../../platform/governance/implementation-patterns.md` — projection-refresh + status-label patterns
- `../../platform/modules/ai-platform.md` — BOS Create Lead + intake parity
- `../../platform/core/business-process-system.md` — Work View conditions V2, case/child grain
- `command_surface_v1.md` / `v2.md` / `v3.md`, `operational_command_runtime_v3.md`, `create_lead_command_flow_audit.md`, `work_view_conditions_v2.md`
