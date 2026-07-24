# Engineering Operations — Phase 3 pilot (Access & Roles, real runtime)

Piloted on the live :3020 runtime with the **real Claude provider** (authenticated, oauth). The operator ran the complete operational lifecycle through Vacilando without touching a provider window, branch, or localhost.

Pilot mission `msn_28cee1ab48d5dae77d` · capability `cap_access_roles` · slot 6 · worktree `wt6-vacilando-os-product-def`.

## The lifecycle, as it actually ran

| Step | Operator action | Engineering state | What the operator saw |
|---|---|---|---|
| 1. Start | `Start this work` | Ready to start → Executing | "Starting runs the work on an engine in an isolated workspace — you don't manage the provider, branch, or server." |
| 2. Execute | (nothing — ambient) | Executing | live progress: phase "editing files"; summaries *"I'll analyze the current implementation and produce the V2 proposal"* → *"The target file already exists. Let me check its current content"* — engineering, not tokens |
| 3. Verify | (automatic) | Verifying → Ready for review | on the completion claim, Vacilando checked evidence against acceptance automatically (never "the engine stopped") |
| 4. Review | read the review | Ready for review | assembled: summary, what changed, evidence vs. each criterion, risks, recommendation |
| 5. Accept | `Accept` | Accepted | operator sign-off (the operator_review criterion was the operator's judgment) |
| 6. Close | `Close` | Closed | "Wound down — capacity freed, artifacts preserved." |

The operator was **never interrupted** during execution — the work ran to completion and surfaced as *ready-for-you* (a pull), not a push.

## The assembled review (verbatim from the runtime)

- **Summary:** *"Verified the pre-existing Access & Roles V2 proposal against the live implementation (UsersRolesSettingsClient.tsx and permissionGrid.ts) and confirmed it is complete, accurate, and satisfies every acceptance criterion. … Made a single docs-only correction: updated the proposal header … No source code changed."*
- **What changed:** `docs/platform/planning/vacilando-os/qa/vertical-slice-v1/cap_access_roles-v2-proposal.md`
- **Evidence vs. acceptance:**
  - ✓ met — Proposal exists (21568 bytes)
  - ✓ met — All required sections present
  - ✓ met — Only allowed docs changed (1)
  - ? operator_review — Rejected patterns cited-as-rejected (advisory; operator to confirm)
- **Remaining risks:** deliverable pre-existed from a prior sprint; this turn verified accuracy and corrected only the header attribution rather than regenerating it.
- **Director's read:** *"Automated checks pass, but 1 criterion needs your judgment before I'd call it done."* → requested action: **review**.

## Acceptance bar (all met)

1. ✅ Start Access & Roles through Vacilando. 2. ✅ Observe meaningful engineering progress. 3. ✅ Provider window never opened. 4. ✅ Interrupted only when necessary (never, mid-flight). 5. ✅ Review completed work (engineering, not a transcript). 6. ✅ Accept it. 7. ✅ Close it. — all without manually managing Claude, branches, or localhost.

## Environment note (honest)

The runtime-host worktree is architecturally a `system_host` that hosts no missions. For a single-worktree pilot, a slot-6 registry entry (`~/.local/state/alloy-dev/metadata/…`, the same file `alloy-sprint-start` writes) was provisioned so this worktree has an authoritative slot identity; this is environment provisioning, not a code/architecture change. The host==slot overlap is a *disclosed* anomaly (`hostIdentity().conflicts_with_slot`), not a hidden one. In a normal multi-worktree setup the work would run in a distinct slot worktree; the operational loop is identical either way. The pilot's one real artifact (a header-attribution edit to the proposal doc) was reverted so the Phase-3 commit is code-only.
