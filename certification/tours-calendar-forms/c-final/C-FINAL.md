# C-FINAL — Communications consent, suppression and certification

**Outcome: COMPLETE_COMMITTED_NOT_PROMOTED** for C1–C3 and the C4 job, with two items that cannot be closed
from this lane: C4 has **not executed in GitHub Actions** (that needs a push), and the staff calendar invite is
a recorded finding for its owners. No push, PR, merge, deployment, staging migration or release request.

| | |
|---|---|
| Branch | `sprint/tours-polish-p1` (Enrollment lane worktree; the Communications lane has no live run and its worktree is merged and owned by another provider — Communications commits are appended here, labelled) |
| Start | `1b967b172` (Enrollment P1 evidence; product candidate `5d3a73697`), staging `24b03991c`, 0 behind |
| Commits | `a8c05a90d` C4 · `d2e04e0eb` C2 · `d3dba5b7f` C1 · `723b76422` legacy SMS gate · `1b778748a` live certification · `83c7086e9` docs (**certified candidate**) · build receipt |
| Real database | shared `alloy-cert` (`web/.env.certification.local`), Northwind synthetic tenant |
| Schema / migrations | none |

## C1 — operator-visible consent and provenance

**Root cause of the `public_intake` provenance.** Two layers. (1) Writer: a preserved opt-out went through the
full upsert, overwriting `communication_preferences.source` with `public_intake` (the row then claimed the
inquiry set the opt-out) and dropping the capture's evidence. (2) Read model: "last change" was the newest
event, whatever it did. Both fixed (`d3dba5b7f`): the preserve path appends the event only, with its evidence in
the existing `metadata` column; the view takes provenance from the last event that *changed* the state (falling
back to the row's own source for rows written without an event). Existing events are untouched (append-only).

Operators see, on the person (Household card → Communication preferences): marketing email / SMS state, "Set by
<source> · <date> · wording <version>" or "No consent on record", effective eligibility from the canonical
evaluator ("Can be sent now" / "Will not be sent — <reason>" / "Unknown"), and per-category history, where the
inquiry reads "asked to opt in — opt-out kept". On the Processing case: what the family answered, under which
wording, and what Approve did ("Recorded as opted in" / "Not applied — the opt-out stands" / "Nothing recorded").

Evidence: S7 C·5 and C·8 (real DB); `c1OperatorConsentVisibility.test.tsx` (presenter + panel render).
Negative control: with the preserve path back on the upsert, C·8 fails (row source `public_intake`).

## C2 — governed suppression result

`executeLegacyCommunicationsSendAdapter` mapped every missing message id to 500. Now (`d2e04e0eb`) a gate
refusal is `409`, `outcome: "blocked"`, `code: recipient_suppressed` (OPTED_OUT, SUPPRESSED,
MARKETING_REQUIRES_OPT_IN, UNRESOLVED_INBOUND_STOP_HOLD) or `send_blocked`, with `reason`
(`eligibility_blocked:<code>`) and `blocked_communication_message_id` — the convention `canonicalSend` already
uses. Insert/thread failures stay 500. Scheduled sends record the refusal on `last_process_error` (status
`failed`, never retried automatically). Evidence: S7 C·12 — the direct send returns 409 naming the blocked row;
no deliverable row exists. Unit: `c2LegacyAdapterSuppression.test.ts`.

## C3 — unsubscribe and eligibility, end to end (S7, `alloy-cert`, 23/23)

| # | Scenario | Evidence |
|---|---|---|
| 1 | Eligible marketing email carries an unsubscribe link (direct and provider paths); transactional carries none | C·9 |
| 2 | The intended recipient uses it (GET asks, POST acts) | C·11 |
| 3 | Preference persists, event `recipient_unsubscribe` | C·11 |
| 4 | Later marketing suppressed (direct, scheduled) | C·12 |
| 5 | SMS marketing consent unchanged by the email unsubscribe | C·11 / C·12 (`sms_marketing: opted_in`) |
| 6 | A send scheduled while opted in is re-checked at dispatch and refused | C·12 (`sched-pre-unsub` → 409 `recipient_suppressed`) |
| 7 | Workflow sends cannot bypass: canonical mirror refused (TS, real DB); legacy `public.messages` SMS refused at dispatch (Python) | C·12; `test_message_sender_qa_refuse` |
| 8 | Cross-tenant and forged tokens refused, nothing written | C·11 |
| 9 | Expired and malformed tokens refused | C·11 |
| 10 | Repeat inquiry cannot re-enable an opt-out | C·8 |
| 11 | Tour confirmations only after Approve and an approved booking, once | 8·9·10, 11, 12, 13 |
| 12 | Unapproved tour: no message, reminder or calendar invite | 4·5·6·7; pending_approval test |

**Defect found and fixed (`723b76422`):** a workflow's `create_message` writes a legacy `public.messages` SMS
row, which `process_queued_messages` sent through Twilio with no consent check. It now passes
`revalidate_for_dispatch`; a legacy row has no eligibility record, so it is refused (`policy:SNAPSHOT_MISSING`).
**Behaviour change for the Director:** workflow `create_message` SMS stop transmitting until workflows send
through the canonical enqueue with a category. Independent commit — can be taken or dropped alone.

Provider delivery was not exercised: evidence is canonical enqueue, blocked rows and the dispatcher's decision
(fakes for Twilio/Resend), not external delivery.

## C4 — Python CI

`.github/workflows/backend-comms-tests.yml` (`a8c05a90d`): Python from `backend/.python-version` (3.10.5),
`pip install -r backend/requirements.txt` only, stdlib `unittest`, no credentials; runs
`test_inbound_sms_keywords`, `test_email_thread_headers`, `test_keyword_response_not_sent`,
`test_dispatch_eligibility`, `test_message_sender_qa_refuse.TestMessageSenderQaRefuse`.
Local execution (declared deps, Python 3.9.6 — no 3.10 on this host): 58/58 for four modules; the keyword
module's 25 tests pass when its 3.10-only annotation is evaluated lazily (temporary copy; repository file
unchanged). **Not yet executed in GitHub Actions** — it runs on the first PR touching `backend/**`.
Excluded: `TestBuildInfo` (needs undeclared `httpx`); `test_sms_inbound_fixes` (needs undeclared `pytest`).

## Staff calendar invitation — classification: configured but unreachable

`sendTourInternalCalendarInvite` resolves recipients and builds the `.ics`, and the Python sender attaches
`metadata.calendar_invite`; but it enqueues `audience: "internal"` on **email**, which `evaluateEligibility`
refuses (`INTERNAL_TO_PROVIDER`). Proven on the real DB (S7 C3·T): every row `blocked`,
`policy:INTERNAL_TO_PROVIDER`. Already recorded as debt in `communications-platform.md`. Not repaired: it needs
a policy decision (a staff-recipient send class, or an explicit exception to the internal-audience rule) —
**owner: Communications policy + Tours**. Separately, `tour_comms.ics` is parsed but has no consumer (dead
configuration; family links are always included) — **owner: Tours**.

## Validation (code candidate `1b778748a`; docs-only `83c7086e9` built)

| Check | Result |
|---|---|
| S7 live suite (`alloy-cert`) | 23/23 |
| Unit: c1OperatorConsentVisibility + c2LegacyAdapterSuppression | 19/19 |
| `tests/communications`, `tests/processing`, `tests/tours`, `tests/pos` | 4135 passed, 19 failed, 31 skipped — all 19 fail identically on base `1b967b172` (probe worktree): 18 Communications schema/warm-cache/source-contract guards, 1 `formDraft` |
| Python C1 set | 58/58 + 25/25 (see C4) |
| `vac run typecheck` / `typecheck:tests` | PASSED |
| `npm run prebuild` | exit 0 |
| `vac run build` | **PASSED** on `83c7086e9` (tree `aae0f65862b5313a`, request `req_1793192970645158_75600`); the next commit is this record only |

## Enrollment integration

No lead-creation or tour-booking code changed. Approve's consent commit, replay (`replayed: true`), duplicate
inquiry identity paths and preserved opt-outs are re-proven by S7 (C·5–C·8, 11, 13, 14·17).
