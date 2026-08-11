---
owner: platform
status: evidence
last_reviewed: 2026-08-11
source: official Resend documentation
---

# Resend inbound (Receiving) — the provider contract

Established from official Resend documentation, not from examples, so it stops
being tribal knowledge. Verified 2026-08-11.

Sources:
- https://resend.com/docs/dashboard/webhooks/event-types
- https://resend.com/docs/webhooks/emails/received
- https://resend.com/docs/dashboard/receiving/introduction
- https://resend.com/docs/api-reference/emails/retrieve-received-email

## Resend DOES support receiving

The earlier repo finding ("Resend does not offer inbound receiving") is **stale**.
`email.received` is a documented webhook event: *"Occurs whenever Resend
successfully receives an email."*

## The contract is TWO STEPS, not one

This is the correction that matters most, and it invalidates any design assuming
the webhook carries the message:

> "Webhooks do not include the email body, headers, or attachments, only their
> metadata. You must call the Received emails API or the Attachments API to
> retrieve them."

### Step 1 — `email.received` webhook (Svix-signed, metadata only)

```json
{
  "type": "email.received",
  "created_at": "2026-02-22T23:41:12.126Z",
  "data": {
    "email_id": "56761188-7520-42d8-8898-ff6fc54ce618",
    "created_at": "2026-02-22T23:41:11.894Z",
    "from": "onboarding@resend.dev",
    "to": ["delivered@resend.dev"],
    "bcc": [], "cc": [],
    "received_for": ["forwarded@example.com"],
    "message_id": "<111-222-333@email.example.com>",
    "subject": "Sending this example",
    "attachments": [
      { "id": "…", "filename": "avatar.png", "content_type": "image/png",
        "content_disposition": "inline", "content_id": "img001" }
    ]
  }
}
```

Also documented on `data`: `broadcast_id`, `template_id`, `tags`.

**Present:** provider identity (`email_id`), `from`, `to`, `cc`, `bcc`,
`received_for`, `message_id`, `subject`, attachment METADATA.
**Absent:** `text`, `html`, `headers` — and therefore `In-Reply-To` and
`References`.

`message_id` is *"the RFC Message-ID header value for the email"* — the sender's
own, not Resend's id.

### Step 2 — `GET /emails/receiving/{id}` (Received emails API)

```json
{
  "object": "email", "id": "…",
  "to": ["…"], "from": "…", "created_at": "…", "subject": "…",
  "html": "…", "html_format": "data_uri | cid", "text": "… | null",
  "headers": { "from": "…", "return-path": "…", "mime-version": "…" },
  "bcc": ["…"], "cc": ["…"], "reply_to": ["…"], "received_for": ["…"],
  "message_id": "…",
  "raw": { "download_url": "…", "expires_at": "…" },
  "attachments": [ { "id": "…", "filename": "…", "content_type": "…",
                     "content_disposition": "… | null", "content_id": "… | null",
                     "size": 0 } ]
}
```

## Consequences for Alloy

1. **Retrieval is mandatory, not optional.** No canonical row can be created from
   the webhook alone — it has no body. Correlation cannot run from the webhook
   alone either, because `In-Reply-To`/`References` live in `headers`.

2. **`in_reply_to` and `references` are NOT top-level fields.** They are entries
   in the `headers` map, so they must be read by header name,
   case-insensitively — the documented example map is lowercased
   (`return-path`, `mime-version`), but header names are case-insensitive by RFC
   and this must not depend on the provider's casing.

3. **`received_for` matters for tenant ownership.** For forwarded mail the
   original `to` is the sender's addressee, while `received_for` is the address
   that actually caused Resend to receive it. Ownership must consider BOTH, or a
   forwarded email resolves to no owner and quarantines incorrectly.

4. **`html_format: "data_uri" | "cid"`** means inline images may arrive as data
   URIs embedded in the HTML. The sanitizer must account for that rather than
   assuming remote URLs are the only image risk.

5. **`raw.download_url` exists and expires.** Alloy deliberately does not fetch
   it: raw MIME is not the canonical message model.

## Still requiring live proof

Whether Resend transmits a caller-supplied `Message-ID` on OUTBOUND unaltered,
and whether the inbound `headers` map reliably contains `In-Reply-To` and
`References` for a real reply. Documented behaviour is the contract; one
controlled real-domain test is the evidence. Blocks the "production-ready" claim,
not local implementation.

## Certification — 2026-08-11

**Full regression: 32 of 32** (Block A SMS 11, Block B keywords 9, Email 13, run
together after the convergence deletions). Migration pending count 0.

Email cases certified: active receiving binding; forwarded mail owned via
`received_for` not `to`; disabled binding quarantines; unknown destination
quarantines and is not tenant-visible; In-Reply-To resolves the exact conversation
with a *changed subject*; References resolves when In-Reply-To is absent; forged,
unknown and malformed Message-IDs never correlate; known sender resolves a Person;
shared household address asserts no Person and raises routing attention; duplicate
provider event yields one email; transient retrieval failure writes nothing and
the retry completes it; operator opens an unidentified parent's email in Command
Center and replies with `thread_id` only; quarantine withholds its body.

### What browser certification found that unit tests could not

`communication_messages` carries `subject`, ingestion stored it, and the panel
rendered it — but the thread messages projection never SELECTED it. Every email
conversation rendered with no subject: the first thing an operator reads on an
email, silently absent. Each layer was individually correct, which is exactly why
only the browser caught it.

### Boundary of this evidence

The harness injects a documented `email.received` payload and a documented
retrieval response into the real `ingestResendInboundEmail`. It does NOT stand in
for Svix verification (shared with the outbound delivery events already certified
on that route) or for the live provider round-trip.

## STILL REQUIRED — live provider proof

Inbound email is **not production-ready** until one controlled real-domain test
proves the external chain. It cannot be run from certification, which holds no
provider credentials by design.

Needs, none of which exist today:

1. Resend inbound **enabled on the account** — Resend documents `email.received`,
   but whether this plan has receiving provisioned is unverified.
2. A **verified sending domain** and a **receiving domain with MX pointed at
   Resend**.
3. A **controlled mailbox** to receive and reply from. No customer address.
4. Authorization to send real external email — certification sets
   `ALLOY_CERTIFICATION=1` specifically so nothing leaves the machine.

To capture: the Message-ID Alloy sent; what the destination received; the
`In-Reply-To`/`References` the reply carried; what `GET /emails/receiving/{id}`
returned; any provider rewriting; whether correlation succeeded. No secrets in
evidence.

**If Resend rewrites Message-ID**, the documented RFC path may still work through
the rewrite — the correlation reader is domain-independent and matches on the
`alloy.{uuid}` local part alone. Only a rewrite of the LOCAL PART would break it,
and that would need escalation with the captured headers rather than a second
threading system.
