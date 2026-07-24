---
owner: engineering
status: promotion-handoff
last_reviewed: 2026-07-24
supersedes: []
---

# Phase 5 — Promotion Handoff (push to staging)

## Push status: NOT pushed — blocked by the harness permission gate

I attempted `git push -u origin agent/claude/1-alloy-phase-5-product-realization`. It was
**refused by the Claude Code permission classifier**, not by git. A follow-up local merge-preview
against `origin/staging` was refused the same way. I did not work around the gate.

**To let me push, add a Bash permission rule** (or run the commands yourself). Once push is
permitted, the steps below complete the promotion.

## Current state

| | |
|---|---|
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt1-alloy-phase-5-product-realization` |
| Branch | `agent/claude/1-alloy-phase-5-product-realization` |
| Ahead / behind | **73 ahead / 96 behind** `origin/staging` |
| Tree | clean |
| On origin? | **no** — the agent branch is not yet on the remote |
| Verification | typecheck clean; 90 referential/transaction tests green; live authenticated cert passed (A1–A4 + B) |

## Recommended promotion path (sanctioned, PR-based)

The prior milestone promoted via PR (#233), not a direct `staging` push. Do the same:

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt1-alloy-phase-5-product-realization

# 1. Publish the branch (safe, reversible).
git push -u origin agent/claude/1-alloy-phase-5-product-realization

# 2. Rebase onto current staging and resolve conflicts (see caveat below — NOT trivial, 96 behind).
git fetch origin
git rebase origin/staging          # resolve conflicts, keep the referential-integrity guards intact
cd web && npm run typecheck && npx vitest run tests/lifecycle/configuredStageReferentialIntegrity.test.ts \
  tests/lifecycle/qualificationVisibility.test.ts tests/platform/platformTransaction.test.ts

# 3. Open the PR against staging.
gh pr create --base staging --head agent/claude/1-alloy-phase-5-product-realization \
  --title "Phase 5 — configured runtime + transaction & stage referential integrity" \
  --body-file docs/sprints/active/phase-5-engineering-closeout.md
```

Do not force a direct `git push origin HEAD:staging`.

## Two things that MUST be handled during promotion (not optional)

1. **The 96-behind rebase is non-trivial.** Staging advanced substantially during the sprint.
   Expect conflicts; re-run the referential-integrity + transaction test suites after resolving,
   and re-run the live cert if the guard/writer files changed.

2. **The publish guard changes behavior for EVERY tenant, not just Firefly.**
   `validateConfiguredStageReferences` now returns **HTTP 422 `dangling_stage_reference`** on any
   builder save whose stored config references a stage outside its own inventory. Any staging
   tenant that currently has a dangling reference will be unable to save its Business Process until
   remediated. Firefly's remediation migration is authored
   (`supabase/migrations/20260724000000_firefly_remediate_dangling_stage_references.sql`); other
   tenants may need the same. Audit staging tenants for dangling refs before/at deploy, or ship the
   remediation alongside.

## What is being promoted (summary)

- Platform Transaction Contract (`lib/platform/transaction/platformTransaction.ts`) — one pipeline,
  atomic or nothing-changed; Record Outcome + all tour transitions on it.
- Configured Stage Referential Integrity — configured process stages are the only runtime stage
  vocabulary; bootstrap/writer/publish all gate on configured membership; qualification leakage
  closed. Live-certified against Firefly.
- Forms API shape fix (Send Form now lists configured forms).
- What's Next configured-work runtime (capability registry + host model + warm-open + recomposition).

Full detail: `phase-5-engineering-closeout.md`. Next sprint: `firefly-operational-acceptance-handoff.md`.

## Not included in this promotion (deferred, documented)

- Firefly tenant remediation migration + Wenc QA reset — apply in a controlled window (service-role).
- Out-of-brief swallowed-error cluster (comms scheduled sends, family-send, canonicalOutboundEnqueue).
- Comms live-execution certification (blocked on a real recipient).
