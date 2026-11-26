# §1 — Is there already a safeguarding owner? No. Here is what there is.

Searched 357 migrations (263 tables) and the whole `web/` tree for: custody restrictions,
restraining/protective orders, pickup restrictions, contact restrictions, court-order evidence,
effective-dated child restrictions, and safety/access restrictions.

## What exists, and why none of it is the owner

| What | Where | Why it is not the owner |
|---|---|---|
| `custody_notes` | `person_child_relationships` config field | **This is the anti-pattern the decision names.** Free text on ONE relationship edge. It answers "what should I know about this person's relationship", not "what restriction is active on this child". No state, no dates, no evidence, no approval, and nothing can act on it. |
| `pickup_instructions` | same registry | Same shape. An instruction is not a restriction: "use the side door" and "this person may not collect her" are not the same kind of fact and must not share a destination. |
| `authorized_pickup` | same registry | A *positive* relationship fact. The decision is explicit that a restriction must not be encoded as its negation. |
| `documents` | `documents` table | Polymorphic `entity_type`/`entity_id`, `doc_type`, checksum, versions. This IS the evidence owner and stays that way — the safeguarding record will reference it, never copy it. |
| `permission_definitions` + `capabilityTaxonomy` | access stack | The access doctrine exists. `IA-R6` forbids simulating unbuilt capability, which constrains how a safeguarding permission may be surfaced. |
| Identity Command registry | `lib/pos/processingIdentity/commands` | `propose_merge` carries `executableInV1: false` — a command that proposes and cannot execute. That is the precedent for §6's approval boundary, already built. |

No table in the schema is named for a restriction, alert, flag, hold, order, or safeguarding
concern. There is no effective-dated child-scoped state of any kind.

## The one-line finding

> Alloy can say **who someone is to a child**. It has never been able to say **what is currently
> forbidden**. `custody_notes` looks like the answer and is the reason the gap was invisible: a
> free-text note on a relationship reads as coverage while carrying nothing an operational decision
> can consult.

## What that means for V1

Build the narrowest thing the real packet proves, reusing:

- **Documents** for evidence (reference, never duplicate).
- **The permission stack** for the access boundary.
- **The Identity Command registry** for the approval boundary — a propose-only command, exactly as
  `propose_merge` already is.

And build **nothing** that the packet does not prove: no case management, no incident log, no
welfare ontology, no operator UI.
