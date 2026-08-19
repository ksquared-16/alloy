---
owner: platform
status: parked
last_reviewed: 2026-08-19
parked_by: Director, 2026-08-19
supersedes: []
---

# Future: Operational Mailbox Integration

**PARKED. Do not build this until customer usage demonstrates the need.**

This is where the Email Ingress V2 research stops. Everything below is preserved so the
work does not have to be redone — and so nobody restarts it on a premise the evidence
already refuted.

## Purpose, if it is ever built

- Selectively capture Alloy-owned work from **mixed human inboxes** — a Director's real
  `kelly@school.com`, which receives parents, banks, payroll, licensing and personal mail
  in one stream.
- Reduce duplicate management across Gmail/Outlook **and** Alloy.
- Potentially synchronise provider-side label / archive / reply state.

None of that is needed to run Communications. It is needed only when a customer is
demonstrably managing the same work twice.

## What is finished and must not be rebuilt

| | |
|---|---|
| **Four-lane ingress model** | A conversation continuity · B relationship watch · C purpose intake · D acquisition. Accepted with modifications: lane and purpose are orthogonal, Lane B requires sender authentication, acquisition never auto-creates a Lead. |
| **Deterministic gate** | `lib/communications/ingress/emailIngressEligibility.ts` — pure, provider-neutral, metadata-only inputs, typed retrieval grant. Policy `email-ingress-eligibility/2026-08-18.2`. |
| **Observe-only wiring** | Last statement of `ingestResendInboundEmail`; returns `void`; nothing reads the observations table. Non-enforcement is a property of placement, not of a try/catch. |
| **Historical replay evidence** | 65 real inbound emails, two policy versions stored side by side in `communication_ingress_eligibility_observations`. Report: `evidence/email-ingress-backtest-2026-08-18-policy-v2.json`. |
| **Capability audit** | `EMAIL-INGRESS-V2-CAPABILITY-AUDIT.md` — Google, Microsoft and Resend, with sources. |

## The findings, stated so they survive a year of not being looked at

**Lane A is promising.** 6/6 correct on the real corpus, and its matched thread equalled
the thread canonical ingestion independently chose in every case. Its evidence — an
`alloy.{uuid}` token in `In-Reply-To`/`References` — cannot be manufactured by a sender and
is unaffected by missing authentication. It is the only lane with evidence supporting even a
limited enforcement pilot, and that pilot has not been authorized.

**Lane B is not enforcement-ready.** It now matches on the canonical guardian source
(`customer_persons.role_type`), which was the correction the first backtest forced. Two
blockers remain: no historical message carries a transport authentication result, so all 23
Lane B messages sit in review rather than being measured; and household rows in the only
available tenant are uniformly active with no `end_date`, so a family that left without
being end-dated would still be admitted. Enforcement should require an enrollment
cross-check once `child_enrollment_agreements` carries real data.

**Lanes C and D are unmeasured.** The corpus contains no purpose or acquisition identity to
address — both configured identities are `conversation`. Zero is not a result here; it is an
absence of subjects. Nothing was fabricated to cover them.

**AI is not the ingress privacy authority, and must not become one.** Admission is
deterministic and happens before any model sees anything. `confidenceBasis` is a union with
one inhabitant and a database CHECK, so an AI-derived admission cannot be represented at
all. Interpretation *after* admission is a separate question and remains open.

**Google/Microsoft OAuth remains a separate governance decision.** The audit's central
finding is that neither provider offers a scope between "headers forever" and "the whole
mailbox", so a connector cannot truthfully claim it retrieves bodies only for qualifying
messages — the claim is policy backed by audit logs, never a permission boundary. On top of
that, `gmail.metadata` is itself a restricted scope carrying an annual CASA assessment that
would switch off inbound for every Google customer at once if missed, and an OAuth refresh
token inverts the deployment-provisioned credential rule in `providerCredentialCatalog.ts`.
`INBOUND-EMAIL-PRIVACY-POSTURE.md` still stands: no Gmail or Outlook OAuth without its own
decision record.

**The engagement signal is dead — do not re-propose it.** "Endpoint provenance + prior
outbound engagement" recovers 0 of 33 rejections. The three messages it was proposed for had
no outbound before they arrived: the organization replied *after*, so the engagement is the
consequence of admitting, not evidence for it. A gate runs at arrival and cannot see the
future.

## If this is ever restarted, start here

1. The recommended V1 was **never a connector**. It was customer-owned provider-side
   routing rules — a Google Workspace content-compliance or Exchange mail-flow rule matching
   `alloy\.[0-9a-f-]{36}@` in full headers — with Alloy holding no mailbox credential at all.
   That is the only architecture where "we cannot see the other 700 messages" is technically
   enforceable rather than promised.
2. The blocking measurement is a corpus with **real authentication results** and **real
   purpose/acquisition identities**. Until both exist, Lane B and Lanes C/D cannot be
   assessed, and no amount of further policy work changes that.

## What is explicitly NOT parked

The live Email round trip. That is Communications Operationalization, it is owed, and it
uses temporary Gmail forwarding as **test infrastructure only** — never as the production
mixed-inbox architecture. See `live-email-routing-test.md`.
