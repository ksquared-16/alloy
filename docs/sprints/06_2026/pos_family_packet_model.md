# POS Family Packet Model — design + P0 fix (June 2026)

Branch: `claude/pos-packet-parent-submission-20260622`

Corrects the link-centric model to the **Family Packet** model:

```
Packet Definition
  → Packet Instance (household / opportunity context)
      → Selected Children
      → Recipient Access (one token per recipient, SAME instance)
      → Household answers (once) · Child answers (per child) · Recipient signatures (per recipient)
```

This pass lands the **pure model + P0 prefill fix** with tests; the runtime/UI wiring for
P1–P3 is scoped here with the smallest schema recommendation.

---

## P0 — child prefill fix (done)

**Root cause.** `resolveFormPrefillValues` only mapped prefill via `prefill_field_map`
(form-field *id* → `root.col`), and the mint only set that map for hardcoded ids
(`child_first_name`, `child_last_name`, `child_date_of_birth`). Generated/manual forms whose
child fields carry a `field_source` binding but a *different id* never prefilled — so a
selected child's Name/DOB stayed blank.

**Fix (additive, no migration).** New `lib/forms/prefill/canonicalPrefillMap.ts` derives a
prefill map from each scalar field's `field_source` (entity_type + field_key, with explicit
`crm_mapping_key` override), e.g. `{entity_type:"customer_member", field_key:"child_name"}`
→ `customer_member.display_name`, `dob`/`date_of_birth`/`birthdate` → `customer_member.dob`,
`person`/`guardian`+`email` → `person.email`. `resolveFormPrefillValues` now merges this
canonical map under the explicit `prefill_field_map` (explicit still wins). Any
canonically-bound child field prefills from the selected child's record, regardless of id.
Unknown columns resolve to `undefined` and are skipped, so the change is safe.

Tests: `tests/pos/canonicalPrefillMap.test.ts` (incl. "child Name + DOB prefill regardless
of field id"). Operators bind fields in the manual builder's field_source editor; generated
forms should be bound for prefill (follow-up).

---

## Field scope model (done — pure)

`lib/forms/fieldScope.ts` classifies each field as **household | child | recipient** from
`field_source.entity_type` + type (signatures → recipient). Config-driven; unbound fields
fall back to a caller default (household). `partitionFieldsByScope(schema)` splits a form.

## Family packet planners (done — pure)

`lib/pos/packet/familyPacketPlan.ts`:

- `buildFamilyPacketInstancePlan({anchor, children, recipients, form_ids})` → **one instance**
  with **one `RecipientAccess` per recipient** (each `access_key = instance__person`), the
  selected children, and the forms. Never a packet-per-child or packet-per-pair.
- `buildFamilyFieldScopePlan(forms, childCount, recipientCount)` → household questions
  (deduped across forms, asked **once**), child questions (deduped, asked **per child**),
  recipient signatures (**per recipient**), plus a question budget vs the naive repeat model.

Sibling example (2 children, 2 recipients, forms with a shared parent-email + child fields +
2 signatures): household=1, child=3, recipient=2 → **11** questions total, far below the
naive "complete every form per child". Tests: `tests/pos/familyPacketPlan.test.ts`.

---

## P1 — runtime: can metadata represent instance + recipient access?

**Partial.** Mapping onto existing tables:

| Concept | Existing | Gap |
| --- | --- | --- |
| Packet Instance | `form_packet_sessions` | Session is **1:1 with a public link** (`started_via_public_link_id` UNIQUE). Two recipient tokens → two sessions → **answers NOT shared**. |
| Recipient Access | `form_public_links` (one per recipient) + metadata | Need each link tagged with `packet_instance_id` + `recipient_person_id`, all resolving to the SAME session. |
| Selected children | `crm_snapshot.customer_member_id` (single) | Need a **multi-child array** (additive in session metadata — no migration). |
| Shared answers | `shared_values` (per session) | Shared only within one session; recipients on different sessions don't share. |
| Signatures per recipient | `form_submissions` signatures | Need to attribute a signature to the recipient token. |

**Metadata is sufficient for:** selected children (array in session/link metadata), recipient
identity (link metadata), grouping for display.

**Metadata is NOT sufficient for SHARED answers across recipients** — that requires multiple
links to resolve to **one** session.

**Smallest change (recommended):**
1. **Additive column** `form_packet_sessions.packet_instance_id uuid NULL` (+ index). No new
   table required.
2. Recipient tokens are `form_public_links` carrying `metadata.packet_instance_id` +
   `metadata.recipient_person_id` + `metadata.selected_customer_member_ids[]`.
3. New `ensurePacketSessionForInstance(packet_instance_id, …)` — all recipient links for an
   instance bind to the **one** session for that `packet_instance_id` (relaxing the per-link
   1:1 in favor of per-instance), so `shared_values` are genuinely shared.
4. Track recipient signatures by stamping `recipient_person_id` on the signature submission
   (metadata) — no new table now; a `form_packet_recipient_access` table is a clean future
   add for audit (deferred).

This is one nullable column + resolve-path change. No `packet_instances` table is strictly
required for the MVP.

## P2 — packet list UX

Group share rows by `packet_instance_id` → render **one family packet card** (children,
recipients, forms, progress, signatures X/Y) with **recipient access nested** beneath. The
read model already exposes per-link shares; add an instance grouping. Display is achievable
with metadata; the *shared progress* depends on the P1 single-session change.

## P3 — parent family experience

Extend the existing guided shell (welcome → review known → provide missing → uploads/sign →
submit), driven by `buildFamilyFieldScopePlan`:
- **Household** section once.
- **Child** sections looped per selected child (child-scope fields per child).
- **Recipient** signatures per token (the opening token identifies the recipient).
One cohesive enrollment experience for the whole family; never form-by-form, never per-child
restart. Field type stays the source of truth (typed controls via the engine).

---

## Schema changes avoided?

**Yes for this pass** — P0 + all planners are additive code, no migration. The only proposed
migration (P1) is a single nullable `packet_instance_id` column, deferred until the runtime
slice; metadata covers everything else.

## Validation

`tsc --noEmit` clean across the new modules + modified resolver + tests; pure logic harness
**17/17** (canonical prefill incl. child Name/DOB regression; scope classification; instance
= one access per recipient; sibling field-scope budget). Vitest suites authored
(`canonicalPrefillMap`, `familyPacketPlan`); run `npm run test -- tests/pos/` locally
(sandbox can't run vitest/build — native-binary mismatch).

## Remaining blockers (for the runtime slice, not this pass)

- Shared answers across recipients need the single-session-per-instance change (P1 #3).
- Multi-child session must carry `selected_customer_member_ids[]` (metadata) and the parent
  shell must loop child-scope fields per child (P3).
- Generated (PDF-origin) forms need `field_source` bindings to benefit from canonical
  prefill; manual builder already supports binding.
- Not built (per scope): PDF output, email, review queue, amendment, duplicate detection,
  legal e-sign.
