---
title: Communications V1 — sprint close
status: sprint
status_note: Dated close record for the Communications V1 sprint, with hosted evidence.
---

# Communications V1 — sprint close

Closed **2026-08-20** on a **lane-scoped** basis. The global `pending = 0` /
`duplicate versions = 0` condition is superseded for this sprint because the hosted census
proves the remaining failures belong to other lanes.

Evidence: three read-only censuses executed by the Director on the trusted host
(`tha_1345b6b8331487`, `tha_a1c8ef021cdd39`, `tha_40bb8364f3eac5`) under mission
`msn_4a641e54276ab9738f`. This lane never held hosted credentials.

## 1. The collision at `20260818200000`

**`COMMUNICATIONS_BODY_EXECUTED` / `W28_BODY_SKIPPED`.**

Two files claim that version. The ledger records a version, not a file, so it could not
answer; the physical schema did.

| probe | result | control |
| --- | --- | --- |
| `communication_ingress_eligibility_observations.sender_authentication` | **exists** (`text`) | 21 columns visible on the table |
| `…sender_authentication_evidence` | **exists** (`text`) | " |
| `public.replace_role_permission_grants` | **does not exist** | 162 functions found in `public` |

Both probes are absence-shaped, so each carries a control. The function probe can plainly
say yes — it found 162 — which is what makes the absence a finding rather than a silence.

No other migration in the tree adds those columns, and no migration *before*
`20260818200000` defines that function, so neither result is circumstantial.

**Consequence: there is no Communications migration debt.** Every Communications runtime
artifact is physically present on hosted.

## 2. Transferred debt

### To Access & Identity V2 — immediate

**W-28's RPC is absent from production and nothing will re-apply it.** The ledger records
`20260818200000` as applied, so `supabase db push` will skip it forever. `public.replace_role_permission_grants(uuid, text, text[])` does not exist.

A latent fix exists but is **not applied**: `20260818210000` (W-58) defines the same
function and is one of the pending six below. Applying W-58 would create it — that is
Access & Identity's call, not this lane's.

Not repaired here, by instruction.

### Global migration debt — owner by numbering

| version | probable owner |
| --- | --- |
| `20260818210000` (W-58 save_role_definition_and_grants) | Access & Identity V2 |
| `20260818220000` | Access & Identity V2 (W-series block) |
| `20260818230000` | Access & Identity V2 (W-series block) |
| `20260818240000` | Access & Identity V2 (W-series block) |
| `20260819120000` | undetermined |
| `20260819140000` | undetermined |
| `20260818200000` (duplicate prefix) | shared — Communications + Access & Identity |

Ownership above `20260818210000` is inferred from the `w##` naming that the four
`2026081821–24` files share with W-13/W-61/W-28. The last two carry no such marker and are
**not** attributed here rather than guessed at.

None of these are Communications blockers: the census proves no required Communications
runtime artifact is missing.

## 3. Communications hosted acceptance

`has_table_privilege` against the live hosted roles:

| table | anon | authenticated | service_role |
| --- | --- | --- | --- |
| `public.communication_provider_bindings` | S/I/U/D **false** | S/I/U/D **false** | S/I/U/D **true** |
| `public.communication_ingress_routes` | S/I/U/D **false** | S/I/U/D **false** | S/I/U/D **true** |

**Positive control:** `authenticated` on `public.persons` = **true** on all four verbs.

That control is the whole reason the table above means anything. An all-false result and a
broken probe are indistinguishable without a cell that comes back yes.

All six Communications migrations are recorded on hosted: `20260818120000`, `20260818123000`,
`20260818140000`, `20260818160000`, `20260818200000`, `20260819200000`. Hosted orphans: **0**.

**The Communications security promotion is physically proven.**

## 4. Close

- Communications Operationalization — **COMPLETE**
- Communications final hardening — **COMPLETE**
- Communications V1 preference boundary — **COMPLETE**
- Communications security promotion — **COMPLETE**
- Communications sprint — **COMPLETE**

**Qualification.** Email Ingress V2 observe-only evidence carries migration debt from the
cross-lane collision and **remains parked**. The observation columns are present on hosted,
so the gate can record; the capability itself was never authorized for use and is not
deployed. This does not reopen Communications V1.

## 5. Known baseline debt, not reopened

`familyWorkspaceWorkspaceInbox.lifecycle.test.tsx` → *"failed send preserves draft and keeps
the composer expanded"* fails on a textarea that is not found. Proven **not** a regression:
the test file and the composer are byte-identical to `staging`, and it fails identically with
the pre-WS8 four-key preference profile. Tracked as baseline debt.
