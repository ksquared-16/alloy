# WS1 V2 GOVERNED RECONCILIATION — RUNTIME PERFORMANCE V2 CANDIDATE

Run `erun_69be6185432e4b4b` · lane `lane_73a897409906` · repository `ksquared-16/alloy`
Branch `fix/placement-truth-certification`

**STATUS: `RECONCILED_CERTIFIED_CANDIDATE_READY_FOR_WS1_PREFLIGHT`**
Nothing was pushed, promoted or deployed. The WS1 obligation remains **OWED**.

## 1. Remote truth at reconciliation time

| | |
|---|---|
| Pre-reconciliation candidate | `a39c984352235930ccaaa03db64af2803efa6d86` (certified closeout) |
| `origin/staging` fetched | `e383e48c63ec94e8377e87d4daef137567f1f300` |
| Preflight target | `e383e48c63ec94e8377e87d4daef137567f1f300` |
| **Movement since preflight** | **none — zero commits** |
| Merge base | `b875be32d976f3826fc45b68aa24b3bfcb742201` |
| Divergence | candidate +40 · staging +171 |
| **Resulting reconciled candidate** | **`01c81af30fa1ffb97507cf4e073a6d6716a8a2cf`** |

Staging had not moved, so the recommended strategy remained appropriate and was confirmed against
current remote truth rather than assumed.

## 2. Strategy

**Merge `origin/staging` into the candidate** (`--no-ff`), not a rebase. The programme's 26
certification records name their own lineage; an ancestry-preserving merge keeps that intact and puts
the reconciliation *above* the certified closeout. Nothing was amended, squashed or rewritten.

## 3. Conflicting surface

Seven files changed on both sides. Five auto-merged:

`CurrentWorkCard.tsx` · `HealthSafetyCard.tsx` · `InlineOpportunityFocusPanel.tsx` ·
`composeProvisioningAnswerForRoute.ts` · `workUnitProvisioningAnswer.ts`

Two conflicted, exactly as canonical preflight predicted: **`AttendanceCard.tsx`** and
**`FinancialsCard.tsx`**. Both were resolved by composing the intents; neither side was taken wholesale.

### AttendanceCard

* **Candidate intent (A).** Reserve the card's footprint while it resolves, so a subject switch does
  not collapse it to a one-line body. Keyed to `!loading` — the card's own fetch — under the
  programme's law that *settled means the card has an answer, whatever the answer is*.
* **Staging intent (B).** The attendance producer moved **into the root provisioning lifecycle**
  (`context.operationalProjection.cards.attendance`). The card no longer bootstraps its own fetch;
  `load()` survives for the post-command re-read and the depth window. Readiness is the root's, and a
  missing projection is `provisioning` — explicitly so the card does not say "No attendance record."
  about an absence it has not been told about.
* **Integrated.** Both signals are the same concept measured in two places, so the reserve tracks the
  union staging already uses for its copy:

  ```ts
  const reservedGeometry = useReservedCardGeometry(!(loading || provisioning));
  ```

  The hook moved below staging's `provisioning` derivation. `ref` remains on **both** roots and
  `style`/`data-attendance-reserved` on the pending root. Reserving on anything narrower would leave
  the collapse the repair exists to remove, in the window that is now the common one on a cold panel.

### FinancialsCard

* **Candidate intent (A).** (i) `requestQuery` — `load` depended on `[customerId, scopedMemberId]`
  while the request depends on the first of them present, producing a byte-identical duplicate per
  entry; (ii) reserved geometry via `shellRef` / `loadedHeightRef` with the `ref` on **both** roots.
* **Staging intent (B).** The financials producer moved into root provisioning under the same
  `fin.read` gate; `deniedRead` makes a 403 a refusal rather than an empty account; `deepLoadedForRef`
  loads the full model once per account **on interaction**; payer identity on recorded payments; and
  `data-financials-account` on both roots.
* **Integrated.** Both kept, plus one genuine correction the merge forces:

  ```ts
  const reservingAccount = !vm && !deniedRead && (loading || subjectStillResolving || provisioningAccount);
  ```

  The reserve was `!vm`, written when the only way to have no vm was to be loading one. Staging gave
  this card three further vm-less answers — a permission refusal, no resolvable subject, no account —
  and each is a settled sentence entitled to its own size. The reserve is now exactly the condition
  under which the card renders "Loading the account…", which is the same expression staging uses two
  lines below it. `requestQuery` is retained and now also protects staging's **new** depth effect
  (`[overlay, customerId, scopedMemberId, load]`) from re-issuing an identical deep load.

## 4. Current-staging behaviour preserved (verified in the merged tree)

| Behaviour | Proof |
|---|---|
| Attendance renders the root projection, not its own bootstrap | `provisioned` / `provisioning` present; `openHistory` present (2 uses) |
| Attendance depth window on interaction | `depthLoadedForRef` retained |
| Financials refusal is not an empty account | `deniedRead` present; `permission` empty-state retained |
| Financials depth-on-interaction | `deepLoadedForRef` + overlay effect retained |
| Payer identity on payments | `payPayerPersonId` (4 uses) + `data-financials-payment-payer` |
| Account identity on the card | `data-financials-account` on both roots |
| Everything else staging changed | 5 overlapping files auto-merged; the failing staging-owned surface is **byte-identical** to `origin/staging` (§6) |

## 5. Runtime Performance behaviour preserved

| Repair | Proof |
|---|---|
| F-4 stable card surface | `key="focus-panel-body"` present |
| Payload convergence (S5-3 / S6-1) | held-id fields present in `workUnitProvisioningAnswer.ts` |
| S4-1 reserved geometry | present in Attendance, Health, Current Work, Financials |
| S8-3 one eligible-children owner | `loadEligibleEnrollmentChildren` present |
| S18-1 Work View fan-out removed | the inactive-view sweep is **absent** |
| S19-1 Workspace progressive reveal | `WorkspacePendingSurface` wired |

## 6. Re-certification

The strongest existing programme is the branch's own ten suites under `web/tests/runtime/`. Run
against the reconciled tree:

**10 files · 113 tests · all passing.** `vac run typecheck` → **0**.

Two locks were updated — not relaxed — to state the reconciled contract: the Attendance predicate
(`!(loading || provisioning)`, with the copy and the reserve asserted to agree) and the Financials
reserve (`reservingAccount`, plus staging's `data-financials-account` on the same root).

**Pre-existing failures, attributed rather than absorbed.** A full `tests/runtime/` sweep shows 12
failures in 6 files. Ten of them are **not** caused by this reconciliation:

* `d1ProvisioningAnswer` · `d1ProvisioningAnswerRoute` · `childIdentityOwnerContract` ·
  `subjectAuthorityNoSilentSubstitution` — all fail inside staging's own
  `documentActorFromAdminGate` (`Cannot read properties of undefined (reading 'permissionKeys')`).
  Every file in that surface is **byte-identical to `origin/staging`** in the merged tree and the
  candidate never touched any of them.
* `workUnitProvisioningPrefetch` ("re-warms after the TTL lapses") — the module is **byte-identical to
  the certified candidate** after the merge, so the expectation was already failing on the candidate;
  the merge changed nothing there.

These belong to their owners, not to this reconciliation. They are reported to WS1 rather than fixed
here.

## 7. Overlapping active work — sequencing findings

* **`origin/agent/focus-panel-attendance-producer`** (`71d59d563`): **both** of its commits are
  patch-equivalent to commits already in staging (`git cherry` reports `-` for each). Its intent is
  already in staging, and this reconciliation therefore *inherits* it rather than overwriting it. The
  branch appears landed and retirable.
* **`origin/agent/financials-11a-repair2`** (`34ac34f48`): **none** of its 6 commits are in staging
  (`git cherry` reports `+` for each). It touches
  `web/components/admin/focusPanel/cards/FinancialsCard.tsx` **and**
  `web/components/operationalCards/FinancialsCard.tsx`. It is not part of this reconciliation and was
  not merged. Whichever of the two lands second will meet the other on the same file — a sequencing
  decision for WS1, not a conflict this lane should pre-empt.

## 8. Deployment

`DEPLOYMENT_REQUIRED` remains true and was **not executed**.

```
ALLOY_STAGING_PROMOTIONS_CAUSED: 0
ALLOY_VERCEL_DEPLOYMENTS_CAUSED: 0
VACILANDO_RELEASES_CAUSED:       0
```

Nothing was pushed. The branch is local, 41 ahead of `origin/staging`.

## 9. Lineage

```
01c81af30  merge: reconcile current staging into the Runtime Performance V2 candidate
   ├─ a39c98435  (certified closeout — ancestor: YES)
   └─ e383e48c6  (origin/staging — ancestor: YES)
```
