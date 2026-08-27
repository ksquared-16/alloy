# The certification case is real. 50 decisions persisted. Your review is next.

Built entirely through the product path — no direct service invocation, no fixture helper.
Permit held. Shared dev untouched (the app process holds no credential for it).

---

## Signed-in URL and steps

    http://127.0.0.1:3014/login

Sign in as `qa.operator@northwind.invalid` *(password: `~/.local/state/alloy-dev/gateway/auth/slot4/cert-operator.secret`, mode 600 — not reproduced here)*.

Then: **sidebar → Processing → Recent work → `school-of-enrichment-family-handbook.pdf`**. It is the
only active case; the four cases from my earlier attempts are archived.

## Identity

| | |
|---|---|
| Certification org | `00000000-0000-4000-8000-000000000001` — Northwind Early Learning |
| Operator | `qa.operator@northwind.invalid` · one membership · `admin` |
| **Processing case** | **`89caf3ec-2c3d-4286-a022-524bdaad16a8`** |

## The three sources, and their hashes

| Role | Document | SHA-256 in tenant | Matches corpus |
|---|---|---|---|
| `primary` | school-of-enrichment-family-handbook.pdf | `feb7ee80…8abe8a` | ✅ |
| `related` | oregon-certificate-of-immunization-status.pdf | `cda2af9f…e357388` | ✅ |
| `related` | school-of-enrichment-admissions-packet.capture.html | `10c05372…9dba2ca` | ✅ |

Exactly one primary · exactly three sources · no second case created by either attach.

## Tenant analysis vs `FIXTURE-CERTIFIED-EXPECTATIONS.md`

Run through the production action (`mode: "packet"`), read back from the tenant:

| | Fixture | Tenant |
|---|---|---|
| Sources | 3 | **3** |
| Normalized destinations | 180 | **180** |
| Obligations | 32 | **32** |
| Correlations | 3 | **3** |

Dispositions — **identical, every one**: acknowledgement 28 · upload_requirement 4 ·
held_for_canonical_owner 14 · reuse_canonical_field 21 · held_unknown_owner 28 ·
form_only_response 4 · derived_value_system 8 · signature_requirement 6 · safeguarding_binding 3 ·
relationship_binding 5 · financial_payment 6.

## Safe acceptance — persisted, then read back

**50 accepted**, written through the same `discovery-decisions` endpoint the "Accept safe to accept"
button uses, selected by the same `isBulkAcceptSafe` predicate. Read back from tenant state: 50
records, 50 accepted. These are durable operator decisions, not a helper's return value.

## What remains for you — **31 decisions**

| Reason | Count | What "Accept" means |
|---|---|---|
| Owner undecided | 25 | Keep it with this enrollment. **No durable field is created**; the answer stays a form response until someone decides it is durable truth. |
| Sensitive restriction | 3 | Propose a safeguarding restriction. Nothing becomes active until separately approved through `crm.customers.safeguarding.manage`. |
| Unsupported type | 2 | Bedtime / wake time. Accepting keeps them as form answers — Alloy has the `HH:mm` contract but the form type system has not adopted it. |
| Ambiguous grain | 1 | A canonical field matched and was refused because it belongs to another party. Accepting keeps the refusal. |

By disposition: `held_unknown_owner` 28 · `safeguarding_binding` 3.

**None of these blocks publication.** Every one already has an honest owner or an explicitly bounded
disposition; accepting them changes presentation, not ownership.

## One honest gap in the operator path

The **Add source** control this run added lives in the case setup column. The certification case
opens directly into concept review, where that action bar is not rendered — so I drove the three
uploads through the same endpoint the control calls, with the operator's own session, rather than
clicking it. The API path, the authorization and the writes are the production ones; the button
placement is not yet reachable from this particular entry state. Worth a small follow-up, and it does
not affect anything above.

## State

Permit held. No publish. No shared-dev write. Branch clean.
