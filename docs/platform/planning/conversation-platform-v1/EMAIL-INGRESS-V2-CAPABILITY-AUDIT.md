---
owner: platform
status: proposed
status_note: A decision packet: the audit and the architecture it argues for, not a built thing.
last_reviewed: 2026-08-18
supersedes_candidate: INBOUND-EMAIL-PRIVACY-POSTURE.md (see §0 — requires Director decision)
sources: official Google Workspace / Gmail API, Microsoft Graph, and Resend documentation, fetched 2026-08-18
---

# Email Ingress V2 — operational inboxes, purpose intake and acquisition

The question this document exists to answer, precisely:

> If a Director receives 1,000 emails a month, exactly which messages can Alloy see,
> exactly which messages enter Alloy, why, what does it cost, and what permission did
> the customer grant us?

**Short answer, evidence-backed and recommended for V1:**

Alloy sees **only what the customer's own mail server decides to hand over — roughly 300
of the 1,000 — and holds no mailbox credential at all.** The customer grants **no OAuth
scope**. Selection happens in Google Workspace / Exchange Online admin rules the customer
owns and can inspect, and Alloy re-checks admission deterministically on arrival before
retrieving any body. The remaining ~700 messages are not filtered by Alloy; they are
never offered to Alloy, and Alloy is technically incapable of requesting them.

That is a stronger claim than any mailbox connector can make, and it needs no restricted
Google scope, no annual CASA assessment, no admin consent grant, and no stored refresh
token. §3 shows why the connector premise the brief proposed does not survive the
evidence.

---

## §0 — Governance: this sprint collides with a canonical posture, deliberately

`INBOUND-EMAIL-PRIVACY-POSTURE.md` (canonical, Director-recorded 2026-08-11) states:

> **No Gmail or Outlook OAuth.** Not as a connector, not as an "optional convenience",
> not behind a flag. […] If a future capability needs any part of it, it is a **separate
> authorization with its own decision record** — not an extension of this one.

Phases 1–2 of this sprint are that separate audit. **This document is the decision record
the posture demands, and it does not itself change the posture.** No connector was built.

The recommendation in §9 stays *inside* the existing posture: it needs no OAuth, and it
strengthens rather than relaxes the boundary, because it adds a deterministic admission
gate to a runtime that currently treats "addressed to us" as "ingest everything".

If a Gmail/Graph connector is ever wanted, §1–§2 record what it would truthfully cost and
what it would truthfully permit. Nothing in this document authorizes building one.

---

## §1 — Google Workspace / Gmail API capability audit

Answers to the thirteen questions, each with the documentation behind it.

**1. Can Alloy be notified a mailbox changed WITHOUT retrieving message bodies? — YES.**
`users.watch` publishes to Cloud Pub/Sub. The notification payload is
`{"emailAddress": "...", "historyId": "..."}` and nothing else — no body, no headers, no
subject. The app then calls `users.history.list` from the stored `historyId`.

**2. What metadata can be inspected before retrieving body/attachments? — Effectively all
of it.** `users.messages.get?format=METADATA` returns message id, thread id, labels and
**email headers**, with `metadataHeaders` narrowing to a named set. So `From`, `To`, `Cc`,
`Message-ID`, `In-Reply-To`, `References`, `Subject`, `Date` are all readable without the
body. `history.list` itself returns only `id`/`threadId` per message, so one
`messages.get` per new message is required to see headers.

**3. Can Alloy filter by sender BEFORE retrieving content? — Server-side, NO under the
metadata scope.** `messages.list` accepts `q` (Gmail search syntax), but the reference
states: *"Parameter cannot be used when accessing the api using the gmail.metadata
scope."* `labelIds` **is** available. So under metadata-only the pattern is
`watch → history.list → messages.get(METADATA) → filter in Alloy`, one call per message.
Provider-side narrowing is possible only by **label**, which is a customer-side Gmail
filter — that is Option 3 arriving through the back door, and it is the tell.

**4. Can we implement notify → inspect envelope → deterministic gate → retrieve only if
eligible? — YES, mechanically.** The chain in (1)–(3) supports it exactly.

**5. Minimum OAuth scope.** For the gate alone: `gmail.metadata`. To also retrieve an
eligible body there is **no narrower option than `gmail.readonly`** — Gmail has no
per-message or per-label read scope. The scope ladder:

| Scope | Reads | Class |
|---|---|---|
| `gmail.metadata` | headers + labels, **never** body/attachments | **Restricted** |
| `gmail.readonly` | everything, all mail, all history | **Restricted** |
| `gmail.modify` | read + write | **Restricted** |
| `https://mail.google.com/` | full, including permanent delete | **Restricted** |

Note the finding that most changes the economics: **`gmail.metadata` is itself a
restricted scope.** "We only read metadata" buys no relief from Google's review regime.

**6. Can we truthfully say "Alloy does not retrieve bodies or attachments unless the
message qualifies"? — NOT as a technically enforced claim, no.**

This is the decisive finding of the Google audit. The claim is enforceable *only* under
`gmail.metadata`, where `format=full` and `format=raw` are refused by Google — and under
that scope Alloy can never retrieve a qualifying body either, which makes the connector
useless for conversation content. To retrieve anything, Alloy must hold `gmail.readonly`,
and `gmail.readonly` is *capability to read every message in the mailbox at any time*.
Under it, "we only fetch eligible messages" is a **policy assertion backed by audit logs**,
not a permission boundary. Per the brief's own instruction — *do not make this claim
unless technically enforceable* — Alloy must not make it about a Gmail connector.

**7. Can push eliminate polling? — YES**, with caveats: `watch` must be re-called at least
every 7 days (daily recommended), notifications are capped at one event per second per
user, and Google documents that they may be delayed or dropped, so a periodic
`history.list` reconciliation is required regardless.

**8. Notification vs follow-up request.** The notification carries `emailAddress` +
`historyId` only. *Everything* else — which messages changed, and any header — requires
follow-up calls (`history.list`, then `messages.get`).

**9. Quota at scale.** Limits: **1,200,000 units/min per project**, **6,000 units/min per
user per project**, and a daily billing threshold of **80,000,000 units/day** below which
there is no charge. Costs: `messages.get` 20, `messages.list` 5, `history.list` 2,
`watch` 100, `messages.attachments.get` 20.

Per mailbox per month at 1,000 inbound, gating all and retrieving 300:
1,000 × 20 (metadata) + 300 × 20 (full) + ~300 × 2 (history) + 30 × 100 (watch renewals)
≈ **30,000 units/month**.

| Mailboxes | Units/month | vs 2.4B/month free threshold |
|---|---|---|
| 1 | 30 K | 0.001 % |
| 10 | 300 K | 0.01 % |
| 100 | 3 M | 0.13 % |
| 1,000 | 30 M | 1.25 % |

The per-user 6,000 units/min ceiling is the real constraint: 300 metadata gets per minute
per mailbox. A backfill of a large mailbox will throttle; steady-state operational mail
will not. **Gmail API quota is not a cost problem at any plausible Alloy scale.**

**10. Can the customer revoke cleanly? — YES.** The user revokes at
myaccount.google.com/permissions; a Workspace admin revokes app access or removes
domain-wide delegation. Revocation is immediate and complete.

**11. After expiry/revocation.** Refresh tokens are long-lived but invalidate on password
change, admin revocation, user revocation, or 6 months of disuse. The connector then fails
with `invalid_grant` and must fail closed and surface a reconnect state — a *silent* stop
is the dangerous failure, because inbound simply goes quiet.

**12. Can Alloy avoid storing Gmail credentials via the existing secret authority? — NO,
and the mismatch is structural, not incidental.** `providerCredentialCatalog.ts` encodes a
deliberate rule: *"an operator chooses a credential that the deployment already
provisioned; they never supply one."* Secrets are deployment-owned, env-var-backed, and
referenced by opaque catalogue key. An OAuth refresh token is the exact inverse —
**per-tenant, user-granted at runtime, long-lived, individually revocable, and it must be
written by the app.** A connector therefore requires a *new class of secret* with
per-tenant encryption, rotation and revocation semantics, plus the audit story for it. That
is a substantial platform commitment, not connector plumbing.

**13. Verification / security review. — YES, and it is a real commercialization hurdle.**
Any restricted scope (including `gmail.metadata`) requires restricted-scope OAuth
verification, adherence to Limited Use, and — because Alloy *"accesses or has the
capability to access Google user data from or through a server"* — a **CASA security
assessment by a Google-empanelled assessor, repeated at least every 12 months** after the
Letter of Assessment. Third-party reporting puts Tier-2 assessments in the **$500–$4,500/yr**
range, with penetration-test tiers materially higher; treat those figures as indicative,
not as Google's own pricing. The exemptions do not help a multi-tenant SaaS: they cover
personal/dev use, service-owned data, and **Workspace apps configured for internal users
of one organization**. Alloy is external to every customer domain.

The hurdle is not only money. It is an annual gate on a compliance calendar that, if
missed, **switches off inbound email for every Google customer at once.**

---

## §2 — Microsoft 365 / Graph capability audit

**1. New-message event without body retrieval? — YES.** Change-notification subscriptions
on `/users/{id}/mailFolders('inbox')/messages`. Basic notifications carry the resource
**id** only. Message latency is documented as <1 min average, 3 min max. Subscription
lifetime is **10,080 minutes (under 7 days)**, or **1,440 minutes** for rich notifications
carrying resource data. Max 1,000 active subscriptions per mailbox across all apps.
`delta` query provides the same reconciliation role `history.list` plays on Google.

**2. Metadata under the narrowest permission.** `Mail.ReadBasic`: *"read email in the
signed-in user's mailbox except **body, previewBody, attachments and any extended
properties**"* (application variant: same exclusions, all mailboxes, admin consent
required).

**3. Is `Mail.ReadBasic` enough for the deterministic gate? — YES, and this is where
Microsoft is materially better than Google.**

| Field | Available under `Mail.ReadBasic` | How |
|---|---|---|
| sender / from | ✅ | `from`, `sender` |
| recipients | ✅ | `toRecipients`, `ccRecipients` |
| subject | ✅ | `subject` |
| RFC Message-ID | ✅ | `internetMessageId` |
| thread identifier | ✅ | `conversationId`, `conversationIndex` |
| **In-Reply-To / References** | ✅ | inside `internetMessageHeaders`, **requires `$select`** |
| body / bodyPreview / attachments | ❌ **excluded by permission** | — |

`internetMessageHeaders` is not body, not preview, not an attachment, and not an extended
property — so it is outside `Mail.ReadBasic`'s exclusion list. **Confidence: high from the
permission text; verify with one live `$select=internetMessageHeaders` call under a
ReadBasic-only token before depending on it.** It is the single most load-bearing
unverified fact in this audit.

**4. Do the RFC headers require `Mail.Read`? — On the documentation, no.** See above.

**5. Fetch full content only after eligibility passes? — YES, but it needs `Mail.Read`**,
which grants everything. Same ceiling as Google: no provider offers per-message read.

**6. Subscriptions avoid polling? — YES**, with renewal before the ≤7-day expiry, plus
lifecycle notifications and `delta` reconciliation for missed events.

**7. Permissions / consent.** Delegated `Mail.ReadBasic` needs no admin consent;
application `Mail.ReadBasic`/`Mail.Read` do. Critically, application permissions can be
**scoped to specific mailboxes** — legacy `New-ApplicationAccessPolicy`, and the modern
replacement, **RBAC for Applications** (Microsoft has signalled the legacy mechanism will
be deprecated, so new work should target RBAC). This lets a customer grant Alloy access to
the Director's mailbox *and no other*, enforced by Exchange. **Google has no equivalent** —
domain-wide delegation is domain-wide, and per-user consent is the only scoping tool.

**8. Revocation.** Remove the service principal's app role assignment, the application
access policy / RBAC scope, or the enterprise application. Immediate.

**9. Throttling / cost.** Graph itself is free. Global ceiling 130,000 requests/10 s per
app across all tenants. Outlook-specific mailbox throttling is **not stated on the Graph
throttling page**; the widely cited figure is ~10,000 requests per 10 minutes per app per
mailbox with a small concurrency cap. **Treat as unverified and confirm at integration.**

**10. Is the privacy boundary better or worse than Google? — Better, on three counts:**
`Mail.ReadBasic` is a genuine body-blind permission that is *not* a Google-style restricted
scope with an annual paid assessment; application permissions can be Exchange-enforced down
to a single mailbox; and Microsoft imposes no CASA-equivalent recurring audit.

**But it does not clear the decisive bar either.** Retrieving an eligible body still
requires `Mail.Read`, and `Mail.Read` is *capability to read the whole mailbox*. The
truthful claim under a Graph connector remains a policy claim.

---

## §3 — Transport comparison for MIXED HUMAN INBOXES

Scored 1–5, higher is better. **Option 1** blanket-forward everything to Resend;
**Option 2** Google/Microsoft mailbox connector with a metadata gate; **Option 3**
provider-side routing rule → Resend.

| Criterion | 1 · Blanket forward | 2 · Connector | 3 · Provider routing |
|---|---|---|---|
| Privacy | 1 — all 1,000 bodies cross into Alloy | 3 — 700 bodies unfetched, but readable at will | **5 — 700 never leave the mailbox; Alloy cannot request them** |
| Sensitive-data exposure | 1 — HR, legal, banking, personal | 3 | **5** |
| Customer trust | 1 — "we forward you everything" | 2 — "grant us full mailbox read" | **5 — "your mail server decides; we hold no key"** |
| Setup complexity | **5 — one forwarding rule** | 2 — OAuth, consent, Pub/Sub, verification | 3 — one admin rule, more conditions |
| Ongoing reliability | 4 | 2 — watch renewal, token expiry, silent stalls | 4 — static server-side rule |
| Revocation | 4 — delete the rule | **5 — one-click, complete** | 4 — delete the rule |
| Detect known relationships | 3 — after ingestion | **5 — dynamic, Alloy's own data** | 2 — static list, admin-maintained |
| RFC threading | **5 — headers preserved** | **5** | **5 — headers preserved** |
| Attachment retrieval | **5** | 4 — extra scoped call | **5** |
| Multi-tenant security | 3 | 1 — a token vault holding N customers' mailbox keys | **5 — no credential to compromise** |
| Provider lock-in | 4 — Resend | 1 — two adapters, two review regimes | 4 — Resend |
| Cost | 2 — 1,000 billable inbound | 4 | **5 — 300 billable inbound** |
| Support burden | 3 | 1 — expiry, consent, quota, annual reassessment | 3 |
| Auditability | 3 | 4 | **5 — the customer can read their own rule** |
| Future AI/BOS interpretation | **5** | **5** | **5** — all three admit the same post-admission pipeline |
| **Prove what Alloy did NOT ingest** | 1 — everything was ingested | 3 — Alloy's own logs assert its own restraint | **5 — the customer's mail logs prove it, independently of Alloy** |
| **Total (80)** | **46** | **46** | **70** |

Option 1 and Option 2 tie on points and are opposites in character: Option 1 is trivial and
indefensible; Option 2 is defensible-sounding and expensive, and its central privacy claim
does not survive §1.6/§2.10.

**Option 3 wins on the criterion the brief says matters most.** "Prove what Alloy did NOT
ingest" is the only criterion answerable by evidence the customer holds themselves. Under
Options 1 and 2 the proof is Alloy's own audit log — Alloy attesting to its own restraint.
Under Option 3 the mail server's logs show 700 messages that were never routed anywhere.

### What Option 3 can and cannot express

Both admin consoles are more capable than "forward everything":

- **Google Workspace content compliance** matches on Body, **Full headers** (every header
  field, scanned one at a time), Headers+body, Subject, Sender header, Recipients header,
  Envelope sender, Any envelope recipient, and Raw message; actions include reject,
  quarantine, modify, **add recipients (Bcc, up to 100)**, and **change route**.
- **Exchange Online mail flow rules** match on sender, recipient, subject, headers
  (`HeaderContainsWords`), attachment properties; actions include redirect, **Bcc**, and
  add recipients. Free, and up to ~30 minutes to propagate.

Mapped onto the four lanes:

| Lane | Expressible as a provider rule? | Rule |
|---|---|---|
| **A — continuity** | ✅ **Yes, exactly** | Full-headers match on `alloy\.[0-9a-f-]{36}@`. Alloy mints `<alloy.{uuid}@domain>` (`emailMessageId.ts`), so every reply to an Alloy conversation carries it in `In-Reply-To`/`References` — and nothing else on earth does. |
| **C — purpose** | ✅ Yes | Envelope recipient is `subsidy@` / `invoices@` / `licensing@`. |
| **D — acquisition** | ✅ Yes | Envelope recipient is `enrollment@` / `admissions@`. |
| **B — relationship** | ⚠️ Coarsely | Sender address list / address-list group. Static; an admin maintains it. Dynamic per-family accuracy is the **only** thing a connector buys. |

Lane A being a provider-side rule is the finding that collapses the case for a connector.
It was assumed to need Alloy's database ("does this thread exist?"). It does not: the token
is self-describing, unguessable, and present in the header.

---

## §4 — Purpose and acquisition addresses: Resend stays, and the model already fits

For `enrollment@`, `subsidy@`, `invoices@`, `licensing@`, `billing@` the recipient IS the
authorization. Blanket delivery of everything sent to those addresses is correct, not a
compromise.

**The existing hidden ingress route model already supports this with no new runtime.**
`communication_ingress_routes` separates the **visible identity** (what families see and
reply to) from the **destination** (where mail is administratively routed so Alloy can
observe it), with a global unique index on `lower(destination)`, tenant-composite FK, and a
`verification_state` that refuses to claim `inbound_observed` without a timestamp. A
purpose address is exactly one more binding + route.

**One additive change is needed, and only one:** a route/binding today has no notion of
*what the address is for*. `IngressIdentityRole` (`conversation` | `purpose` |
`acquisition`) plus an `intakePurposeKey` is the missing column-shaped concept. It is a
property of an existing row, not a second runtime.

**Naming warning, load-bearing.** `lib/communications/purpose/purposeRegistry.ts` already
owns `purpose` as *outbound* vocabulary — server-owned, compliance-inert, governing what a
capability may **emit**. Intake purpose describes why a message was **accepted**. Same word,
opposite direction. They must not share a vocabulary: letting an intake configuration feed
the outbound registry would let a tenant widen what Alloy is permitted to send. The
implementation in §10 keeps them separate and says so in the type.

---

## §5 — Cost model

Scenario: one Director inbox, 1,000 inbound emails/month. Mix per the brief: 5% Alloy-thread
replies (50), 20% eligible relationships (200), 5% purpose/work candidates (50), 70%
irrelevant (700).

### Transport and API, per mailbox per month

| | A · forward all 1,000 | B · connector gates 1,000, fetches 300 | C · provider routes ~300 |
|---|---|---|---|
| Resend inbound units | 1,000 | 0 | **300** |
| Provider API calls | 0 | ~1,330 | 0 |
| Gmail quota units | 0 | ~30,000 (free) | 0 |
| Pub/Sub | — | <1 MB/mo (free tier) | — |
| Bodies crossing into Alloy | **1,000** | 300 | **300** |
| Marginal $ at Resend Scale rates | ~$0.46–0.90 | $0 | **~$0.14–0.27** |

Resend prices sending **and** receiving against one plan volume (Pro $20/50 K, Scale
$90/100 K, overage $0.46–$0.90 per 1,000). Google and Microsoft charge nothing for these
API calls at Alloy's scale; the connector's cost is verification and engineering, not
per-call.

### Storage, per mailbox per month

| | A | B / C |
|---|---|---|
| Message bodies (~50 KB avg) | 50 MB | **15 MB** |
| Attachments (~10% of admitted, ~500 KB) | ~50 MB | **~15 MB** |
| At ~$0.021/GB-mo | ~$0.002 | ~$0.0006 |

Storage is not a cost driver. It is a **liability** driver, and that is the point: option A
accumulates 600 MB/year of bank statements, HR mail and legal correspondence per Director.

### AI — progressive, and mostly zero

Admission is deterministic; AI never gates privacy. Of 300 admitted messages:

| Path | Volume | AI | Cost |
|---|---|---|---|
| Deterministic thread match (Lane A) | 50 | none | **$0** |
| Purpose-address routing (Lane C) | 50 | none | **$0** |
| Known relationship, resolves to a Person + thread (Lane B) | ~180 | none | **$0** |
| Ambiguous admitted message | ~20 | lightweight classifier (~1.5 K in / 200 out) | ~$0.04/mo |
| Actual document workflow | ~20 | extraction / Processing | ~$0.40/mo |
| BOS reasoning | on operator demand | — | usage-driven |

**Marginal cost per organization ≈ $0.60–$1.50/month all-in**, dominated by document
extraction, not transport. The expensive resource in this system is operator attention,
which is exactly what a tight admission gate protects.

---

## §6 — Privacy and data boundary

### What Alloy knows before eligibility

Under the recommended architecture (Option 3), **nothing at all** about the 700. They are
never routed to Alloy. Alloy's knowledge of a refused message is not "we saw and declined
it" — there is no record, because there was no message.

For messages that *are* routed, Alloy sees the `email.received` webhook first, which
per Resend's documented contract carries metadata only: `email_id`, `from`, `to`, `cc`,
`bcc`, `received_for`, the sender's `message_id`, `subject`, and **attachment metadata** —
**no `text`, no `html`, no `headers`, and therefore no `In-Reply-To`/`References`**.

**This is the one place the recommended architecture is weaker than a Gmail connector, and
it must be stated plainly.** On Resend, Lane A cannot be decided pre-retrieval, because the
threading headers arrive only with `GET /emails/receiving/{id}`. In practice this costs
nothing, because the provider rule already selected on those very headers — but the
*deterministic gate on Alloy's side* runs on a post-retrieval envelope for the header lanes.
Alloy's gate is therefore **defense in depth against an over-broad customer rule**, not the
primary privacy boundary. The primary boundary is the customer's mail server. Do not
describe it the other way round.

### What crosses into Alloy after eligibility

Body (text + HTML), RFC headers, attachment metadata, and — when a workflow needs it —
attachment content. Alloy deliberately does not fetch `raw.download_url`; raw MIME is not
the canonical model.

### What is persisted

A canonical `communication_messages` row inside the owning tenant, its thread, the ingress
receipt in `communication_inbound_ingress`, and any attachment. Quarantined mail (ownership
unprovable) is retained at provider authority and **its body is withheld from the
quarantine projection** — already certified behaviour.

### What is discarded

Under Option 3, nothing needs discarding, because nothing ineligible arrives. Where the
Alloy gate refuses a message that a customer rule over-forwarded, the decision returns
`retrieval: "none"` and the receipt records the refusal with **no body ever requested**.

### Audit evidence that a message was rejected before content retrieval

Three independent layers, in increasing order of strength:

1. `EmailIngressDecision.retrieval === "none"` — a typed grant, not a comment. There is no
   code path that fetches a body without a `"full"` grant.
2. The ingress receipt row records disposition and evidence with a null body.
3. **The customer's own mail server logs** — the only evidence not authored by Alloy.

### Does provider metadata itself contain sensitive information?

**Yes, and this is under-appreciated.** `Subject` routinely carries content ("Termination
letter — J. Smith", "Biopsy results"). Sender and recipient reveal relationships (a
Director corresponding with an employment lawyer). Under a metadata-scoped connector,
Alloy would see all 1,000 subjects — including the 700 it refuses. **Metadata-only is not
privacy-neutral.** Option 3 avoids this entirely: Alloy sees no metadata for unrouted mail.
Consequently the eligibility authority accepts `subject` but **keys no admission decision on
it** — it is display, never authority.

### Retention, deletion, disabling

Canonical messages follow existing Communications retention. Resend's own retention is
30 days on Free/Pro/Scale, so Alloy's copy is authoritative. Disabling the connector means
the customer deletes their routing rule: mail simply stops arriving, immediately, without
Alloy's cooperation. **Previously ingested operational records are unaffected** — a
conversation with a family is an operational record of the organization, not a cached copy
of a mailbox, and it does not evaporate because a rule was removed. That distinction should
be stated in the administrator UI.

### The administrator's mental model

The candidate UI in the brief is **truthful under Option 3** and only under it:

```
Route mail to Alloy from kelly@school.com

✓ Replies to Alloy conversations        (a rule matching Alloy's own thread token)
✓ Active parents & guardians            (a sender address list you maintain)
✓ Active prospective families           (a sender address list you maintain)
□ Vendors
□ Agencies / subsidy contacts
□ Staff

Alloy never receives anything else from this mailbox, and holds no key to it.
```

Under Option 2 the last line would have to read *"Alloy can read this mailbox and promises
to look only at the above"* — which is why Option 2 is not recommended.

---

## §7 — Deterministic eligibility authority

Implemented: `web/lib/communications/ingress/emailIngressEligibility.ts`. Provider-neutral,
pure, and given only metadata-grade inputs — it is not merely written not to read bodies, it
is not handed them.

**Validated against the entity model, and modified in two ways from the proposed ordering.**

**Modification 1 — lane and purpose are orthogonal, not rivals in one precedence list.**
The proposed list returns a single answer, which discards information in real cases: a
parent replying to an Alloy billing thread *at* `invoices@` matches A and C simultaneously.
Returning only "continuity" loses the purpose; returning only "purpose" loses the thread.
So **precedence decides the LANE (why admission is allowed); intake role and purpose are
properties of the recipient identity and are always reported alongside.** This also fixes
the acquisition misfire: a reply on an existing thread arriving at `enrollment@` is
continuity carrying an acquisition context — not a second Lead candidate.

**Modification 2 — Lane B requires sender authentication.** The proposed ordering admits on
"eligible known relationship", i.e. on `From`, which is a claim rather than a fact. Case 19
(spoofed display name) would be admitted and attributed to a real family's hub. Lane B
therefore refuses when SPF/DKIM/DMARC did not pass, and an *unreported* result is treated
exactly like a failure. Lanes A, C and D are unaffected — their evidence is the unguessable
`alloy.` token or the recipient address, neither of which the sender controls.

**The distinction that makes it safe: admission evidence is not identity evidence.** The
decision carries a `lane` (why we may look) and a `senderAssertion` (what may be believed
about who wrote it) separately, with four states: `verified_relationship`,
`shared_endpoint` (address held by several Persons — real relationship, names nobody, the
rule the certified SMS/email runtimes already hold), `unverified_relationship`, `unknown`.

Precedence as implemented:

```
0. addressed to a configured identity   — a PRECONDITION, not precedence.
                                          "not ours" ≠ "we declined it".
1. resolvable Alloy thread              -> conversation_continuity   (unforgeable)
2. purpose identity                     -> purpose_intake            (recipient authorizes)
3. acquisition identity                 -> acquisition               (candidate, never a Lead)
4. watched + active + authenticated     -> relationship_watch        (weakest; sender-supplied)
5. explicit allow list                  -> explicit_allow
6. otherwise                            -> refuse, retrieval: "none"
```

Two entity-model constraints the implementation honours:

- `IngressRelationshipKind` is a **closed enum** (`guardian`, `prospective_guardian`,
  `staff`, `vendor`, `agency`, `emergency_contact`, `former_guardian`). A `string` here is
  how "this address exists somewhere in Alloy" sneaks in — an emergency contact's address
  exists; a former family's address exists; a staff member's personal address exists. None
  of those are the same permission.
- **Lane B is OFF by default.** An empty `watchedRelationshipKinds` admits nothing.
  Connecting a mailbox must never silently mean "ingest everything from anyone we
  recognise".

Refusals are distinguishable — `relationship_not_watched` is a setting the administrator can
change; `relationship_inactive` is not.

---

## §8 — Pressure test

All twenty cases are executable assertions in
`web/tests/communications/emailIngressEligibility.test.ts` (**38 tests, 38 passing**).
Policy assumed: watched = {guardian, prospective_guardian}.

| # | Case | Ingress? | Deterministic evidence | AI? | Destination | Human review | Privacy risk |
|---|---|---|---|---|---|---|---|
| 1 | Parent replies to Alloy enrollment email | ✅ A | `In-Reply-To` → Alloy thread | no | existing thread, family hub | no | none |
| 2 | Parent starts a fresh email to Director | ✅ B | watched guardian + auth pass | no | new thread on Person | no | low |
| 3 | Unknown parent → `enrollment@` | ✅ D | acquisition recipient | no | acquisition candidate | **yes — no Lead auto-created** | low |
| 4 | Known subsidy worker → Director | ❌ | agency not watched | — | not ingested | — | none |
| 5 | Unknown subsidy worker → `subsidy@` | ✅ C | purpose recipient | no | `subsidy_intake` | routing only | low |
| 6 | Known vendor → Director with invoice | ❌ | vendor not watched | — | not ingested | — | none |
| 7 | Unknown vendor → `invoices@` | ✅ C | purpose recipient | extraction only | `invoice_intake` → Billing | yes | low |
| 8 | Bank statement → Director | ❌ | no admitting evidence | — | never routed | — | **avoided** |
| 9 | Payroll → Director | ❌ | no admitting evidence | — | never routed | — | **avoided** |
| 10 | Staff member → Director | ❌ | staff not watched | — | never routed | — | **avoided** |
| 11 | Newsletter → Director | ❌ | no admitting evidence | — | never routed | — | none |
| 12 | Parent from a NEW address | ❌ | no relationship on that address | — | not ingested | — | none — **and this is correct**: the Director still sees it in Gmail |
| 12b | …same address, but replying to a thread | ✅ A | thread token | no | thread; sender `unknown` | attribution prompt | none |
| 13 | Two Persons share an endpoint | ✅ B | relationship real | no | thread; **asserts no Person** | yes | low |
| 14 | Forward rewrites apparent sender | ❌ | `From` is now staff → not watched | — | not ingested | — | none |
| 15 | "Lennon absent Friday" + immunization PDF | ✅ B | watched guardian + auth | extraction on the document only | thread + document workflow | yes | low |
| 16 | Agency sends password-protected PDF → `subsidy@` | ✅ C | purpose recipient | no | intake; **document unreadable** | yes | low |
| 17 | Thread reply with attachment | ✅ A | thread token | no | thread + attachment | no | none |
| 18 | Confidential HR/legal → Director | ❌ | no admitting evidence | — | never routed | — | **the case the design exists for** |
| 19 | Spoofed known-parent display name | ❌ | auth fail → `relationship_unauthenticated` | — | not ingested | — | **avoided** |
| 20 | Compromised genuine parent account | ✅ B | auth passes — legitimately | no | thread | yes | **real, and out of scope**: auth proves the mailbox sent it, never that its owner meant to. Detecting takeover is not an ingress-gate problem; say so rather than implying the gate catches it. |

Two cases deserve emphasis. **#12** is the design working, not failing — a parent's new
address is refused, the Director still has the mail in Gmail, and the fix is adding the
address to the Person, which is an operator action Alloy can prompt. **#16** shows admission
and interpretation are genuinely separate: the message is admitted on recipient authority,
and its unreadable payload is a downstream workflow problem, not an ingress decision.

---

## §9 — Architecture decision

**The connector premise in the brief does not survive the evidence. Recommended V1:**

```
  DEDICATED PURPOSE / ACQUISITION ADDRESSES
      subsidy@ invoices@ licensing@ billing@ enrollment@ admissions@
      → Resend receiving → canonical Email ingress          [role = purpose | acquisition]

  MIXED HUMAN INBOXES
      kelly@school.com
      → customer-owned Google Workspace / Exchange Online routing rule
        · full-headers match on  alloy\.[0-9a-f-]{36}@      (Lane A)
        · sender address list                                (Lane B, coarse)
      → Resend receiving → canonical Email ingress          [role = conversation]

  BOTH CONVERGE ON
      evaluateEmailIngressEligibility()   deterministic second gate, defense in depth
      → ownership → correlation → canonical thread → work routing
      → (only then, and only sometimes) AI interpretation

  NOT BUILT: Google connector. Microsoft connector. Any OAuth scope.
```

One transport, one canonical ingress, one identity model, one provenance model, one
work-routing model — as required. The transports differ only in how a message reaches
Resend, and the Resend runtime is already certified.

**Why not the connector, stated once, plainly.** Its central promise — *"we don't retrieve
bodies unless the message qualifies"* — is not technically enforceable on either provider,
because neither offers a scope between "headers only, forever" and "the whole mailbox".
Buying it costs a restricted Google scope, an annual CASA assessment that can switch off
every Google customer at once if missed, admin consent on Microsoft, a new per-tenant secret
class that inverts the deployment-provisioned credential rule, and two adapters to maintain.
It buys exactly one capability Option 3 lacks: **dynamically accurate Lane B.** That is not
a good trade for V1.

**What would change this.** If a customer with hundreds of families finds maintaining a
sender address list intolerable, the narrow next step is not a read connector — it is
**writing the address list into the customer's own rule** (`gmail.settings.basic`, or
Exchange group membership). Alloy would then hold write access to one filter and still no
read access to any mail. That is a materially smaller ask than `gmail.readonly`, and it is
the option worth designing before a connector is reconsidered.

---

## §10 — Implementation boundary and what was built

Built this sprint, additive only, nothing wired into the certified runtime:

- `web/lib/communications/ingress/emailIngressEligibility.ts` — the provider-neutral
  eligibility authority. Pure; metadata-only inputs; typed retrieval grant.
- `web/tests/communications/emailIngressEligibility.test.ts` — 38 tests, all twenty
  pressure-test cases plus boundary cases. **38/38 passing.**
- This document.

**Deliberately NOT built** — and each omission is a decision, not a gap:

- No Google adapter, no Microsoft adapter, no OAuth of any kind (§0, §9).
- **The gate is not yet wired into `ingestResendInboundEmail`.** The brief says do not
  disturb the live-certified runtime, and wiring it changes admission behaviour on a path
  carrying a live test. Wiring belongs in its own slice, behind an observe-only mode first,
  so a divergence between "what the gate would have refused" and "what was ingested" is
  measured before it is enforced.
- No `IngressIdentityRole` persistence. The column-shaped concept is identified (§4); the
  migration is the first step of the next slice.
- No Lead creation from acquisition mail. The brief forbids it until the boundary is set,
  and the boundary is not set.

### Smallest sequence to production

1. **Live Resend round trip** (already owed, unchanged): Gmail → Resend → Alloy → RFC
   correlation → family hub → subject thread → reply. Proves transport and threading.
2. **Verify the two unverified facts** in §2: `internetMessageHeaders` under a
   `Mail.ReadBasic`-only token, and the real Outlook mailbox throttling figure. Cheap, and
   they are the only load-bearing unknowns left in the audit.
3. **Migration**: add intake role + intake purpose key to the binding/route model (§4).
4. **Wire the gate in observe-only mode**: record the decision on the ingress receipt,
   change no behaviour, and measure divergence on real traffic.
5. **Enforce**: honour `retrieval: "none"` — refuse retrieval, record the refusal.
6. **Purpose/acquisition addresses live**: provision `enrollment@` and one purpose address
   end to end.
7. **Routing-rule setup guide** for Google Workspace and Exchange Online, including the
   exact `alloy\.` header regex, plus an administrator UI that states the boundary honestly.
8. **Only then**, and only if Lane B list maintenance proves intolerable in the field,
   evaluate provider-side list *writing* (§9) — not a read connector.

---

## §11 — Roadblocks

| Roadblock | Severity under recommended V1 | Notes |
|---|---|---|
| Google restricted-scope verification + annual CASA | **Eliminated** | Only applies to a connector. No Google scope is requested. |
| Microsoft admin consent | **Eliminated** | Only applies to application permissions. None requested. |
| Per-tenant OAuth secret storage (inverts `providerCredentialCatalog`) | **Eliminated** | No token to store. |
| API rate limits | **Eliminated** | No provider API calls. |
| Canonical posture doc conflict (§0) | **Resolved** | The recommendation stays inside the existing posture. |
| Customer must configure an admin routing rule | **Live** | Real setup friction; ~30 min propagation on Exchange. Mitigate with a per-provider guide and the `inbound_observed` state, which refuses to claim receiving works until a message actually arrives. |
| Lane B list is static and admin-maintained | **Live** | The one genuine capability gap vs a connector. §9 names the narrow fix. |
| An over-broad customer rule forwards too much | **Mitigated** | Exactly what the Alloy gate is defense in depth against. Enforced from step 5. |
| Resend as single inbound dependency | **Live** | Lock-in is real; the canonical ingress is provider-neutral, which bounds it. |
| Resend counts inbound against send volume | **Live, small** | ~300/org/month. Plan tiering, not architecture. |
| Lane A pre-retrieval gating impossible on Resend | **Accepted** | Threading headers arrive only on retrieval (§6). The provider rule already selected on them; do not describe Alloy's gate as the primary boundary. |
| `internetMessageHeaders` under `Mail.ReadBasic` unverified | **Deferred** | Only matters if a Microsoft connector is ever reconsidered. |

---

## §12 — Communications Operationalization

Not reopened. The temporary live Email round trip remains the final Operationalization
proof, and its scope is unchanged: it proves **Gmail → Resend → Alloy → RFC correlation →
family hub → subject thread → reply**.

It does **not** certify blanket forwarding as the production mixed-inbox architecture, and
this document must not be read as having done so. Broad Gmail forwarding is a temporary
test instrument, to be disabled after the test. The production mixed-inbox arrangement is
the *selective* rule in §3, which is a different rule doing a different job.

---

## §13 — Conversation Platform V1 scoreboard

Percentages are judgment, not measurement.

| # | Workstream | % | Movement this sprint |
|---|---|---|---|
| WS1 | Interactive Conversations | 70% | — |
| WS2 | Conversation Identity | 80% | — visible identity vs hidden ingress already separated |
| WS3 | Inbox Ingestion | **45%** | ▲ from 30% — admission authority now exists, is tested, and the transport architecture is decided; not wired, no intake role persisted, live proof still owed |
| WS4 | Composer Convergence | 75% | — |
| WS5 | Delivery Telemetry | 65% | — |
| WS6 | Hierarchy & Inheritance | 55% | — |
| WS7 | Internal Conversations | 20% | — |
| WS8 | Preferences | 70% | — |
| WS9 | AI Assistant | 15% | — this sprint deliberately kept AI out of the privacy path |
| WS10 | Automation | 25% | — |
| WS11 | Attachments | 30% | — attachment metadata reaches the gate; retrieval unbuilt |
| WS12 | Template Platform | 40% | — |
| WS13 | Analytics | 20% | — |

---

## Sources

Google: [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) ·
[messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get) ·
[messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list) ·
[history.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list) ·
[users.watch](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch) ·
[push notifications](https://developers.google.com/workspace/gmail/api/guides/push) ·
[usage limits](https://developers.google.com/workspace/gmail/api/reference/quota) ·
[restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) ·
[content compliance rules](https://knowledge.workspace.google.com/admin/gmail/advanced/set-up-rules-for-advanced-email-content-filtering)

Microsoft: [message resource](https://learn.microsoft.com/en-us/graph/api/resources/message) ·
[permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference) ·
[Mail.ReadBasic](https://graphpermissions.merill.net/permission/Mail.ReadBasic) ·
[change notifications](https://learn.microsoft.com/en-us/graph/change-notifications-overview) ·
[throttling limits](https://learn.microsoft.com/en-us/graph/throttling-limits) ·
[application access policies](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-access-policies) ·
[mail flow rules](https://learn.microsoft.com/en-us/exchange/security-and-compliance/mail-flow-rules/mail-flow-rules)

Resend: [pricing](https://resend.com/pricing) · and the repo's own
`RESEND-INBOUND-CONTRACT.md`, established from official Resend documentation 2026-08-11.
