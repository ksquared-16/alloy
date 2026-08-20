---
owner: platform
status: sprint
last_reviewed: 2026-08-19
supersedes: []
---

# Live Email routing — Director setup and controlled test

**Status:** the Alloy side is built and certified in the browser. What remains is
one action only Kelly can take (a routing rule at the organization's own mail
provider) and one controlled round trip.

Until that round trip passes, **Alloy does not claim that an administrative
forwarding hop preserves RFC reply correlation.** Nothing in the automated
certification tests that hop: no external mail provider forwards anything in the
certification environment.

---

## 1. What Alloy already does

| | |
|---|---|
| Visible identity | `kelly@workwithalloy.com` — the `From` a parent sees, and what their Reply targets |
| Hidden ingress destination | an opaque provider address, transport only, never shown to a family |
| Root MX | **unchanged** — stays with the organization's existing mail provider |
| Mailbox access | none. No OAuth, no IMAP, no password, no whole-mailbox ingestion |
| Receiving status | `Routing setup required` until Alloy has **actually received** a message |

---

## 2. Setup — one rule, at the organization's mail provider

1. Open **Organization → Communications → Email**.
2. Under **Mail routing setup**, copy the **Hidden Alloy destination**.
   - If it reads *"No destination has been provisioned yet"*, stop: that is a
     provider call Alloy has to make first, and no rule can be written until it
     exists.
3. In the organization's existing mail provider, add an **address-level routing
   or forwarding rule**:

   ```
   kelly@workwithalloy.com  →  <hidden Alloy destination>
   ```

   Address-level only. Do not forward the whole mailbox, and do not change MX.
4. Leave Resend Receiving **off** on the root domain. It must stay off.

---

## 3. The controlled test

**Do not run this until step 2 is done.**

1. In Alloy → Communications → **New Email** to a controlled external mailbox
   you own.
   - Subject: `Routing proof <today's date>`
   - Confirm the composer shows `From  Kelly Kurzman · kelly@workwithalloy.com`.
2. In the external mailbox, confirm the message arrived **from**
   `kelly@workwithalloy.com` — not from any provider address.
3. **Reply** from that mailbox, without editing the subject.
4. Confirm the reply is addressed to `kelly@workwithalloy.com`.
5. Wait for it to route through the mail provider to the hidden destination.
6. In Alloy, confirm the reply lands in the **same family hub**, under **Email**,
   in the **same subject conversation** — not a new one.
7. Reply from Alloy, and confirm the external mailbox shows it **inside the same
   mail thread**, not as a separate message.

---

## 4. What to capture, and what it proves

Tell me when the round trip is done and I will inspect these read-only. Each
answers a specific question, and the third and fourth are the ones the whole
architecture rests on.

| Evidence | Question it answers |
|---|---|
| Original sender | Did the hop preserve who actually wrote? |
| Visible recipient | Did the parent write to the visible identity? |
| **`Message-ID`** | Did our minted id survive the hop? |
| **`In-Reply-To`** | **Can Alloy correlate the reply to the exact message?** |
| **`References`** | Is the chain intact for the parent's mail client? |
| Subject | Inherited, not re-authored |
| Text + HTML bodies | Content preserved through forwarding |
| Provider email id | Cross-reference to the Resend console |
| Sender Person resolution | Did it attribute to the right person? |
| Canonical thread id | One conversation, not a second |
| Family hub projection | Rolled up under one row |
| Unread + workflow event | The operator is actually told |
| Duplicate count | Exactly once |

### If `In-Reply-To` does NOT survive

That is a real possible outcome and not a failure of the test. Some providers
rewrite headers when forwarding. If it happens I will report exactly which
evidence was lost, and the branded-subdomain fallback comes back onto the table
as a decision for you — it is not currently implemented, and I will not
re-open it speculatively.

---

## 5. The fourteen proofs, and how each is settled

Run `certification/communications/live-email-round-trip-verification.sql` against the tenant
that received the mail, with `org_id` and the unique subject set at the top. Every statement
is a SELECT. The table below is the acceptance list — a claim with no query behind it is a
claim nobody checked.

| # | Proof | Settled by |
|---|---|---|
| 1 | Resend received it | §1 receipt — `resolved_message_id` non-null |
| 2 | Exactly one canonical inbound message | §2 `canonical_rows` = 1 |
| 3 | Sender Person resolution | §4 `inbound_resolution` + the named Person |
| 4 | Visible recipient stays `kelly@workwithalloy.com` | §3 `to_address` |
| 5 | Hidden destination is transport only | §5 `destination_leak_check` = 0 |
| 6 | `Message-ID` | §3 `email_message_id` |
| 7 | `In-Reply-To` | §3 `email_in_reply_to` |
| 8 | `References` | §3 `email_references` |
| 9 | Correct canonical Email thread | §6 — outbound and inbound share one `thread_id` |
| 10 | Correct Kurzman Family hub | §4 `primary_entity_id` resolves to the right Person; confirm the hub in the browser |
| 11 | Correct Email subject conversation | §6 — one thread, subject inherited not re-authored |
| 12 | Unread / Needs reply | §8 `attention_state` = `needs_response` |
| 13 | Workflow event | §8 exactly one `message_received` |
| 14 | Duplicate count | §2 — one row, and §8 `event_rows` = 1 |

**§7 is the one that decides the architecture.** `correlation_method` of `in_reply_to` or
`references` proves RFC correlation survived the forwarding hop. `endpoint_provenance` means
the message was filed correctly by sender+recipient while our headers were STRIPPED — the
conversation looks right and the proof failed. Those two outcomes are easy to confuse in a
screenshot and impossible to confuse in that column.

§9 additionally captures the first **live** observation the ingress gate has ever produced;
every existing row is `historical_replay`. It changes nothing about the message and is
recorded only as evidence.

---

## 6. Close the test down

The forwarding rule is **test infrastructure, not the production architecture.**

1. When the round trip has passed and the evidence is captured, **disable the blanket Gmail
   forwarding rule** at the mail provider.
2. Leave the hidden destination and the binding in place — they are the receiving identity,
   and `Connected` continues to mean "we received mail here, most recently at <time>".
3. Do not leave forwarding enabled as the mixed-inbox solution. What a real mixed inbox
   needs is recorded, and parked, in
   `docs/platform/planning/conversation-platform-v1/FUTURE-OPERATIONAL-MAILBOX-INTEGRATION.md`.

---

## 7. What Alloy will still not claim afterwards

Alloy can report mail it has received. It **cannot** see whether a rule inside
the organization's mail provider still exists, so `Connected` always means *"we
received mail here, most recently at <time>"* — never *"the forwarding rule is
verified and live."* That distinction is deliberate and is stated on the setup
panel itself.
