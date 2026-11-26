# Processing Identity Resolution V1 — Architecture Preservation Checklist

**Status:** Acceptance criteria for staging reconciliation. Must survive rebase onto latest `origin/staging`.

**Starting implementation HEAD:** `1bcbe431217c5bc8bb3e6d9d0d6039a95b9ec381`  
**Safety ref:** `backup/proc-identity-pre-rebase-1bcbe4312`  
**Staging target (fetch time):** record in rebase notes

## Identity

- [ ] Canonical normalization library (`web/lib/identity`)
- [ ] Candidate generation
- [ ] Household graph
- [ ] Identity eligibility (`IdentityResolutionEligibility`)
- [ ] `confirmed_existing`
- [ ] `confirmed_new`
- [ ] `needs_review`
- [ ] `conflicted`
- [ ] `unresolved`
- [ ] create-new override (reason + rejected-candidate audit)
- [ ] audit lineage

## Processing

- [ ] Processing Cases
- [ ] Durable facts
- [ ] Durable resolutions
- [ ] Commit Plans
- [ ] Approvals
- [ ] Executor
- [ ] Operator Review

## Source authority

- [ ] Manual Create Lead routed through Processing
- [ ] Public Forms routed through Processing
- [ ] `applyFormIntakeSafe` remains throw-only
- [ ] No direct-write authority restored

## Commands

- [ ] Registered semantic commands only
- [ ] No table-name commands
- [ ] `create_process_participation`

## Security

- [ ] `has_org_role` SECURITY DEFINER
- [ ] B0 tenant policies
- [ ] No cross-tenant regression

## Execution

- [ ] Immutable plans
- [ ] Approval invalidation
- [ ] Explicit operator commit
- [ ] No feature flags
- [ ] No environment toggles
