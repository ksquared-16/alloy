# Slice 6 — Safeguarding Owner + First Publish Readiness · closeout

**Publication readiness: YES**, with one boundary stated plainly below. Ownerless concepts: **0**.

---

## 1. The safeguarding owner

Full investigation in [`slice-6-safeguarding-investigation.md`](slice-6-safeguarding-investigation.md).
No canonical owner existed. What existed was `custody_notes` — free text on one relationship edge —
and that is exactly why the gap was invisible: it reads as coverage while carrying nothing an
operational decision can consult.

**`child_safeguarding_restrictions`** is the owner. One row per restriction, on the **child**:

| Semantics required | How |
|---|---|
| child / subject | `customer_member_id` — a restriction protects a child, so the child is the grain even when it is about an adult |
| restriction kind | `custody_restriction \| protective_or_restraining_order \| pickup_or_contact_restriction` |
| affected party | `affected_person_id` **nullable**, plus `affected_party_description` — "there is a custody arrangement" names nobody, and forcing a name would invent a fact |
| operational effect | `may_not_pick_up \| contact_restricted \| informational_only`, **separate from the kind** — a restraining order and a custody arrangement can carry the same effect, and the same kind can carry different effects in two families |
| active / effective state | `status`, plus a CHECK that only an **approved** row may be `active` |
| effective dates | `effective_from` / `effective_to` |
| evidence | `evidence_document_id` → `documents`, plus a **required** `evidence_basis` |
| provenance | `source` (`enrollment_form \| processing_case \| operator`) + `source_reference`, kept distinct from who approved |
| review / approval | `review_state`, `reviewed_by`, `reviewed_at`, `review_note` |
| supersession / history | `supersedes_id` — a change supersedes, never edits, so the state on a past date stays answerable |

**Not a negative relationship.** `authorized_pickup` and an active "may not pick up" restriction may
both be true. Modelling the restriction as `prohibited_pickup` would collapse them, and then revoking
a restriction becomes indistinguishable from deleting a family tie.

## 2. Evidence

Documents keeps the artifact. The restriction references it and never copies its content.

`evidence_basis` is **required** and has three values, because the requirement is that absence of a
document stays distinguishable from absence of a restriction. A parent's word is evidence — a
different kind of evidence — and flattening that difference is precisely how a missing court order
would come to read as a missing restriction. `tests/safeguarding/resolvePickupAuthorization.test.ts`
asserts that a `parent_declaration` with no document still blocks pickup.

## 3. Relationship resolution semantics

`resolvePickupAuthorization` is the canonical seam. **Three outcomes, not two.**

- `restricted` — an in-force restriction bars this person. Checked **first**: evaluating the
  relationship first and looking for exceptions after is how the exception gets skipped on the path
  where the relationship already said yes. The result states out loud that the person is *also* an
  authorized pickup, so nobody concludes the relationship was deleted.
- `authorized` — listed as authorized pickup, screening established, nothing in force.
- `unknown` — everything else, and it is the outcome that matters. A system that has never asked
  about safeguarding must not answer the same as one that asked and found nothing. A contact
  restriction is `unknown` rather than a guess in either direction; a child-general restriction with
  no named party is `unknown`, never an all-clear.

**Required negative control (§4), passing:** authorized_pickup relationship + active `may_not_pick_up`
→ `state: "restricted"`, `authorized: false`. It still refuses when the relationship is absent, which
is what proves the restriction is not the relationship's negation.

### Operational consumers that must adopt this later

There is **no current consumer** — nothing in Alloy today asks "may this person collect this child",
which is why the seam ships with a negative control rather than a redesign.

| Consumer | Status | What adoption means |
|---|---|---|
| Household Focus Panel → **"Authorized pickups"** (`buildHouseholdCardEvidence.ts:595`) | **exists today, does not consult the seam** | It lists people from the relationship alone. A restricted person appears there as authorized with nothing contradicting it. Nearest and highest-value adopter. |
| Attendance departure / check-out | **capability does not exist** | `child_attendance_events` records presence, not who collected the child. When collection is recorded, it must resolve through this seam before it is built, not after. |
| Roster / Operations person projections of `authorized_pickup` | presentational today | Must show restriction state wherever pickup authority is displayed as a fact. |

## 4. Access and sensitivity boundary

- **Two capability keys**, registered in `permission_definitions`:
  `crm.customers.safeguarding.view` and `crm.customers.safeguarding.manage`.
- **RLS is narrower than the comparable relationship table.** `person_child_relationships` admits
  `owner/admin/ops/manager`; safeguarding reads admit `owner/admin/ops` — **`manager` is not on the
  list**, because a child's protective order is not ordinary profile content. Writes are narrower
  still (`owner/admin`).
- **This never becomes child-profile content.** No manifest row, no `field_definitions` seed, no
  layout catalog entry. It is not reachable through the child-profile surfaces at all.
- **No Safeguarding UI was built**, per the boundary. Following `IA-R6`, no capability area was
  invented for a surface that does not exist; the keys map into the existing `crm` group.

## 5. Processing / Trust handoff

The chain is preserved: enrollment response or document → Processing fact/evidence → operator or
governed approval → canonical safeguarding mutation.

`propose_safeguarding_restriction` is registered in the canonical Identity Command registry with
`executableInV1: false` — the same shape `propose_merge` already had. Two independent guarantees:

1. **The boundary is in the TYPE.** The payload has no `status`, no `review_state`, no `approved_by`.
   A caller cannot activate a restriction even by trying, because the vocabulary for activation is
   not there.
2. **The database enforces it separately** — `CHECK (status <> 'active' OR review_state = 'approved')`
   — so it holds for callers that never go through the registry.

The failure this prevents runs both ways. A parent typing "her father isn't allowed to get her" must
not switch on a safety control by itself — and the assertion must not evaporate either. It travels
as a proposal and waits for a person.

## 6. Real packet adoption

**`NEEDS_CANONICAL_SAFEGUARDING_OWNER` → 0.** The state is retired, and a control asserts no rule can
emit it, so the retirement is a fact rather than a claim.

Three proposals now bind to the safeguarding owner:

| Question | Kind |
|---|---|
| "Are there any custody or visiting arrangements we need to be aware of?" | `custody_restriction` |
| "If yes, please explain arrangements and custody:" | `custody_restriction` |
| "Is there anyone who has a legal restraining order prohibiting or limiting contact with your child?" | `protective_or_restraining_order` |

The third row is a gain that was not asked for: the "if yes, please explain" follow-up was a
`form_only_response` in Slice 5 — the explanation of a custody arrangement filed as artifact text.
It belongs with the restriction.

**Neither concept is flattened into a generic child field.** The safeguarding branch runs *ahead of*
field matching precisely because these questions match ordinary text destinations and would otherwise
land in a child text box — the `custody_notes` failure with extra steps. Asserted directly: no
`proposed_field`, no `target_field_source`.

**No operational effect is inferred from a question.** A form question rarely states the terms of an
order, and deciding "may not pick up" from "is there a restraining order?" would be Alloy deciding
what a court decided. The operator supplies the effect at approval.

## 7. The updated denominator

180 destinations, 86 merged facts, 32 obligations — unchanged totals, so nothing was lost.

| Outcome | Facts | Change from Slice 5 |
|---|---|---|
| New field proposed (unapproved) | 57 | — |
| Held for the Health foundation | 10 | −2 (the safeguarding pair left) |
| Bound to an existing canonical field | 7 | — |
| Relationship binding | 5 | — |
| **Safeguarding binding** | **3** | **+3** |
| Form-only response | 4 | −1 (moved to safeguarding) |

### First-publish ownership (§10) — every concept, obligations included

| Ownership | Distinct concepts |
|---|---|
| `PROCESS_SCOPED_FOR_CERTIFICATION` | 61 |
| `ARTIFACT_SPECIFIC` | 14 |
| `HELD_PENDING_HEALTH` | 13 |
| `CANONICAL` | 10 |
| `RELATIONSHIP` | 5 |
| `DOCUMENT` | 3 |
| `HELD_PENDING_REQUIREMENT_EXCEPTION` | 1 |
| `HELD_PENDING_CONSENT` | 1 |
| **`OWNERLESS`** | **0** |

One classification decision is worth stating because it makes the numbers look worse: **a
proposed-but-unapproved new field is counted `PROCESS_SCOPED_FOR_CERTIFICATION`, not `CANONICAL`.**
The Field System owns it only after an operator approves creation. Counting 57 unapproved proposals
as canonical is exactly how a publish comes to imply durable behaviour it does not have.

## 8. TIME (§9)

Recorded as separate platform debt in
[`slice-5-time-stop-report.md`](slice-5-time-stop-report.md), with the correction durable: **the
`HH:mm` contract already exists in `alloyTimeValue.ts`; the problem is adoption, not invention.**

Not expanded in this slice — the publish does not require it.
`tests/forms/timeTypeAdoptionRatchet.test.ts` makes the debt self-enforcing: `time` must exist in
**every** surface or in none, and the three dangerous defaults are asserted by name so they are not
rediscovered the hard way —

- submission validation falls through to no error;
- the renderer returns `null`, producing an invisible **required** question;
- the Participant Runtime validator defaults an unknown type to valid, so `"whenever"` would be a
  valid bedtime.

Plus the eighth surface: `field_definitions.field_type` still has no CHECK constraint in any
migration, and the ratchet fails if that ever changes so the report cannot go stale silently.

## 9. Can this packet be published honestly?

**Yes** — as a certification Enrollment configuration, with this said out loud:

> Every question in this packet has an owner. Ten immunization and medication questions are
> collected as **process-scoped answers, not as durable health records** — Alloy does not yet have a
> health record to put them in, and the packet does not pretend otherwise. Fifty-seven further
> questions are collected as form responses unless the operator approves the proposed fields during
> review. Three safeguarding questions record real restrictions, and each one waits for a person to
> approve it before it constrains anything.

What makes that honest rather than a hedge is that nothing in the configuration claims more: no held
concept carries a creatable field, no unapproved proposal is counted as canonical, and no
safeguarding assertion can activate itself.

### The proposed first certification publish

- **Packet:** School of Enrichment admissions packet — 3 sources, 4 logical artifacts, 180
  destinations.
- **Publish:** the packet configuration with **canonical bindings and relationship bindings accepted**
  (10 canonical + 5 relationship), **all 32 obligations**, and the **3 safeguarding proposals**.
- **Do not accept at publish:** the 57 proposed new fields, and the 10 held health concepts. Both
  stay collected and process-scoped.
- **After publish:** nothing becomes active in safeguarding until approved through
  `crm.customers.safeguarding.manage`.

**Stopped before publication, as instructed.** Awaiting your browser review —
[`slice-6-browser-review.md`](slice-6-browser-review.md) has the URL and steps.

## Boundary

Not built: H1–H4, Consent, requirement exceptions, M2 legacy allergy interpretation, conversation
packaging, any Safeguarding UI, any Roster/Attendance redesign. Nothing published.
