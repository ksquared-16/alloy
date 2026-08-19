---
owner: platform
status: certified
last_reviewed: 2026-08-19
tenant: Firefly (hosted) · org 93667019-bd28-49b5-a688-acc9bb1e0a19
method: read-only inspection of the hosted database and provider state
---

# Live Email certification — 2026-08-19

The controlled round trip that the inbound Email runtime had owed since it was built.
Everything below was observed, not inferred; nothing was reconstructed from a screenshot.

    Alloy  →  Gmail  →  reply  →  kelly@workwithalloy.com  →  Gmail forwarding
          →  hidden Resend destination  →  email.received  →  signed webhook
          →  retrieval under the ORG-OWNED credential  →  canonical Email
          →  Communications projection  →  Alloy reply  →  same Gmail thread

## Verdict

**RFC THREADING PASS.** `correlation_method = references`.

An Alloy-minted `Message-ID` survives an administrative Gmail forwarding hop. That was the
single unproven assumption the whole receiving architecture rested on, and it is the strong
outcome rather than the consolation one — `endpoint_provenance` would have looked identical
in the UI while meaning the evidence had been stripped.

**One detail worth keeping.** Correlation matched the OLDER Alloy id in the chain, not the
most recent outbound. Gmail's `In-Reply-To` names the immediately preceding message — a
Gmail id — while `References` accumulates the whole thread. Any Alloy token in that chain is
sufficient, which is exactly why the correlation model consults both and why a design that
only read `In-Reply-To` would have failed here.

## Inbound — certified

| Proof | Observed |
|---|---|
| Provider receipt | `b132bc58-d711-476e-af3d-fa3c16cd7c11` / provider `9fb24498-92c0-4642-891a-70cb80f48ccd` — **exactly 1** |
| Canonical inbound message | `833dbea4-43f1-4805-abe7-cacf383d5fc1` — **exactly 1**, **0 duplicates** |
| Sender | `kelly.kurzman@gmail.com` |
| Visible recipient | `kelly@workwithalloy.com` — preserved across the hop |
| Hidden destination | transport-only; **0** canonical rows name it |
| Person resolution | `e5df3f17-…` **Kelly Kurzman**, `single_person_match` |
| Family hub | customer `0658832a-…` **Kurzman Family** |
| `Message-ID` | `<CAC+XaiqpYrtqbA=-LdsjHk3R4HEZOgNSq=UBohKrL9vnUmh6aw@mail.gmail.com>` |
| `In-Reply-To` | `<CAC+Xaipgd8qj7n1FSxJMyehH=AJaHBcPn9vvWj79LsVjqbH3aQ@mail.gmail.com>` |
| `References` | contains `<alloy.7e1c023a-…@workwithalloy.com>` |
| **`correlation_method`** | **`references`** |
| Canonical thread | `b98d8f65-023e-41e6-b8fc-296bab311df3` — the same thread |
| Subject conversation | `Re: Alloy live email round trip 2026-08-19` — inherited, not re-authored |
| Attention | `needs_response` |
| Workflow event | **exactly 1** `message_received` |

## Outbound — certified

| Proof | Observed |
|---|---|
| Canonical outbound | `4d264299-fcfc-4687-a3f1-24a4010249c5` — **exactly 1** |
| Thread | `b98d8f65-…` — the same conversation |
| Minted `Message-ID` | `<alloy.4d264299-…@workwithalloy.com>` |
| `In-Reply-To` | `<CAC+XaiqpYrtqbA=…>` — the inbound reply it answers |
| `References` | both Alloy ids and both Gmail ids, in order |
| Provider | `resend` / `37413774-4212-470d-bf4c-bb3fa2b034c1` |
| Delivery state | **`delivered`** |
| Delivery events | `sent`, `delivered`, `opened` — **3 for one message, no duplicates** |
| Gmail | received in the same external conversation |

The delivery events matter beyond this test: before today, **zero** Resend webhook events of
any kind had ever been recorded. Their arrival closes the loop opened by the diagnosis that
found the webhook path dead.

## What this test found that certification could not

Two defects, both operator-visible, neither in transport. They are recorded here because a
live test that reports only its successes is not a certification.

**1. Replying does not clear `needs_response`.** `attention_state` is written by the inbound
path alone; no outbound path clears it. The thread still reads `needs_response` after the
operator answered, and `commandCenterViewModel` keys its queues off exactly that column — so
an answered conversation keeps asking to be answered.

**2. The reply inherited the wrong subject.** The outbound carries
`Re: We're Glad to Hear From You` — the thread's OLDEST message, from 2026-08-07 — rather
than the conversation actually being replied to. The RFC headers are correct, so Gmail
threads it properly and the recipient sees it in the right place; what is wrong is the
subject line itself.

Neither is a threading or delivery failure, and neither was reachable by any offline test:
both required a real conversation with real history.

## Preconditions this test established the hard way

- **Gmail silently spam-filters test replies, and never auto-forwards spam.** Two apparently
  identical attempts vanished with no trace anywhere — no receipt, no error, nothing to
  diagnose. Check the forwarding mailbox's Spam folder first. Moving a message out of Spam
  does not retroactively forward it.
- **Google's forwarding confirmation is sent directly to the destination**, not through the
  mailbox. Its arrival proves the destination is reachable and Alloy ingests correctly; it
  proves nothing about whether the forwarding rule forwards.
- **Retrieval must use the organization's own credential.** A deployment `RESEND_API_KEY` is
  the fallback for a binding that names no org-owned credential, never the authority.

## Blanket forwarding must now be disabled

The forwarding rule is test infrastructure. Within minutes of it going live, a third party's
Google Calendar invitation (`christina@intentlyco.com`) became a permanent canonical message
in the tenant — `unknown_sender`, `correlation_method = none`, a conversation with nobody.
The deterministic ingress gate would have refused it
(`WOULD_REJECT / REJECT_NO_ADMITTING_EVIDENCE`), but it is observe-only and not deployed
here, so it prevented nothing and recorded nothing.

That is the predicted mixed-inbox exposure, no longer hypothetical. See
`docs/platform/planning/conversation-platform-v1/FUTURE-OPERATIONAL-MAILBOX-INTEGRATION.md`,
which remains parked.
