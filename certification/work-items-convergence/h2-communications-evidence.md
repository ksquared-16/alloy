# H2 — Communications → Work Items convergence

Lane `lane_cb3973afe2c7` · run `erun_87b66f63ab8f9994` · slot 12 · `http://127.0.0.1:3022`
Tenant: Firefly Early Learning. Date: 2026-09-11.

**Environment — corrected.** An earlier revision of this document named the shared `alloy-cert`
stack. That was wrong, and the distinction matters enough to state plainly: `alloy-dev-start`
injects `ALLOY_SERVER_ENV_SOURCE` (`$ALLOY_REPO/web/.env.local`), which points every lane's dev
server at the **hosted** certification project `ikaxilmwmrmbagoidedu`. The local `alloy-cert`
Postgres is the target of `database.apply_migration`, not of the browser runtime. Measured, not
assumed: `alloy-cert` holds one `communication_threads` row and it is not this thread, while the
running app returns this thread through its own API, and the slot's session cookie is
`sb-ikaxilmwmrmbagoidedu-auth-token`.

Nothing about the certification changes — the sender is still on a reserved undeliverable TLD and
the flow is still inbound-only — but a reader who believed this ran against a disposable local
stack would have mis-read the blast radius, so the environment is named correctly here.

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

## Follow-up debt — both CLOSED in the zero-debt hardening pass

- ~~`createCommunicationsNeedsReplyQaFixture.ts` remains in the tree and still selects arbitrary
  real correspondence.~~ **DELETED.** The recommendation was a refusal guard or deletion; deletion
  was correct, because this file already is the safe replacement and the only thing the other script
  offered was the ability to reach real families. Its guard was extracted to
  `web/scripts/lib/certificationSenderSafety.mjs` and is now unit-tested.
- ~~Work Items Queue health "Waiting" label actually represents Unassigned.~~ **CORRECTED** to
  `Assigned · Unassigned · Due Soon · Overdue`, with count parity pinned by test.

---

## Re-certification on the promotion candidate — `5419f3b6e`

The round trip above was captured at `f808cce5e`. The candidate then merged `origin/staging` twice,
so the result was re-measured rather than inherited. The whole round trip was driven again, live,
against `5419f3b6e` on 2026-09-11 (run `erun_189aca1c83344798`, slot 12, `http://127.0.0.1:3022`).

The fixture was re-run with a fresh key. Because a thread is keyed by sender identity, the inbound
landed on the same thread and the **runtime moved it `resolved` → `needs_response` again** — which
is a stronger demonstration than a first-time create: the transition was caused by ingestion, on
this SHA, with nothing writing `attention_state` by hand.

| step | measured at `5419f3b6e` |
|---|---|
| 1–2 · synthetic subject | `guardian-a@enrollment-cert.alloy.invalid`, person `fb4eb21b…`, household "Certfree Family" |
| · receiving address | `kelly@workwithalloy.com` — read from the ACTIVE binding, Alloy-owned |
| 3 · authoritative before | `attention=needs_response` `scope=resolved` `unread=3` `direction=inbound` |
| 5 · Work Items queue | projection present — 1 row under **Unassigned** |
| 6 · projection identity | `communications:03e76403-a833-4de6-a104-2d25b94704be` — prefixed; `is bare uuid: false` |
| 7 · operational_tasks before | 7 durable rows · **0** referencing the thread |
| 9 · detail explains ownership | "A family message is waiting for a reply." / "This clears once the conversation is answered in Communications." Sole command: **Open conversation** |
| 10–11 · exact-thread navigation | Communications opened on the Inbox tab with `03e76403-…` **selected**; triage row reads `Queue · Needs response · Needs review · Needs response · Resolved` |
| 12–13 · authoritative resolution | clicked `[data-cc-triage="resolved"]` → `attention: needs_response → resolved` |
| 15 · convergence | projection **gone** — 0 rows, "No work items match your search." |
| 16 · operational_tasks after | 7 durable rows · **0** referencing the thread · **0** with a `communications:` id shape |
| 17 · external delivery | `last_message_direction` stays `inbound` before and after — no outbound send at any point |

### Unread ≠ Needs Reply — measured again

`unread` was **3 before and 3 after**. The thread stayed unread and stopped projecting, so the
actionable row cannot be an unread artifact. This is structural, not incidental:
`conversationRequiresReplyForWorkItemProjection` consults `attention_state` and `scope_status` and
never reads the unread count.

### A navigation finding worth recording

"Open conversation" first appeared to land on the Communications **overview** rather than the
thread. It does not. The Communications modal now opens through `CommunicationsWorkspaceShell`
(Work/Studio · Overview/Inbox), and every tab panel is present in the DOM while only the active one
is visible — so a text dump of the shell reads like the overview no matter which tab is active, and
a guessed `data-testid` for the command center matches nothing. Verified properly, the event fires
with the right thread id, `aria-selected` is `true` on **Inbox**, and the Certfree thread is the
selected row with its messages rendered. Recorded because the wrong conclusion here would have been
a fabricated defect against a product that behaves correctly.

### Scope

No product code was changed for H2. The only edits are this evidence file. `typecheck`,
`typecheck:tests`, the four prebuild guards, `tests/workItems` and `tests/processing` were re-run on
this SHA; results are in the promotion report.
