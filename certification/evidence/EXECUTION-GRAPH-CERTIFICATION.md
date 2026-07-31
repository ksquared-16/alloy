# Execution graph — certification result

**17 / 17 scenarios pass** (18 including the auth setup step). `rc=0`.

Isolated `alloy-cert` tenant: fresh `db reset`, full migration history, canonical representative
seed, lifecycle guard at `enforce`. Shared Firefly untouched. Raw log:
`certification/evidence/execution-graph-certification-17of17.log`.

| # | scenario | result |
|---|---|---|
| G1 | pristine seed validates and publishes | ✓ `can_publish=true errors=0`, publish 200, revision 1 |
| G2 | deleting a referenced transition is refused | ✓ refused (server 422), draft 1→1 |
| G3 | authored transition writes the DRAFT only, survives reload | ✓ save 200, draft 2→3, projection unchanged |
| G4 | selector offers only this stage's outgoing transitions | ✓ |
| G5 | a valid graph publishes: one revision, one publication | ✓ revisions=2 publications=2 |
| G6 ×6 | every invalid graph is blocked at publish, named in operator terms | ✓ all 422 |
| G7 | legacy bare `stage_key` warns, never preferred | ✓ |
| G8 | the certified path never used the projection-writing PATCH | ✓ 0 observed |
| G9 | a stage with a PRE-EXISTING defect still saves (D3 drafting half) | ✓ save 200; publish still refuses |
| G10 | a real family moves Lead → Tour through the published transition | ✓ `ok=true`, `lead → tour` |
| G11 | an unresolvable graph refuses BEFORE the first durable write | ✓ nothing mutated |
| G11b | the refusal disturbed no revision or publication | ✓ ledger 2/2 unchanged |

---

## G11 — the execution-integrity proof

This is the failure Alloy set out to close: an outcome names a transition the stage does not
declare, the status write lands, the stage move finds nothing, and durable state contradicts
itself while the runtime reports no change.

**Installing the invalid graph.** It can no longer be produced through the product — authoring
refuses it (G2) and the publish gate refuses it (G6). The only route is a direct projection write
through the lifecycle guard's own capability token (`alloy.lifecycle_write`), a deliberate,
named simulation of drift that predates the guard. The guard stays on for every other path.

```
G11 published Lead rule now points at: lead_to_nowhere
G11 subject opportunity=…0002 work=…0002
```

**Durable state, before and after — byte-identical:**

```
BEFORE  lead/open/-  work=open/-/2026-07-31 22:27:04.840537+00  activity=0  members=-:-
AFTER   lead/open/-  work=open/-/2026-07-31 22:27:04.840537+00  activity=0  members=-:-
```

That string covers stage, canonical case status, close reason, work status, work outcome stamp,
the work row's `updated_at`, the activity trace, and every per-child member row. The `updated_at`
match is the strongest single signal: nothing so much as touched the work row.

**The response:**

```
http=400  ok=undefined  changed=false  transaction=aborted
error="This outcome cannot run: lead/reached_family_to_tour:
       Transition "lead_to_nowhere" is not configured on this stage."
```

- refused, with a 4xx
- `transaction=aborted` — not `partially_committed`, so no compensation was needed
- `changed=false` is honest **because** the before/after comparison proves it
- the message names the unresolved reference and the rule that carries it
- `integrity_breach` absent

**G11b** re-reads the configuration ledger as an independent witness: `revisions=2
publications=2`, identical to the values captured before execution. A refusal that had written
and then reverted would leave the same record state; the ledger is what distinguishes preflight
refusal from rollback.

---

## Compensation truthfulness

The valid-preflight → later-effect-fails → compensation-runs scenario is **already proven at the
unit/Postgres level**, and browser execution adds nothing: reaching it requires injecting a
mid-saga effect failure, which the browser cannot do without corrupting real records.

Cited evidence, all passing:

| claim | test |
|---|---|
| every registered inverse is captured | `recordOutcomeTransactionIntegrity.test.ts` — "rolls back the rule targets that DID apply before the failing one" |
| inverses replay newest-first | `executeStageOperatingOutcome.test.ts` — "runs the LAST applied inverse first and the first applied inverse last" |
| a failing inverse does not strand the rest, and all failures are named | `executeStageOperatingOutcome.test.ts` — "keeps going after one inverse throws…" |
| successful compensation restores durable state | `recordOutcomeTransactionIntegrity.test.ts` — "reopens the work when the ACTIVITY record fails" (`workRow.status === "open"`) |
| failed compensation is surfaced | `recordOutcomeTransactionIntegrity.test.ts` — "reports an integrity breach when the work row cannot be restored" |
| never "nothing changed" unless every inverse succeeded | same, and "…when a rule target cannot be reverted": `transaction.outcome === "partially_committed"`, **`changed === true`**, `integrity_breach.step` set |
| the rollback pass is auditable | `recordOutcomeTransactionIntegrity.test.ts` — "traces the compensation pass" |

The newest-first assertion was the one gap — the reversal was implemented but nothing pinned it.
It is now three tests. Order is not cosmetic: a later target's inverse can depend on state an
earlier target's inverse restores, so oldest-first would corrupt rather than error.

**This is saga compensation, not database transaction atomicity.** Effects reach separate
resources; the platform captures an inverse per applied target and replays them in reverse. When
an inverse fails, the platform says `partially_committed` / `changed: true` and names the breach
rather than claiming a clean abort. G11 is the stronger guarantee for the unresolvable-reference
class specifically: preflight refuses before the first write, so no compensation is needed at all.

---

## Known limitations

- **G9 renders no remaining-issues notice.** The planted defect is an execution-graph finding
  (`movement_transition_not_found`), which the publish-time graph validator raises — not an
  operating-contract finding. The drafting-half counter reports operating-contract and
  work-definition findings only. That is D3's split working as designed (drafting sees the stage,
  publish sees the graph), and G9 asserts the publish gate still refuses. A future slice could
  widen the counter to include graph findings for the stage being edited.
- **G2's refusing layer varies** between the client delta gate and the server 422 depending on
  whether the operating-plan editor has registered dirty at click time. Both refuse and neither
  mutates; the spec records which fired rather than requiring one.
- **Per-test budget is 240s** (`CERT_TIMEOUT_MS`), auth wait 180s (`CERT_AUTH_WAIT_MS`). A cold
  Turbopack compile of the admin routes alone consumed 45s on this machine. These are environment
  allowances; no assertion was weakened.
- **Do not run vitest and Playwright concurrently** on this workstation — they starve each other
  and the killed process looks like a product failure.
