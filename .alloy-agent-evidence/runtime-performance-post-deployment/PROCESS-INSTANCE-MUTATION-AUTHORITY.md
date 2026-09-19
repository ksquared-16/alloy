# PROCESS-INSTANCE MUTATION AUTHORITY — CONVERGENCE DETERMINATION

**The objective's second branch is the correct one: extending the Operational Mutation Platform would
be architecturally wrong, and the canonical authority already exists.**

> `process_instances` lifecycle mutation is already owned by the **Processing Identity command
> runtime**, which supplies exactly the commit boundary Step 2 needs. Extending the Operational
> Mutation Platform to write that table would create a **second authority for one table** — the thing
> the master rule forbids.

---

## §1 · COMPLETE WRITER INVENTORY (9 sites, not 3)

| writer | op | fields | class |
|---|---|---|---|
| `lib/pos/processingIdentity/commands/ports.ts:373` | update | **arbitrary patch incl. `stage_key` / `state`** | **PRODUCTION — lifecycle** |
| `app/api/admin/enrollment/assignment-quote/route.ts:159` | update | **`metadata` only** (quote snapshot) | PRODUCTION — metadata |
| `lib/childcareOperational/applyChildParticipationEdit.ts:143` | update | **`metadata`, `updated_at` only** | PRODUCTION — metadata |
| `lib/certification/enrollmentCertificationFixture.ts:736` | delete | — | fixture teardown |
| `scripts/createGroupedConfirmationCertJourney.ts:158` | insert | — | script |
| `scripts/lib/demoRuntimeCleanupPlan.ts:132,141` | delete | — | script |
| `scripts/verifyBosCreateLeadEnrollment.ts:174` | delete | — | script |
| `scripts/verifyProcessInstancesSliceC.ts:46` | delete | — | script |

**No production INSERT exists in TypeScript, and only one migration inserts — a backfill.** Creation
is deliberate: `createProcessParticipation` returns the OCM id and creates no journey, because
creating one at intake put a CHILD journey into a FAMILY stage — cross-grain impersonation, recorded
in the port's own comment.

## THE FINDING THAT SHRINKS THE PROBLEM

The prior slice reported "three production writers bypass the platform". True, but imprecise in the
way that matters:

**Two of the three cannot change the EPP truth Step 2 depends on.** The rollup
(`loadEffectiveEnrollmentStagesByOpportunity`) turns on `stage_key`, `state`, `close_reason_key`,
`context_id`, `subject_type`. Both metadata writers write only `metadata`.

`metadata.location_id` *does* participate — but only to satisfy `allowedLocationIds`, i.e. only for
the four **scoped** callers. The unscoped provisioning path, which is the first-order path Step 2
targets, does not read it.

**So EPP-relevant mutation has exactly one production writer today.**

## §2 / §10 · THE CANONICAL OWNER ALREADY EXISTS

| | Operational Mutation Platform | **Processing Identity command runtime** |
|---|---|---|
| location | `lib/mutations/` | `lib/pos/processingIdentity/` |
| tables written | `opportunities`, `opportunity_customer_members` — **that is all** | `process_instances` (+ identity tables) via ports |
| `process_instances` references | **zero** | owns `updateProcessParticipation` |
| idempotency | per-domain | **mandated**: "every command requires a stable operation idempotency key"; `natural_key` \| `operation_key` |
| atomicity | RPC per domain | **`atomic` — "part of the identity group; must commit in one DB transaction"**, via `execute_processing_identity_group` (plpgsql, `SECURITY DEFINER`, BEGIN/EXCEPTION) |
| reversibility | — | classified `reversible` \| `compensatable` \| `irreversible` |
| target vocabulary | — | **semantic** — "Never a physical table name" |

`process_instances` is **not "simply never converged"** — it is owned elsewhere, by a runtime whose
contracts are more explicit about atomicity and idempotency than the platform we were asked to extend.

**Therefore §6 is already satisfied**: the trustworthy Commit boundary Step 2 requires exists today.

## §3 · WHAT CONVERGENCE ACTUALLY REQUIRES — AND WHAT IT DOES NOT

§3 permits old writer behaviour to be *"explicitly retained because it belongs outside mutation
authority"*. That is the correct disposition here:

- an **assignment quote snapshot** and an **in-place participation correction** carry no process
  lifecycle semantics;
- routing them through identity-group command semantics would distort both;
- but the day either adds `stage_key` to its patch, EPP acquires a second writer with **no idempotency
  key and no atomic group**, Step 2's maintained fact silently goes stale, and nothing fails.

So the deliverable is not a refactor. It is the **guarantee** that keeps the single-owner property
true: a gate that makes that day loud.

## §9 · FIXTURE DISPOSITION

`enrollmentCertificationFixture` only **deletes** for teardown; it establishes no lifecycle state
through a bypassed authority. Classified as fixture teardown and explicitly exempted — not converged,
and not a reason to distort production architecture.

## CERTIFICATION

**5 gates**, `tests/runtime/processInstanceMutationAuthority.test.ts`. The writer set is derived from
the source tree every run, so writer #10 is caught rather than trusted.

| plant | caught | verified |
|---|---|---|
| a metadata-only writer acquires `stage_key` | 2 gates | ✅ |
| a NEW production module writes `stage_key`/`state` | single-owner gate | ✅ |
| the lifecycle port loses optimistic concurrency | port-scoped gate | ✅ (see below) |
| process-instance creation reintroduced at intake | creation gate | ✅ |

**One gate was a no-op and the plant found it.** The concurrency assertion originally read the whole
file — and that guard appears **four times**, once per update port. Deleting it from
`updateProcessParticipation` left three others, so the gate passed on a real defect. It is now scoped
to the function body, and the re-planted defect fails it. Checking the mutated line is what exposed
this; a green plant would otherwise have read as proof.

Seed fleet **38 failed / 1755 passed**, identical 19-file failing set to the staging baseline, zero
new — and the count reconciles exactly (1750 on staging + 5 new gates).

## WHAT STEP 2 INHERITS

1. **Canonical owner:** `updateProcessParticipation` in the Processing Identity command runtime.
2. **Commit boundary:** `atomic` group commit via `execute_processing_identity_group`.
3. **Idempotency:** mandated per command.
4. **Single-writer guarantee:** enforced by gate, including against writers that do not exist yet.
5. **Do NOT extend the Operational Mutation Platform to write `process_instances`.**

**Still true, and unchanged by this slice:** the EPP fact is scope-dependent for four of six callers,
so Step 2 must maintain the **unscoped** rollup as shared truth and leave scoped callers filtering at
request time. Precomputing per-scope values would embed access decisions in shared truth.
