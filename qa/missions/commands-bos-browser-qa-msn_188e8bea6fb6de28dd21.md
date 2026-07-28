# Browser QA — BOS Command Runtime Convergence

Mission: `msn_188e8bea6fb6de28dd21`  
Date: 2026-07-28  
Worktree: `wt1-commands-system-inventory` / port 3011

## Record creation (Create Lead)

**Owner accepted** as reference implementation. No Create Lead polish in this closeout.

## Automated family proofs (shared bridge)

Vitest `tests/bos/commandSession/representativeBosAdapters.test.ts`:

| Family | Command | Proof |
|--------|---------|-------|
| Mutation | `update_lead_status` | Adapter calls `executePlatformCommandViaActionsApi` exactly once with `origin:"bos"`; no `/mutations/execute` |
| Relationship | `add_parent_guardian` | Same bridge; payload includes `source_customer_id` + `create_person_draft` |
| Confirmation | `cancel_tour` | Same bridge with `previewToken` + `confirmation.confirmed` |
| Authority | slash catalog | Unselected adapter-ready keys ineligible; fail closed without process keys |

Production `npm run typecheck` green.

## Interactive browser (localhost:3011)

**Blocked in this closeout session** by unstable Next.js ownership on slot 1:

- Toolkit `alloy-dev-start` starts cleanly, then the listener repeatedly dies / restarts under concurrent sibling Next servers (slots 2/4) and memory pressure.
- Cursor browser tabs that previously held auth (`/organization/processes`) fell to `chrome-error://chromewebdata/` when 3011 dropped.
- Re-auth + end-to-end UI walks for mutation / relationship / cancel could not be completed without a stable listener.

### Operator checklist (when 3011 is healthy)

1. Open a Business Process work unit with an opportunity focused (GlobalAssistant context).
2. Ensure process `command_set_v1` includes the Commands under test.
3. Slash `/` — confirm Create Lead / Update Lead Status / Add Parent Guardian / Cancel Tour appear only when selected.
4. **Mutation:** `/update-lead-status` → choose status → Review → Confirm → verify status change via Mutation Runtime (one network call to `/api/admin/actions/execute`).
5. **Relationship:** `/add-parent-guardian` → enter name → Review → Confirm → guardian linked.
6. **Confirmation:** open lead with active tour → `/cancel-tour` → Review (server preview) → Confirm cancel → booking canceled.
7. **Authority:** with process that excludes `cancel_tour`, slash entry shows ineligible / not inventable.
8. Narrow layout: generic session body remains usable in compact BOS.

## Verdict for certification

Architecture + shared Runtime bridge + honest ledger + automated family proofs: **done**.  
Interactive browser walks: **pending stable localhost** (operator checklist above). Owner Create Lead acceptance stands for record-creation family.
