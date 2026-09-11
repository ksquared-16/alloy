# H2 — Communications → Work Items convergence

Lane `lane_cb3973afe2c7` · run `erun_87b66f63ab8f9994` · slot 12 · `http://127.0.0.1:3022`
Tenant: Firefly Early Learning (shared `alloy-cert` stack). Date: 2026-09-11.

## Why the existing fixture was disqualified — confirmed, not assumed

`web/scripts/createCommunicationsNeedsReplyQaFixture.ts` selects a thread with
`order by last_message_at desc limit 10` and writes `attention_state` onto it with a service-role
client. The threads it would have chosen on this tenant are, by direct query:

| thread | recipient |
|---|---|
| `b98d8f65…` | `kelly.kurzman@gmail.com` — a real personal mailbox |
| `7bd232bf…` | a real mobile number |
| `aaf5af91…` | `noreply@nohotwater.net` |
| `f9928f29…` | `forwarding-noreply@google.com` |

All four are real external correspondence. The fixture is unusable as written, exactly as the
instruction stated, and it was not used.

It also proves nothing: a hand-written `attention_state` makes the Work Items projection appear
without any of the inbound semantics that are supposed to cause it.

## Design gate

| question | finding |
|---|---|
| who owns `attention_state` | written by the inbound runtime (`inboundEmailIngestion`) and by operator triage (`conversationTriage`). No send path writes it. |
| what makes a thread actionable | `attention_state = needs_response`, set by ingestion when the sender is identified and routing is unambiguous |
| what resolves it authoritatively | `POST /api/admin/communications/conversations/[id]/triage` with `action: "resolved"` — the control the Communications UI calls. **Replying does not clear attention state in this product; triage does.** |
| is an outbound provider send required | **No.** Establishing state is inbound; resolving is triage. Neither sends. |
| existing safe provider path | **Yes** — `/api/admin/debug/certification/inbound-email`, env-gated on `ALLOY_CERTIFICATION`, admin-authenticated, hands a fixture event + fixture retrieval to the same `ingestResendInboundEmail` the Resend webhook calls. |
| existing QA identities | **Yes** — the platform already owns certification persons on `*.alloy.invalid` (`guardian-a@enrollment-cert.alloy.invalid` and 6 others). `.invalid` is RFC 2606 reserved and can never be delivered to. No address was invented. |

Two findings shaped the design and are worth recording, because both would have produced a fixture
that looked right and certified nothing:

1. **The sender must be an identified person.** `resolvePersonByEmail` returning zero matches yields
   `entity_type: communications_unknown`, and the projection predicate additionally requires
   `scope_status === "resolved"`. An unknown synthetic sender creates a thread that never projects.
2. **That person must resolve to a customer.** Scope resolves through `personCustomerId`, so the
   identity needs a household behind it. Requirement 1's "identity/person/household" is load
   bearing, not bureaucratic — reusing an existing certification family satisfied all of it.

## The fixture

`web/scripts/h2WorkItemsCommunicationsCertFixture.mjs`. It writes no `attention_state`, creates no
thread, holds no service-role key, and touches no table directly — it drives product HTTP APIs with
the slot's QA session. Receiving address is read from the active binding rather than hardcoded.
`assertSafeSender` refuses any sender not on a reserved undeliverable domain, so requirement 10 holds
by construction. `email_id` is deterministic, so a repeat run hits the ingress exactly-once claim and
returns `duplicate`; `--cleanup` resolves only the thread ids it recorded, through the same triage
endpoint an operator would use.

Created by the **runtime**, not by the fixture:

```
outcome: persisted  identified: true  ambiguous: false
thread:  03e76403-a833-4de6-a104-2d25b94704be
state:   attention=needs_response  scope=resolved  entity=persons
```

## Round trip

| step | result |
|---|---|
| 3 · authoritative state before | `attention=needs_response` `scope=resolved` `unread=1` |
| 5 · Work Items queue | 102 rows, 3 communications projections, fixture present |
| 6 · projection identity | `communications:03e76403-…` — prefixed, **not** a bare UUID, carries the thread id |
| 7 · operational_tasks before | 7 durable rows, **0** referencing the thread |
| 9 · detail explains ownership | "A family message is waiting for a reply… **This clears once the conversation is answered in Communications.**" Only command offered: Open conversation. |
| 11 · exact-thread navigation | Communications opened on `03e76403-…` exactly; triage controls present |
| 12–13 · authoritative resolution | triage `resolved` → `attention: needs_response → resolved` |
| 15 · convergence | projection **gone**; communications rows 3 → 2 |
| 16 · operational_tasks after | 7 durable rows, **0** referencing the thread, **0** with a `communications:` id shape |
| 17 · external delivery | `last_message_direction` stays `inbound` — no outbound send occurred at any point |

### Unread ≠ Needs Reply — proven, not asserted

After resolution the thread is **still unread** (`unread=1`) and **no longer projects**. Unread alone
does not create the actionable Work Items row; the projection predicate consults
`attention_state` and `scope_status` only, never the unread count.

### No real recipient was contacted — three independent reasons

1. The flow is inbound-only. Nothing was sent.
2. Resolution is triage, which has no send path.
3. The sender is on `.alloy.invalid`, an RFC 2606 reserved TLD that cannot resolve or receive.

## Environment note

`ALLOY_CERTIFICATION=1` was supplied to this lane's dev server process only, to enable the
platform's own env-gated certification route. It was passed as inherited process env — no worktree
env file was modified and nothing was committed.

## Follow-up debt

- `createCommunicationsNeedsReplyQaFixture.ts` remains in the tree and still selects arbitrary real
  correspondence. It was left untouched because repairing it was outside this instruction's scope.
  **Recommend adding a refusal guard or deleting it** — as written it is a live hazard for anyone
  who runs it.
- Work Items Queue health "Waiting" label actually represents Unassigned.
