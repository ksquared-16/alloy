# Processing Identity Resolution V1 — Consolidated Regression Checklist

**Status:** Implemented locally · Locally certified · Awaiting staging reconciliation · Not promoted · Not deployed.

**Use:** Final staging reconciliation and promotion verification. No checklist item authorizes implementation or scope expansion.

## Processing

- [ ] Source replay opens one case/source row.
- [ ] Facts persist normalized value, raw value, confidence, evidence, generation, and correction lineage.
- [ ] Resolution rerun creates a new generation without erasing prior evidence.
- [ ] Review readiness derives correctly from case/facts/resolutions/plan/approval/attempt state.
- [ ] Rejected/blocking subjects prevent plan build.
- [ ] Identity-review gate: same-household same-name child with incomplete DOB → `needs_review`; plan/approve/execute blocked until confirmed.
- [ ] Create-new despite plausible match requires explicit override reason and rejected-candidate audit.
- [ ] Source adapters cannot stamp ambiguous identities as confirmed new.

## Create Lead

- [ ] Flat and household payloads enter Processing only.
- [ ] No person/customer/child/opportunity exists before explicit commit.
- [ ] New family creates the expected graph once.
- [ ] Existing parent/household is reused.
- [ ] Existing child is not duplicated.
- [ ] Success refreshes the canonical queue/Focus Panel projection.

## Public Forms

- [ ] Lead-capture submission creates/reuses a Processing Case.
- [ ] Public response succeeds without identity commit.
- [ ] Submission CRM foreign keys remain null before commit.
- [ ] Operator commit populates intended records/links once.
- [ ] Packet/staff/non-lead-capture behavior remains unchanged.
- [ ] `applyFormIntakeSafe` has no runtime caller and throws if invoked.

## Digital Mailroom

- [ ] Existing case detail renders identity evidence/resolution/plan state.
- [ ] Fact correction appends and causes re-resolution/replan.
- [ ] Operator decisions persist and reload.
- [ ] Approve/execute controls respect readiness and role.
- [ ] Attempt/exception errors are operator-safe.
- [ ] No parallel Processing product surface is introduced.

## POS

- [ ] Existing document upload/classification/form-draft behavior remains intact.
- [ ] Non-identity Processing cases continue to open idempotently.
- [ ] Queue/detail projections tolerate new case source kind.
- [ ] No POS document path auto-commits identity.

## Workflows

- [ ] Existing submission and lead lifecycle events still emit at the correct post-commit boundary.
- [ ] External side-effect failure does not roll back committed identity.
- [ ] No duplicate workflow/mutation event on executor retry.
- [ ] No new unregistered event key is emitted.

## Mutations

- [ ] Processing uses registered semantic commands only.
- [ ] Command preview is side-effect-free.
- [ ] Org/subject/target is revalidated at execution.
- [ ] Existing status/mutation runtime ownership is not bypassed.
- [ ] No client-side service-role or direct privileged write.

## Entity model

- [ ] Person remains canonical; Contact remains compatibility only.
- [ ] Parent/Guardian are roles/relationships, not new entities.
- [ ] Household maps to `customers` plus links.
- [ ] Child maps to `customer_members` with optional person backing.
- [ ] Email/phone are signals, not universal unique keys.
- [ ] Participation command hides OCM/process-instance storage detail.

## Record system

- [ ] Queue/case previews are not used as record truth.
- [ ] Post-commit records resolve through canonical entity GET/VM paths.
- [ ] Plan operations cannot contain arbitrary table names/writes.
- [ ] Plan revision supersedes rather than mutates.
- [ ] Corrections append rather than overwrite evidence.

## Security

- [ ] Service role remains server-only.
- [ ] Admin/ops/manager/staff reads are in-org only.
- [ ] Staff cannot write privileged resolution/plan/approval/execution state.
- [ ] Cross-org IDs fail in candidate generation, command handlers, executor, and APIs.
- [ ] Security-definer functions have fixed search path and least necessary grants.
- [ ] No secrets in certification env example or committed files.

## RLS

- [ ] Every new Processing table has RLS enabled.
- [ ] Authenticated org A cannot read/write org B rows.
- [ ] Required in-org roles can perform intended reads.
- [ ] Write policies match operator/service ownership.
- [ ] `has_org_role` does not recurse under authenticated JWT.
- [ ] Service-role certification behavior is explicit.

## Commands

- [ ] Command registry contains only supported semantic operations.
- [ ] Each handler is org-scoped and idempotent.
- [ ] Reference dependencies resolve for create, link/update/no-op, child, lead, and participation.
- [ ] Unknown command fails closed.
- [ ] Merge never executes through ordinary V1 intake.

## Executor

- [ ] No approval → no execution.
- [ ] Wrong plan hash/version → no execution.
- [ ] Superseded/stale plan → no execution.
- [ ] Atomic identity-group failure rolls back the group.
- [ ] Dependent failure records partial outcome/exception without corrupting references.
- [ ] Same execution key returns idempotent result.
- [ ] Retry after partial uses recorded operation state.
- [ ] No-op target IDs seed dependent references.

## Browser smoke

- [ ] Create Lead modal → Processing review → approve → explicit commit.
- [ ] Public form → Processing queue/case → review → approve → explicit commit.
- [ ] Conflict/correction/replan flow.
- [ ] Approval invalidation after material edit.
- [ ] Attempt/exception display and retry.
- [ ] Cross-role control visibility and access denial.
- [ ] No raw status keys, technical payload keys, or service errors shown to operator.

## API smoke

- [ ] Review GET returns org-scoped facts/resolutions/plan/attempts.
- [ ] Correction POST appends a fact and invalidates stale plan state.
- [ ] Resolution POST validates candidate/action.
- [ ] Plan POST builds deterministic version/hash.
- [ ] Approve POST binds actor/version/hash.
- [ ] Execute POST requires valid approval and idempotency key.
- [ ] Replay and wrong-org requests fail safely.
- [ ] Public submit returns success without pre-approval CRM IDs.

## Build and repository checks

- [ ] `npm run cert:processing-identity-full`
- [ ] `cd web && npm run typecheck`
- [ ] `cd web && npm run typecheck:tests`
- [ ] `cd web && npm run lint`
- [ ] `cd web && npm run build`
- [ ] Generated schema references match the reconciled local database.
- [ ] No debug logs, test-only runtime branches, commented-out runtime, replay flag, or source toggle.
- [ ] Working tree clean after committed regeneration/docs.
