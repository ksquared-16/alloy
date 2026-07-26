# Deployment Certification — Global Mission Rule

*A staging promotion is not complete until every deployment layer is verified. Application code, database schema, migrations, and migration history are one deployable unit — and no layer certifies on the word of another.*

A **Global Mission Rule**: it is not attached to any capability. Every staging promotion Vacilando touches enforces it automatically. It is a governance rule and a Director-behavior specification; it defines what certification *means* and what Director must do, and it forbids the failure it is named for. It sits beside the [Worker Operating Policy](WORKER-OPERATING-POLICY.md) as a standing rule that governs how missions end, and it is the deployment-layer expression of the platform's [deployment & environments governance](../../governance/deployment-and-environments.md).

---

## The one rule

> **Application code, database schema, migrations, and migration history are a single deployable unit. A promotion is complete only when every layer is verified against the same expected state. Until then, Vacilando must not certify, close, merge, or recommend the promotion — and no check may read green without real evidence.**

"App deployed" is not "deployed." A promotion in which the application ships but the database migration ledger diverges is **not** a successful promotion; it is a half-applied deployment wearing a green check.

---

## Why this rule exists

This is not hypothetical. Alloy has a **recurring, evidenced failure**: application changes merge green while the staging Supabase migration ledger diverges from the repository — *"Remote migration versions not found in local migrations directory"* — so a fix is "merged" but its migration is never applied, and PR checks pass only against ephemeral preview databases, not the real staging schema. The application and the database then run different schema versions, and nothing surfaced it because the app layer alone reported success. This rule ends the class of failure where **one layer's success is mistaken for the whole deployment's success.**

It is the same anti-pattern discovery work has flagged elsewhere: *a checkbox without enforcement evidence is not a control.* A certification that isn't backed by verification is itself the defect.

---

## Completion criteria (all required)

A promotion may be certified **only** when every one of these is true, each backed by recorded evidence:

1. **Application deployment completed successfully.**
2. **Database migrations deployed successfully.**
3. **The deployed migration ledger exactly matches the repository migration ledger** — same versions, in both directions.
4. **No pending, skipped, failed, or divergent migrations exist.**
5. **Application and database are running against the same expected schema version.**
6. **Any required post-deployment verification passes** (health checks, smoke/runtime verification).
7. **Only after all of the above succeed** may the promotion be certified as complete.

## Blocking behavior (on any failure)

If **any** verification fails or cannot be evidenced:

- The promotion remains **In Progress** or **Failed** — never Complete.
- Vacilando **must not** certify, close, merge, or recommend promotion.
- The discrepancy is surfaced as a **blocking issue** with the failing layer named.

There is no partial certification and no "certify now, verify later." The unit is deployed and verified together, or it is not deployed.

---

## Standing governance rule — Deployment Certification

> **Deployment completion requires verification of all deployment artifacts, not only application code. Database schema, migrations, migration history, and application deployment are treated as a single deployable unit. Mission completion, certification, merge approval, and staging promotion are blocked until deployment verification succeeds across every layer.**

This applies to mission completion and to the governed promotion actions Vacilando already owns (`repository.push`, `promotion.open_pr`, `merge.execute`) — the certification gate stands in front of all of them.

---

## Director behavior

Director must **not** end a deployment with:

```
Deploy succeeded
✓ Mission Complete
```

Director must instead run an automatic **Deployment Certification** checklist and report one of two honest terminal states:

```
Deployment Certification
  ✓ Application deployed
  ✓ Database migrations applied
  ✓ Migration ledger matches repository
  ✓ Schema version verified
  ✓ Health checks passed
  ✓ Runtime verification passed

Status
  CERTIFIED FOR STAGING
```

or

```
Deployment Certification
  ✓ Application deployed
  ✕ Database migrations failed

Status
  NOT CERTIFIED

Blocking Issue:
  Repository and deployed schema diverged.
```

**A ✓ may be shown only when that layer was actually verified against its authoritative source.** An unverified ✓ is a rule violation — the check must fail-closed to ✕ / *unknown*, never optimistic green.

### What each check actually verifies (so it cannot be faked)

| Check | What it proves | Authoritative source | Fails → blocking issue |
|---|---|---|---|
| Application deployed | the new build is live and serving | deploy target status + health endpoint | app not live / old build |
| Database migrations applied | every pending migration ran to completion | migration apply result on the **deployed** DB (not a preview DB) | a migration failed or never ran |
| Migration ledger matches repository | applied versions == `supabase/migrations/*`, both directions | diff of deployed applied-ledger vs repo ledger | pending, skipped, or extra (drifted) versions |
| Schema version verified | app's expected schema version == deployed schema version | app schema expectation vs live DB schema | app and DB on different schema versions |
| Health checks passed | the deployed unit responds correctly | post-deploy health/smoke checks | health/smoke failure |
| Runtime verification passed | required behavioral post-deploy checks pass | the mission's declared post-deploy verification | verification failure |

---

## Scope and realization boundary

**Scope: global.** Not capability-specific. Every future staging promotion enforces it automatically.

**Realization boundary (honest).** This document freezes the *rule* and the *behavior*. The rule's integrity depends on the checks being **real**: the certification checklist must execute genuine verification against the deployed application and the deployed database before it may render `CERTIFIED FOR STAGING`. Until that automated verification is wired to real evidence sources:

- Director **fails closed** — deployment is `NOT CERTIFIED` by default, never optimistic green.
- Certification is permitted only when the operator (or CI) performs the equivalent verification and **records the evidence** per layer; the recorded evidence is what the ✓ stands on.

Fail-closed is the safe default and the one consistent with the rule: absent verification, the honest state is *not certified*, not *assumed fine*.
