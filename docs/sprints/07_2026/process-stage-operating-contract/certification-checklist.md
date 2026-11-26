# Process Stage operating-contract — local certification

Branch: `fix/process-stage-operating-contract`  
Base: `origin/staging` @ see git log  
Policy: local-only — **not pushed**

## Product stop condition

Tour can be authored as outcome-led work without inventing a Primary Action. Stage-owned transitions carry canonical destination/status effects, and closed statuses derive close semantics.

## Implementation checklist

| Area | Result |
|------|--------|
| Optional Primary Action (No direct action / Select an action) | Wired in Work Template Actions editor |
| Available Outcomes rename | Done (Results label removed) |
| Stage-owned Outgoing Transitions editor | Done |
| Standalone stage-owned Outcome Definitions | Done |
| Composable movement / multiple follow-ups / attention | Done |
| Closed status derives transition close semantics | Done — no visible Close Record behavior |
| `validateStageOperatingPlanOperatingContract` on save | Done via editor model persist |
| Proof fixtures Tour / Lead / Decision / Billing | `web/lib/lifecycle/fixtures/processStageOperatingContractProofPlans.ts` |
| Focused parser/validation/runtime tests | lifecycle focused suites |

## Browser QA

Screenshots under `evidence/` when a local authenticated Process Builder session is available.

**Blockers if empty:** concurrent agent worktree; may lack login session / live Next against this worktree. Certification then relies on focused unit tests + static editor contracts.

## Remaining compatibility

Existing plans without `outgoing_transitions` continue to resolve legacy outcome-rule and split-rule edges. Legacy outcome `work_template_key`, `stage_key`, and status targets remain readable/executable for old plans; newly edited plans validate against transition identity authority.
