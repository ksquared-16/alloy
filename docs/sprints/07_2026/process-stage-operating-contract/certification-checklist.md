# Process Stage operating-contract — local certification

Branch: `fix/process-stage-operating-contract`  
Base: `origin/staging` @ see git log  
Policy: local-only — **not pushed**

## Product stop condition

Tour can be authored as outcome-led work without inventing a Primary Action or typing a raw closed status.

## Implementation checklist

| Area | Result |
|------|--------|
| Optional Primary Action (No direct action / Select an action) | Wired in Work Template Actions editor |
| Available Outcomes rename | Done (Results label removed) |
| Outcome Definitions / conditional automation fields | Done |
| Close Record uses `resolveOutcomeStatusOptions` | Done — raw text input removed |
| Move / Close disabled when unavailable | Done |
| `validateStageOperatingPlanOperatingContract` on save | Done via editor model persist |
| Current Work `execution` on surface VM | Returned; `execution_mode` forwarded from published plan |
| Outcome-led Record Outcome prominence | Workspace uses `execution.prominentCta` |
| Proof fixtures Tour / Lead / Decision / Billing | `web/lib/lifecycle/fixtures/processStageOperatingContractProofPlans.ts` |
| Focused tests covering cases 1–35 | `web/tests/lifecycle/processStageOperatingContract.test.ts` |

## Browser QA

Screenshots under `evidence/` when a local authenticated Process Builder session is available.

**Blockers if empty:** concurrent agent worktree; may lack login session / live Next against this worktree. Certification then relies on focused unit tests + static editor contracts.

## Doctrine contradictions (not updated)

Do not update canonical doctrine in this branch. Observed tension for product review:

1. Enrollment default stage plans still encode some legacy Tour/Decision shapes separately from proof fixtures — promoting proof plans into defaults needs an explicit product decision.
2. Close via transition-owned progressive edge vs direct closed-status close both remain valid; editor supports status select for `close_record` and transition select for `move_to_stage`.
3. Interaction-grammar / Current Work visual remediation remains on separate branch `fix/current-work-workspace-product-remediation`.
