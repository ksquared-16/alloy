# Alloy Developer Platform — Technical Package

**Prepared for:** an integration partner's engineering team
**Contains:** everything needed to understand and design against Alloy's public
API. No Alloy repository access, login, or prior knowledge of Alloy's internals
is required to read any of it.

---

## What Alloy is asking of you

This package describes **Alloy's canonical external contract** — the resources
Alloy can expose, what they mean, and how they behave.

It deliberately does **not** describe how your system works. We have not assumed
your schema, your identifiers, your attendance model, your room model or your
identity model, because guessing at them would produce a mapping that looks
agreed and is not.

What we would like back is the other half: **how your system maps to this.**
Worksheet `06` is the shape of that answer, and `07` lists the specific questions
we cannot answer from our side.

---

## Read in this order

| | Document | What it covers |
| --- | --- | --- |
| 1 | **`01-integrating-with-alloy.md`** | The whole integration in one read. Start here. |
| 2 | **`02-technical-specification.md`** | Every endpoint, field, parameter and limit, in full. |
| 3 | **`03-openapi/alloy-public-api.v1.json`** | The machine-readable contract. Import it into your tooling. |
| 4 | **`06-mapping-worksheet.md`** | The mapping we are asking you to complete. |
| 5 | **`07-discovery-questions.md`** | What we still need to know from you. |

An engineer who reads `01` end to end can design the integration. `02` and `03`
are what they will keep open while building it.

---

## Where each required topic is answered

| Topic | Document | Section |
| --- | --- | --- |
| Platform overview | `01` | §1–2 |
| Application / Installation / Credential model | `01` | §2 |
| Authentication flow | `01` §2, `02` | §3 |
| Tenant and resource authority | `01` §3, `02` | §4 |
| Scope model | `01` §3, `02` | §5 |
| Resource catalog | `02` | §6–11 |
| Operation catalog | `02` | §2 |
| Resource schemas | `02` §6–11, `03` | components |
| Resource graph | `01` §4, `02` | §8–11 |
| Pagination | `01` §6, `02` | §7 |
| Incremental synchronization | `01` §6, `02` | §7 |
| Archive / lifecycle semantics | `01` §7, `02` | §7, §17 |
| Idempotency | `01` §9, `02` | §14 |
| Concurrency and retry | `01` §9, `02` | §14 |
| Errors | `01` §10, `02` | §12 |
| Rate limits | `01` §10, `02` | §13 |
| External ID correlation | `01` §5, `02` | §14 |
| Event / webhook posture | `01` §12, `02` | §18 |
| Current limitations | `01` §12, `02` | §18 |
| Mapping worksheet | `06` | — |
| Discovery questions | `07` | — |
| Governed OpenAPI | `03` | — |

---

## Ten things worth knowing before you read anything else

1. **A token resolves to one organization.** There is no tenant parameter
   anywhere, and no way to ask about another organization.
2. **Locations are sites and the rooms inside them.** Every other resource refers
   to a place using these identifiers. There is no second room model.
3. **A child is visible through enrollment, not organization membership.** A
   child with no enrollment at a site you can reach does not appear, in any
   configuration. Expect fewer children than the organization has records for.
4. **Seeing a household does not mean seeing everyone in it.** Siblings enrolled
   somewhere you cannot reach stay invisible — no name, no id, no count.
5. **Contact details are a separate, stronger permission** than knowing who
   someone is.
6. **Pickup authority, where exposed, is a computed answer with no reason.**
   Alloy says yes or no; it never says why, and the underlying safeguarding
   information is not available under any permission.
7. **Attendance is append-only history.** Mistakes are corrected by recording a
   correction or reversal, never by editing or deleting.
8. **Every write is a governed operation, not CRUD.** Ten exist: nine
   service-state operations (start, end or void an enrollment; assign, move or
   cancel a placement; set, change or cancel a schedule) and Attendance fact
   submission, which carries three intents — a fact, a correction, or a reversal
   — through one endpoint. You assert an intent;
   Alloy decides whether it may be performed. There is no `PUT`, `PATCH` or
   `DELETE` anywhere.
9. **Enrollment, Placement, Schedule Assignment and Schedule Day are four
   different things** and change independently. Schedule assignments are stored
   and synchronizable; schedule days are derived and are not.
10. **Synchronization is polling with checkpoints.** There are no webhooks in
    V1, and none is needed for correctness — only for latency.

---

## What is not in this package

Stated here so it is not discovered late:

- **Communications** — messaging, consent and deliverability are not externalized.
- **Financials** — charges, balances and payment state have no public contract.
- **Webhooks / push delivery** — not part of V1.
- **Health, allergy, medical, dietary or safeguarding data** — not available on
  any endpoint under any permission.
- **A self-service correlation API** — identifier mappings are established with
  Alloy during onboarding.

If your integration depends on any of these, tell us early. Several are
deliberate product decisions rather than unbuilt work, and the distinction
matters to what can change.
