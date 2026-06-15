# Card 16 — Drawer composer recipient resolution (execution notes)

## Files inspected (discovery)

| Path | Role |
|------|------|
| `web/components/admin/AdminEntityDrawer.tsx` | Where `CommunicationsDrawerSection` mounts; `active` gating for some paths |
| `web/lib/communications/drawerEmailRecipients.ts` | **Source of truth** for person-first recipient lists |
| `web/app/api/admin/communications/drawer-recipients/route.ts` | Read-only GET aggregator (org + entity scoped) |
| `web/app/api/admin/communications/send/route.ts` | Validates `recipient_person_id` against same eligibility rules |

## Recipient source (confirmed)

| Entity | Data source | Logic |
|--------|-------------|--------|
| **Opportunities** | `opportunity_persons` + `opportunities.primary_person_id` | Union person ids; load `persons` for org; **exclude** rows without usable email; stable sort; **one** `is_suggested_default`: primary with email, else first sorted with email |
| **Jobs** | `jobs` → `customer_id`, `opportunity_id`, `primary_person_id` | `customer_persons` for customer; optional `opportunity_persons` when `opportunity_id` set; union `primary_person_id`; same email filter and default policy |

**Not used for composer:** `contacts`, `contact_id`, or any contact-first branching.

## Normalization / edge cases (behavior)

- Email: trim + lowercase for dedupe keys in code paths that compare; checklist rows keyed by **`person_id`** (same email on two persons ⇒ two rows).
- Primary person without email but another linked person has email ⇒ default selects first eligible in **stable sort** (implemented in fetch helpers).
- No person with email ⇒ empty checklist; UI disables send with copy per sprint doc.
- Threading / enqueue: canonical path uses normalized email as `to` after server-side eligibility check (`assertRecipientPersonEligibleForDrawerEmail` + `persons.email`).

## UI spec (checklist — Card 17)

- One subsection **Email (queued send)** above thread expand affordance.
- Checkboxes per person row: display name · email · optional relationship hint.
- Pre-check `is_suggested_default` recipient(s); user must confirm multi-send explicitly.
