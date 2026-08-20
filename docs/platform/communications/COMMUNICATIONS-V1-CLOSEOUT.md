---
owner: platform
status: canonical
last_reviewed: 2026-08-20
---

# Communications V1 — closeout

Communications V1 is **COMPLETE**, accepted on hosted evidence on 2026-08-20.

This is the durable record: what is live and certified, what was deliberately not built,
what debt left this workstream and where it went. The hosted census evidence behind the
acceptance is in
[`communications-v1-sprint-close-2026-08-20.md`](communications-v1-sprint-close-2026-08-20.md);
the live Email round trip is in
[`live-email-certification-2026-08-19.md`](live-email-certification-2026-08-19.md).

---

## 1. Live-certified in V1

Everything in this section was proven against a running system — a real provider, a real
mailbox, or a real browser — not by unit test alone.

### SMS

- **Send, receive and reply** end to end through the Twilio Messaging Service.
- **Canonical Person and thread resolution** on inbound: a message resolves to the Person
  who holds the endpoint and joins that Person's thread, rather than creating a parallel one.
- **`STOP` → blocked.** All three SMS categories are written to `opted_out`, so suppression
  is total rather than merely routine.
- **`START` → restored.** START never erases the prior STOP; it appends a new event whose
  `from_state` is the suppressed state, so the trail shows a reversal rather than a gap.
- **Twilio owns the STOP / START / HELP acknowledgement.** For US A2P traffic that reply is
  carrier-mandated at the provider layer and cannot be declined. Alloy must not also send
  one, or a parent who just texted STOP receives two messages — one of them from the system
  they just told to stop.
- **Alloy owns the canonical preference state and its enforcement.** `keyword_response()`
  exists for operator display and record only; `backend/tests/test_keyword_response_not_sent.py`
  fails the build if any send path starts consuming it, because the natural instinct on
  seeing "copy that is never sent" is to wire it up, and that instinct is wrong here.

### Email

- **Provider account authority is the organization's.** Resend receiving is configured
  self-service and derived, never provisioned on the org's behalf.
- **Outbound** and **inbound** both live, through the two-step Resend contract: the
  `email.received` webhook carries metadata only, and the body and headers are fetched
  separately.
- **Visible identity is separate from hidden ingress transport.** Families see and reply to
  one address; delivery for observation arrives somewhere else entirely. The transport
  address is never rendered outside administrator routing setup.
- **Retrieval uses the owning organization's credential.** An org-owned `vault:` reference is
  **terminal** — it never falls back to a deployment key. Sending an organization's mail
  through platform credentials is exactly the kind of correct-looking behaviour nobody would
  notice.
- **RFC threading PASSES.** An Alloy `Message-ID` survives a Gmail forwarding hop and comes
  back through the **`references`** header — the older id in the chain, not `in_reply_to`.
  Correlating on `in_reply_to` alone would have missed it.
- **Family hub and Email-subject conversation** render the resulting thread as one
  conversation.
- **Final Alloy → Gmail reply** landed in the same Gmail thread, closing the loop.

### Preferences

- **Essential / Routine / Marketing** are distinct Email categories with distinct semantics:
  Essential is opt-out **exempt**, Routine is **opt-out**, Marketing requires **opt-in**.
- The defect this closed was a control labelled "Email messages" that edited the exempt
  category. An operator could switch it off, watch it save, and the platform would keep
  sending. The control was not broken — it was **untruthful**. Exempt categories now carry no
  switch at all, and the reason an operator reads is derived from `evaluateEligibility`
  rather than restated from a row, so it stays true if the rules change.
- **Recipient unsubscribe** — RFC 8058 `List-Unsubscribe` on outbound and a public route
  behind an HMAC capability token. Person, org and category are all signed **claims**, so a
  recipient who edits the URL gets a rejection, not a different outcome. No session required:
  an unsubscribe that redirects a parent to a login screen is not an unsubscribe.
- **Anti-bypass at two layers.** The TypeScript enqueue gate and the Python dispatch
  revalidation both enforce eligibility, and dispatch refuses any message carrying no
  eligibility snapshot. One layer can be forgotten; two cannot be forgotten silently.

### Platform

- **BOS pinned-shell freeze repaired.** The cause was a ResizeObserver feedback loop: a
  geometry write fed the observer that triggered it, and the loop could only close when
  pinned because the rail shares a flex row with the surface it sizes. Certified in-browser
  at two viewports with a **positive control** — an unconditional write produces 327
  observer callbacks in 1.2 s where the shipped code produces 0 style mutations.
- **Hosted Communications privilege proof.** On `public.communication_provider_bindings` and
  `public.communication_ingress_routes`, `anon` and `authenticated` hold **false** on
  SELECT / INSERT / UPDATE / DELETE and `service_role` holds **true**, verified with
  `has_table_privilege` against the live hosted roles and a positive control
  (`authenticated` on `public.persons` = true). Supabase default ACLs grant at CREATE TABLE,
  so these tables were reachable from the moment they existed.

---

## 2. Explicitly parked

Recorded so the reasoning survives. None of these are started, and none reopen V1.

| Parked | Note |
| --- | --- |
| Operational Mailbox Integration | See the mixed-inbox finding in §4 — needs customer validation first. |
| Gmail / Outlook connectors | Rejected in the capability audit: no provider offers a scope between "headers forever" and "the whole mailbox", so a connector's "we only fetch eligible bodies" is policy, never permission. `gmail.metadata` is itself a restricted scope requiring annual CASA review. |
| Mailbox label / archive / reply synchronization | Depends on the connector above. |
| Broad Email relationship-watch enforcement | The gate remains observe-only. |
| Email Ingress V2 observe-only research | Gate is wired and recording; the capability was never authorized for use. |
| Purpose / acquisition Email expansion | — |
| AI ingress interpretation | AI is not an ingress authority. |
| Generalized Preferences Platform | V1 boundary only. |
| Per-location / per-child preference grain | Preference grain stays Person + category + channel. |
| Quiet-hours authoring | Evaluation exists; authoring does not. |
| Dead SMS response constants cleanup | Deliberately retained — see the STOP/START ownership note above. Removing them would delete the operator-visible record of what the family was told. |
| Communications attachments (WS11) | Does not exist. Phase 4. |
| Template Platform (WS12) | Phase 3. |
| Internal Conversations (WS7) | `audience='internal'` exists; the workstream does not. |
| Automation / Workflows (WS10) | — |
| Conversation Analytics (WS13) | Does not exist. Phase 5. |
| **WS2 / WS6 hierarchy work** | **Still unmerged.** PR #418 (provider + org→school→room hierarchy) is CI-green and not merged. Rooms are already canonical (`location_type='unit'` + `parent_location_id`); room identity is blocked because outbound carries no room context. |

---

## 3. Transferred debt

**Migration collision at version `20260818200000` — RESOLVED.** Two files claimed it: the
Communications observation migration and Access & Identity's W-28. The ledger records a
*version*, not a *file*, so only the physical schema could say which body ran.

- **The Communications body physically executed.** Both `sender_authentication` and
  `sender_authentication_evidence` exist on
  `communication_ingress_eligibility_observations`. There is **no Communications migration
  debt**.
- **Access & Identity's W-28 body did not.** `public.replace_role_permission_grants` did not
  exist on hosted, and because the ledger marked the version applied, `supabase db push`
  would never have re-run it — the defect was invisible to the normal promotion path.
- **Access & Identity resolved it by renumbering their own files**, which is the correct
  side to move: `20260818200000_w28…` → **`20260820130000`** and `20260818210000_w58…` →
  **`20260820140000`** (both byte-identical renames). No Communications migration was
  renamed or re-applied.
- **Two things follow.** `20260818200000` now belongs uniquely to the Communications file,
  which is exactly what the hosted ledger recorded — so **the ledger is now truthful**. And
  both renumbered files sort *above* the hosted head `20260820120000`, so an ordinary push
  applies them and the "will never re-run" trap is defused.
- **Duplicate migration versions across the merged tree: 0.**

**Other-lane pending migrations — not Communications debt.** Seven versions are in the repo
and absent from the hosted ledger. Every one carries a non-Communications workstream marker:

| version | file | owner |
| --- | --- | --- |
| `20260818220000` | `s3_action_link_token_hash` | S-3 |
| `20260818230000` | `s3_action_link_token_drop_plaintext` | S-3 |
| `20260818240000` | `w60_m20_drop_catalog_compatibility_views` | W-60 · Access & Identity |
| `20260819120000` | `w13_i35b_analytics_read_preservation` | W-13 · Access & Identity |
| `20260819140000` | `od8_ops_users_roles_read_preservation` | OD-8 · Operations |
| `20260820130000` | `w28_replace_role_permission_grants_rpc` | W-28 · Access & Identity |
| `20260820140000` | `w58_save_role_definition_and_grants` | W-58 · Access & Identity |

Hosted orphans: **0**.

**Baseline test debt.** `familyWorkspaceWorkspaceInbox.lifecycle.test.tsx` → *"failed send
preserves draft and keeps the composer expanded"* fails on a textarea that is not found.
Proven **not** a regression: the test file and the composer are byte-identical to `staging`,
and it fails identically with the pre-WS8 four-key preference profile. Separately tracked.

---

## 4. The Email mixed-inbox finding

This is the most important thing learned in V1, and it is a product finding, not an
engineering one.

Blanket Gmail forwarding **worked**. It proved transport end to end and it proved RFC
threading survives a forwarding hop. It was the right instrument for the certification.

It also **immediately ingested an unrelated third party's calendar invitation.**

That is the whole finding. A real operational mailbox does not contain only family
correspondence — it contains calendar invites, vendor invoices, bank notices, payroll,
newsletters, and legal mail. Forwarding all of it into a family communications product turns
unrelated correspondence into permanent family history, and no amount of downstream filtering
makes the ingestion itself appropriate.

Therefore:

- **Blanket forwarding is certification infrastructure, not the production architecture.**
  It must be disabled after any certification run.
- **Future Operational Mailbox Integration requires customer validation before
  implementation.** The open question is not "can we build it" — the audit answered that. It
  is whether schools will accept the only honest scoping a provider can offer, which is
  coarser than the promise a connector implies.

The deterministic admission gate exists because of this finding: an unrecognized sender
writing to a *conversation* identity is refused, which is the narrow case where accepting
mail turns a stranger into permanent family history.
