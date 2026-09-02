# Collection choreography — closeout

Participant Runtime R1–R6. Closes the collection half of Real Enrollment V1: how a parent is asked
about the people involved with their child, and how those people reach the documents they sign.

Durable behaviour is recorded in its canonical owner —
[`docs/platform/core/data/relationship-model.md`](../../../platform/core/data/relationship-model.md),
section **Participant collection and artifact projection**. This file records only what closed, what
was deliberately not built, and the defects worth remembering.

## What changed for the parent

Before, a parent met the packet's field order: eight consecutive turns to confirm nothing about
their child had changed, questions like `Middle Name?` with no subject, `Parent/Guardian #2 Name`
as a conversational identity, and one phone number that reached six different people's boxes.

Now the conversation is about people and subjects — known facts confirmed by subject in one card,
missing facts collected, then "would you like to add another parent or guardian?" with the people
the household already knows offered by name.

## Defects worth remembering

| Defect | Why it survived so long |
|---|---|
| `state === "confirmed"` was read as "the parent confirmed this" | The runtime records D-99 evidence for values a participant SUPPLIES too, or a corrected fact re-opens and is asked again. `confirmed` means *evidenced*. A card headed "Confirmed" accumulated every question the parent had just answered. |
| One phone number in six people's boxes | Six destinations declare `person:phone`. The ask-once layer is right that they are one canonical key; nothing told it they belong to six parties. |
| `Unsupported operational role "physician"` | The write boundary validated against the platform-FIXED role constant, not the full vocabulary — so a role with a full definition row was refused, contradicting the model's own "one definition row" promise. |
| Artifact capacity read as obligation | `minimumPartiesRequired` returned 1 whenever an artifact offered a role, quietly turning three printed rows into a requirement. |
| Review list disagreed with the document | The list compiled from the draft payload while the document rendered from a fuller assembly, so a guardian's destination read blank beside a document that printed their name. |

Two of these were found only by running the product — attaching a physician, and reading a live
transcript — not by reading the code.

## Method notes

- A **not-found claim needs a positive control.** A PDF text extractor returned zero characters and
  would have reported "the parties are not in the document"; checking whether the child's own name
  was also missing showed the extractor was at fault.
- A **contamination test's poison value must belong to nobody.** One collided with the real
  guardian's phone number and reported a false survivor.
- A **planted-value test that matches no row proves nothing.** One UPDATE targeted an empty id and
  silently no-opped; its clean result was worthless.

## Deferred product polish

**Contextual second-role conversational offer** — after a person is attached, asking e.g.
*"Should Thierry also be authorized for pickup?"*

**Status: DEFERRED PRODUCT POLISH.** The canonical relationship and multi-role model already support
it: one person, one relationship edge, several roles, all certified end to end through the service
and the projection. No architecture work is required — what is missing is only the conversational
offer, which needs a post-attachment turn state in `collect_party`.

This is **not** current required behaviour and must not be read as doctrine. A person receives a
second role today through the same generic party interaction by being offered again for that role.

## Not in this scope

Health/immunisation extraction, Form-requirement transition enforcement, Enrolling → Enrolled
advancement, waiver/exception model, canonical Consent, Financials, D-101 expansion, localization.
