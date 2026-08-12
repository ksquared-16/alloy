---
owner: platform
status: audit
last_reviewed: 2026-08-11
slot: 3
branch: agent/claude/3-communications-inbound-sms
---

# Location-specific Communications identities — runtime audit

**Scope discipline:** this audits only the seams needed to answer the four
questions asked. It is not a survey of the Communications platform.

**Headline: do not ship location-specific identities yet.** Not because the
resolver is missing — one exists and is better than the requested minimum — but
because **an operational conversation carries no location**, so the resolver has
nothing to resolve *from* on the reply half. Building the UI now would be exactly
the "fake it before the runtime can resolve it" failure the instruction warns off.

---

## Q1 — Does every operational conversation/send have reliable location context?

**No. This is the blocker.**

`communication_threads` has a `location_id` column, but the canonical enqueue path
does not use it as a resolution key — it explicitly matches threads on
`location_id IS NULL`:

    web/lib/communications/canonicalOutboundEnqueue.ts:57   .is("location_id", null)
    web/lib/communications/canonicalOutboundEnqueue.ts:90   .is("location_id", null)

Thread identity is `(org_id, primary_entity_type, primary_entity_id, channel,
recipient_key)` — **no location dimension**
(`20260430254100_communications_v1_foundation.sql:45`). Location arrives only as
advisory metadata:

    web/lib/communications/canonicalOutboundEnqueue.ts:324   meta.context_location_id = params.contextLocationId

So a send *initiated* from a location-aware surface can carry a location hint, but
the thread it lands in is org-grained, and **a reply arriving on that thread has
no location at all**. Sending could be made location-aware today; receiving could
not. Shipping half of it would produce a channel that sends as the Bend location
and files every reply under the organization — worse than not offering it.

**What would have to change first:** thread identity would need a location
dimension, or an explicit rule that location is a property of the *conversation's
subject* rather than the thread. That is a Conversation Platform decision with
migration consequences, not a configuration-surface change.

## Q2 — Can `communication_provider_bindings` represent an org default and a location override?

**Yes, structurally — today, with no migration.**

`scope text CHECK (scope IN ('org','location','user'))` and a nullable
`location_id` already exist (`20260430254100:8-10`), and there is already an index
on `(org_id, location_id, channel, scope) WHERE status = 'active'` (`:30`).

Two caveats:

1. `is_primary` is not scoped by location. The PATCH route clears `is_primary`
   across the whole `(org, channel)` when one is set. A location override marked
   primary would silently demote the organization default.
2. Nothing enforces at most one active `location` binding per
   `(org, location, channel)`. Precedence would be non-deterministic between two.

Both are narrow fixes, but neither is worth doing until Q1 is answered.

## Q3 — Can inbound receiving identities be location-owned without weakening tenant ownership?

**Yes — the constraint shape already permits it, and this is the reassuring answer.**

Tenant ownership resolves from the receiving identity, not from location:

    communication_bindings_inbound_address_uq  (provider, channel, lower(inbound_address))
    communication_bindings_inbound_to_e164_uq  (provider, channel, btrim(inbound_to_e164))   ← added this pass

Neither index mentions `org_id` **or** `location_id`. A location-owned receiving
address is therefore just another globally-unique address that happens to belong to
a location-scoped binding. Ownership is unweakened: one address still resolves to
exactly one binding, hence one tenant.

`resolveInboundEmailOwnership` already returns the owning binding — which carries
`location_id` — so the location could be *derived* from the receiving identity at
ingestion. **That is the promising path for Q1**, and it is worth recording: the
receiving address is a stronger location signal than the thread, because a family
that writes to `bend@…` has told you which site they mean.

## Q4 — Where should the canonical identity resolver live?

**It already exists, and it already exceeds the requested minimum.**

    web/lib/communications/identity/resolveSenderIdentity.ts   (pure)
    web/lib/communications/identity/resolveOutboundSender.ts   (DB-backed wrapper)

It is channel-agnostic — `channel` is an input, not a branch — and its precedence
is a superset of the requested one:

| Level | Reason |
|---|---|
| 0 | explicit authorized override |
| 10 | **location default** |
| 20 / 25 | **location priority** |
| 30 | **tenant default** |
| 40 | any tenant-scoped eligible |
| 90 | legacy compatibility fallback |
| — | `NO_ELIGIBLE_IDENTITY` → **unavailable** |

**But it is DORMANT.** Its only non-test caller is a diagnostic route
(`web/app/api/admin/communications/identities/route.ts:58`). The live send path
does not use it:

- `enqueueCanonicalOutboundMessage` persists `communication_provider_binding_id`
- the Python dispatcher reads that binding's `config.from_email` and `secret_ref`
  (`backend/app/services/communication_message_sender.py:379-388`)

It reads the identity platform's tables (`communication_identities`,
`communication_provider_accounts`, `communication_identity_location_bindings`),
which were populated by a **one-time `DO $$` backfill** inside
`20260715120000_communications_identity_platform_foundation.sql:257`. There is no
sync trigger — the only triggers on those tables are `updated_at`.

**Consequence worth stating plainly:** a binding created through the new connect
flow gets **no** canonical identity row. That is harmless today, because the live
send path never consults them. It would become a correctness problem the moment
the dormant resolver is switched on, and that ordering must not be forgotten.

**Recommendation:** do not write a second resolver. When Q1 is resolved, the work
is to *activate* this one — backfill-on-write or a trigger, then move the send path
onto it — not to reimplement precedence over `communication_provider_bindings`.

---

## Recommendation

1. **Do not ship location-specific identity UI now.** Q1 fails.
2. **Do not build a second resolver.** Q4 says one exists and is better.
3. The cheapest path to Q1 is Q3's observation: derive location from the
   **receiving identity** at ingestion, which is both available and meaningful.
4. Sequencing, if authorized: receiving-identity → location derivation → thread
   location grain → activate the dormant resolver → then the configuration UI.

Until then the surface is **organization-level only**, and says so rather than
offering a control that would not be honoured.
