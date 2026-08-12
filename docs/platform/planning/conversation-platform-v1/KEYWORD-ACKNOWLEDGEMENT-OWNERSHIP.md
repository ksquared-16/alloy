---
owner: platform
status: canonical
last_reviewed: 2026-08-12
---

# STOP / START / HELP — who sends the acknowledgement

**Decision: the PROVIDER owns it. Alloy must never send one.**

This closes a loose end that had been carried as ambiguous: `keyword_response()`
computes acknowledgement copy that nothing consumes, which reads like an
unfinished feature. It is not unfinished. It is finished, and the copy exists for
a different purpose.

## The evidence

1. **Alloy sends SMS through a Twilio Messaging Service.**
   `communication_message_sender.py` reads `messaging_service_sid` from the
   binding config and sends via `twilio_client`.
2. **Twilio answers STOP / START / HELP at the provider layer.** For US A2P
   traffic this is carrier-mandated and cannot be declined; Advanced Opt-Out on
   the Messaging Service is where the copy is configured if it needs to change.
   Twilio also blocks further traffic to an opted-out number regardless of what
   Alloy believes.
3. **Nothing in Alloy sends the computed copy.** Verified by source scan;
   `inbound_keyword_handler` places it in a returned record and no send path
   consumes it.

## Why "both" would be wrong

A parent texts STOP. Twilio replies "You have been unsubscribed…". If Alloy also
replied, that parent receives **two** messages — the second from the system they
had just told to stop. Poor experience, and a compliance risk on the exact
interaction where compliance matters most.

This is also the most likely way the loose end gets "fixed" incorrectly: seeing
copy that is computed and never sent, the natural instinct is to wire it up.

## What Alloy does instead, and why the copy still exists

- **Enforces** the preference change itself (STOP suppresses all SMS to that
  endpoint, including transactional — `contracts/communications/sms-keywords.json`).
  Alloy does not rely on Twilio for its own suppression.
- **Records** the keyword and the acknowledgement copy on the conversation, so the
  operator can see what the family was told without opening a provider console.
- **Keeps the copy in the shared contract** next to the keyword vocabulary, so the
  text an operator sees matches what the provider is configured to send. If those
  ever diverge, the contract is the place to reconcile them.

## Guard

`backend/tests/test_keyword_response_not_sent.py` fails the build if
`keyword_response()` is referenced outside the contract loader and the recording
handler, or if it reaches a send-shaped call. The comment on the function itself
states the rule at the point someone would change it.

## Operator truth is unaffected

STOP / START / HELP remain visible in the conversation, the preference change is
applied and auditable, and the certified suppression behaviour is unchanged
(Block B, 8/8). Nothing about this decision alters what the operator sees.

## If this ever needs to change

If a deployment turns Advanced Opt-Out off, or uses long codes outside the US
where the provider does not answer, Alloy would need to own the acknowledgement.
It must then go through the ONE canonical outbound runtime
(`enqueueCanonicalOutboundMessage`) via a sanctioned seam — never a direct
provider write from Python, never a hand-inserted queued row, never a second
sender. That is a product decision with a compliance dimension, not a code tidy-up.
