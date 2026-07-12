# Processing Identity Resolution V1 — Staging Rollback Plan

**Assumption:** The sprint has been promoted to staging, but not production.

**Principle:** Prefer deployment/Git rollback while preserving additive Processing data. Do not restore two simultaneous identity writers. Schema reversal is appropriate only for a disposable/no-traffic staging database or after an explicit data-retention decision.

## Trigger conditions

Rollback for:

- Cross-tenant access or authorization bypass.
- Identity writes before plan approval/explicit commit.
- Duplicate or wrong-household creation caused by the new path.
- Executor atomicity, idempotency, stale-plan, or reference-resolution failure.
- Migration replay/apply failure that cannot be repaired additively.
- Reconciled source conflict that restores legacy direct writes.

## Immediate containment order

1. Stop operator execution access by rolling back the application deployment.
2. Stop D4/D5 source intake on the same deployment boundary.
3. Preserve database rows and logs; do not delete attempts or cases.
4. Capture affected org, case, plan, approval, attempt, operation, exception, and created record IDs.
5. Decide whether to repair forward or restore the prior staging database.

There is no V1 runtime feature flag or environment toggle. Containment is a deployment rollback, not a toggle flip.

## Feature rollback

- Revert to the last known-good staging application build as one unit.
- Do not selectively restore `applyFormIntakeSafe` or `executeCreateLeadHouseholdCommit` while Processing intake remains active.
- If prior staging behavior must be restored, restore the complete prior application/deployment and confirm new submissions cannot enter both paths.
- Keep C1 comparison helpers inert; they are not a fallback writer.

## Migration rollback order

If staging is disposable and contains no retained Processing data, reverse conceptually in this order:

1. `20260718140000_has_org_role_security_definer.sql` — restore the previously reviewed function definition only with security approval.
2. `20260718130000_processing_identity_d2_rpc_customer_persons_fix.sql` — restore the prior D2 function body only if the D2 function itself remains.
3. `20260718120000_processing_identity_d4_d5_source_kinds.sql` — remove `create_lead` check support only after all such case rows are removed/restored.
4. `20260717130000_processing_identity_d2_executor.sql` — remove executor function/triggers before dropping attempts/exceptions.
5. `20260717126000` back through `20260717120000_processing_identity_d1_*` — remove RLS/guards/indexes before approvals, operations, and plans.
6. `20260716140000_processing_identity_b3_resolutions.sql` — remove resolution objects after plans/operations no longer reference them.
7. `20260716130000_processing_identity_b2_facts.sql` — remove facts/extensions only after dependent data is gone.
8. `20260716120000_processing_identity_b0_tenant_security.sql` — restore prior policies/FK only as the last step and only with security review.

The repository has forward migrations, not reversible down migrations. Any reversal SQL must be authored, reviewed, and tested as a new staging-only migration or performed through database restore. Never edit already-applied migration files.

## Data considerations

- `processing_facts` and plan/attempt records are audit lineage. Preserve by default.
- Do not hard-delete persons/customers/children/leads merely because they were created by a committed attempt.
- Before correcting a wrong link, inspect attempt operation IDs and downstream relationships.
- Use append/supersede/correction semantics; do not mutate immutable facts/plans/approvals/attempts.
- If a database restore is used, reconcile external side effects and submissions received after the restore point.

## Replay safety

- Source replay must reuse the same source/idempotency identity and return the existing Processing Case.
- Executor replay must reuse the same execution idempotency key and must not duplicate committed records.
- A superseded/revised plan requires a new approval; never transplant approval to another plan hash.
- After deployment rollback, quarantine new source replay until the single authority path is confirmed.

## Processing Cases

- Preserve cases and sources during application rollback.
- Mark affected cases for operator review through existing state/exception mechanisms; do not invent a rollback status.
- Cases with no identity commit can be safely resumed after forward repair.
- Cases with committed attempts require reconciliation against canonical records before retry.

## Commit Plans and approvals

- Preserve all plan versions and approvals.
- A plan created by the rolled-back build must be revalidated against the restored runtime before execution.
- Do not execute a plan whose command schema or hash behavior changed during rollback.
- Rebuild/reapprove after any material correction or integrated-runtime change.

## Executor behavior

- Stop new invocations before database changes.
- Preserve `processing_commit_attempts` and `processing_exceptions`.
- For partial attempts, rely on recorded operation results; do not rerun blind.
- Compensate only operations explicitly modeled as reversible.
- Never auto-delete created identity records as compensation.

## Direct-write retirement

- E1 is not rolled back independently.
- Restoring a legacy writer while D4/D5 Processing intake remains reachable creates dual authority and is prohibited.
- If the whole application is rolled back to a pre-sprint build, verify the Processing source adapter is also absent and document the temporary staging-only authority.
- A forward repair should retain E1 and fix the canonical path.

## Verification after rollback

- [ ] Prior application health restored.
- [ ] Exactly one source authority per Create Lead/public form.
- [ ] No new executor attempts after containment timestamp.
- [ ] No cross-org Processing/identity access.
- [ ] Affected cases/plans/attempts retained and inventoried.
- [ ] No duplicate records from source or executor replay.
- [ ] Schema migration history matches the restored database.
- [ ] Staging-only rollback and forward-repair decision recorded.
