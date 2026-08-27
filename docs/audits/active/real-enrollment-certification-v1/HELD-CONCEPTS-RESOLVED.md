# The 28 held concepts — 15 resolved, 13 are yours

**Run:** `erun_37c4a2e8b274f101` · Nothing realized or published · Live session untouched

## 1. The 28, grouped into the decisions they actually are

Not 28 rows — **five decisions**, and none of them appear among the operator's 54 accepted discovery
decisions (checked: 0 overlap).

| Group | n | What the decision is |
|---|---|---|
| **The school's own questions** | **15** | Already well-formed prose: *"Is your child able to play alone?"*, *"How is your child comforted?"* |
| **Guardian / party facts** | 5 | `guardian.name` ×2, `guardian.address`, two employers — **ambiguous party grain** |
| **CIS exemption checkboxes** | 4 | `Module`, `Sp`, `Polio`, `Religious` — captions, not questions |
| **Headings / conditionals** | 3 | *"Developmental History:"*, *"Social relationships:"*, *"If yes, their relationship to your child:"* |
| **Structural artifact** | 1 | `subject_line` |

### Why Admissions owns 23 of 28

Because of what the sources *are*. The Admissions Packet is a **web capture of a bespoke school
intake form** — 76 concepts of natural-language "getting to know your child" prose with no canonical
Alloy destination. The CIS is a **government form** whose fields either bind canonically (name, DOB,
phone) or belong to the vaccine grid already held for Health. Holds concentrate where the source is
bespoke prose, not where it is noisy.

## 2. Resolved automatically — 15

**`held_unknown_owner` is about durable ownership, not about whether to ask.** Slice 7's doctrine is
that held means *collected but not durable*. Where the source already carries the school's own
question, Alloy asks it as a **process-scoped answer and creates no canonical field**.

The guard is narrow by design: the label must **read as a question someone wrote** — ends in `?`, or
opens with an interrogative. Those are properties of authored prose, which a bespoke intake form has
and a scanned grid does not.

**It refuses, by name and by control:** headings, checkbox captions, and anything still wearing OCR
noise. Inventing the question a heading implies is exactly the ownership guessing §4 forbids.

**Result: 28 → 13 holds.** No canonical field proposed to clear any hold.

## 3. The 13 that need you

These are ownership and meaning calls, not labelling:

1. **Guardian / party facts (5)** — should resolve through the **relationship/person owner** (§8 of
   the prior instruction), not become child fields. Needs the party-grain decision.
2. **CIS exemption checkboxes (4)** — `Module` / `Sp` / `Polio` / `Religious` belong to the
   **exemption artifact path**, not standalone questions. Confirm they are placements driven by the
   exemption route.
3. **Headings / conditionals (3)** — *"Developmental History:"* is a caption over other fields;
   *"If yes, their relationship to your child:"* is a conditional follow-up needing its parent.
4. **Structural artifact (1)** — `subject_line` should never be a question.

§10's gate is *"0 unresolved operator decisions required for publication"*, so publication is
correctly blocked on these four decisions.

## 4. Current projection on the real corpus

| Artifact | asked | hold | upload | ack | sig | placement | held | noisy-asked |
|---|---|---|---|---|---|---|---|---|
| CIS Page 1 | 4 | 1 | 1 | 1 | 2 | 2 | 8 | **0** |
| CIS Page 2 | 0 | 4 | 2 | 3 | 1 | 1 | 1 | **0** |
| Admissions | 41 | 8 | 0 | 0 | 0 | 2 | 8 | **0** |
| Tuition | 0 | 0 | 0 | 11 | 1 | 1 | 1 | **0** |
| Handbook | 0 | 0 | 0 | 0 | 1 | 1 | 0 | **0** |

**173 published fields → 45 asked concepts · 0 noisy labels · 3 uploads · 5 signatures.**
CIS immunization still **held for Health**, never asked.

## 5. 🛑 What I did not do, and why

§6 (wire into realization), §7 (shared-value propagation), §9 (re-realize), §10 (16 corpus gates),
§11 (publish), §14 (re-pin) all sit **behind** §10's gate, and that gate cannot pass while 13
concepts await four ownership decisions. Realizing and publishing now would bake those unresolved
meanings into immutable versions — trading OCR noise for silent guesses, which is the worse failure.

§3's operator review surface is buildable, but it should present **four decisions**, not 13 rows, and
its shape depends on how you answer them — particularly whether guardian facts route to the
relationship owner.

## 6. Proven untouched

* Five certified versions **byte-identical** — `8c60003a0d6b`, `989b68dd0b58`, `a2c01403df04`,
  `ab61c75d2348`, `ef517c410ef6`.
* Live session `b25caf02` — `in_progress`, index 0, 8 shared values, 0 submitted, `updated_at`
  unchanged at 17:29:08.
* Revision 1, Studio packet, Financials, safeguarding — untouched.

## 7. READY FOR PARTICIPANT RUNTIME EXPERIENCE SLICE: **NO**

Four ownership decisions, then realize → certify → publish → re-pin. The runtime slice follows clean
Forms, as agreed.
