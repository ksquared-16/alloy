---
owner: platform
status: closed
capability: director-deliverable-feedback-loop
closed_at: 2026-08-04
closed_commit: fbe918247
last_reviewed: 2026-08-04
---

# Director deliverable feedback loop — capability closeout

**Status: CLOSED** at commit `fbe918247` (`hotfix/vacilando-ui-freshness-flash`).

Operator ↔ Director alignment on an open deliverable review is a first-class,
durable loop: optional certify note, Share context, Request changes, Re-check,
and a visible conversation thread on the outcome card. No further product
behavior for this capability on this branch.

## Operator result

On a deliverable review you can:

1. **Certify** (optional note for Director)
2. **Share context with Director**
3. **Request changes** (reason carried into Director input + worker reopen prompt)
4. **Have Director re-check**
5. See the **Conversation** thread on the same card so alignment compounds

## Certification

| Item | Value |
| --- | --- |
| Closing commit | `fbe918247` |
| Suite | `scripts/local-dev/tests/deliverable-feedback-loop-cert.test.mjs` |
| Companion | `scripts/local-dev/tests/deliverable-review.test.mjs` |
| Evidence artifact | `scripts/local-dev/tests/artifacts/feedback-loop-cert-evidence.json` |
| Result | pass (serial run) |

```bash
cd scripts/local-dev && node --test --test-concurrency=1 \
  tests/deliverable-feedback-loop-cert.test.mjs \
  tests/deliverable-review.test.mjs
```

## Proof matrix

| # | Requirement | Proven |
| --- | --- | --- |
| 1 | Share context stores against exact `missionId` + `reviewId` | Yes — director-messages jsonl |
| 2 | Next Director turn receives full relevant conversation | Yes — `buildDeliverableDirectorInput` |
| 3 | Director output responds to that context (not a blind re-run) | Yes — response quotes operator excerpt |
| 4 | Request changes carries operator reason into Director input | Yes — input + `reopen_reason` in worker prompt |
| 5 | Re-check semantics explicit | Yes — see below |
| 6 | No leak across review / deliverable / mission | Yes — strict `reviewId`; per-mission files |
| 7 | API auth enforced server-side when required | Yes — 401 without Bearer when auth required |
| 8 | Retries do not duplicate messages / Director turns | Yes — idempotency keys |
| 9 | Conversation persists across control-plane restart | Yes — disk jsonl re-read |
| 10 | Certify optional note trigger behavior | Yes — see below |

### Organizations

Vacilando control plane is **single-tenant / local**. Isolation boundary is
`missionId`. Cross-org tenancy is **N/A** (documented on `GET /api/v2/session`).

## Re-check semantics (`RECHECK_SEMANTICS`)

Frozen contract in `deliverable-director-loop.mjs`:

- **`usesConversationThread: true`**
- **`usesCurrentEvidence: true`**

Re-check re-runs Director verification against **current assignment evidence**
**and** injects the operator↔Director conversation for this review into the
Director input. Shared context is not discarded.

## Certify-note semantics (`CERTIFY_NOTE_SEMANTICS`)

- **Empty note:** `records_only` — acceptance history/timeline only; no Director message.
- **Non-empty note:** `records_and_director_message` — also submits `kind=context`
  bound to `reviewId` and runs a Director turn that acknowledges the note.

## Known boundaries (accepted; not polish work)

1. **Director turn is control-plane deterministic** — proves context packaging and
   incorporation; it is not a live frontier-model provider session.
2. **API auth is env-gated** — `VACILANDO_REQUIRE_API_AUTH=1` / `VACILANDO_API_TOKEN`.
   Default local loopback UX may remain open unless configured (see backlog).
3. **Isolated cert seeds** may surface `cannot_verify` when evidence paths do not
   resolve outside the live runtime root; conversation / share / recheck paths
   still certify.

## Implementation map (reference only)

| Concern | Module |
| --- | --- |
| Director input / turn / semantics constants | `scripts/local-dev/lib/vacilando/deliverable-director-loop.mjs` |
| Idempotency | `scripts/local-dev/lib/vacilando/director-idempotency.mjs` |
| API auth helpers | `scripts/local-dev/lib/vacilando/vacilando-api-auth.mjs` |
| Share / changes / recheck / accept wiring | `scripts/local-dev/lib/vacilando/deliverable-review.mjs` |
| V2 routes | `scripts/local-dev/lib/vacilando/v2-api.mjs` |
| Outcome UI + thread | `scripts/local-dev/apps/vacilando/public/mission-control.js` |

## Follow-up

Auth exposure policy for non-loopback binds: see
[`../BACKLOG.md`](../BACKLOG.md) item **CP-AUTH-NON-LOOPBACK**.
