# OPEN PRODUCT DECISIONS — what a child surface needs before it can render

**Status:** OPEN, blocking Phase E4/E5. **Recorded:** 2026-07-30. **Not decided here.**
**Context:** `GRAIN-AUTHORITY-MAP.md`, `SECOND-SURFACE-INVENTORY.md`. The child **row provider** is done and
proven (`74fa651db`); these block the child **panel**.

---

## The measured facts

Firefly's Enrollment business process, read from `departments.metadata.lifecycle_builder_v1`:

| stage | grain | primary action | work template |
|---|:--:|---|---|
| `lead` | family | `quick_message` | — |
| `tour` | family | `schedule_tour` | — |
| **`decision`** | **child** | **NONE** | — |
| **`waitlist`** | **child** | **NONE** | — |
| **`enrolling`** | **child** | **NONE** | — |
| **`enrolled`** | **child** | **NONE** | — |

And the 11 real child participations all carry `stage_key = NULL`, so they ride their family's **`lead`** —
a **family**-grain stage.

## Blocker 1 — no child-grain lens reaches the children that exist

The 11 children are at `lead`. `lead` is family grain. Registration and Waitlist select
`enrolling`/`enrolled`/`waitlist`, which no child holds. **There is no configured lens through which a real
child can appear.**

Making one means either re-graining `lead` to `child` (which would break the family surface — 7 opportunity
rows and the certified 4-card panel) or authoring a new child-grain Work View on the live tenant. Both are
changes to production tenant configuration, and the second answers a question engineering cannot:
**which children belong in an operator's lens, and what is that lens for?**

## Blocker 2 — a child answer cannot be `operational` under current doctrine

The provisioning answer's frozen law: *"Identity alone is not operational: without current business state
AND a truthful primary action the answer does not claim `operational`."* It refuses with
`no_truthful_primary_action` when a stage offers no plan/template/`action_ref`.

**Every child-grain stage Firefly configures has no action at all.** So even with rows, a child answer at
`decision`/`waitlist`/`enrolling`/`enrolled` would refuse — correctly. And the stages that *do* have actions
are family-grain, with family actions: `quick_message` and `schedule_tour` are things you do to a
**household**, not to a child.

This is Phase E3's question arriving as a hard gate rather than a classification exercise: **there is
currently no truthful, executable command for a child subject at any configured stage.**

## What I will not do unilaterally

- **Re-map a family action onto the child** to populate the surface. `quick_message` on a child is a
  fabricated capability; the sprint brief forbids it and so does the truthfulness law.
- **Relax the truthful-primary-action law** so identity alone counts as operational. That law is frozen and
  is the reason the Runtime does not present decorative surfaces.
- **Mutate Firefly's tenant configuration** — re-graining a stage or authoring a Work View — to manufacture
  a demonstrable surface. That is changing the tenant to fit the test.
- **Seed child operational data.** Standing law, and it would make the proof worthless.

## The decisions needed

1. **Which children should an operator see, and in what lens?** A "Children in enrollment" lens that
   includes lead-stage children is plausible and would immediately surface all 11 — but whether a child
   riding a family's lead belongs in an operator lens *before* any placement decision is a product call.
2. **What can an operator legitimately DO to a child at each stage?** Until at least one child-valid command
   exists, a child surface can present identity and context but cannot claim `operational`. Candidates that
   already exist as capabilities with `supportedSubjects` including `child`: `assignment.create`,
   `assignment.change_room`, `add_parent_guardian`, `add_emergency_contact` — but assignment commands
   presuppose placement data the tenant does not have.
3. **Is an identity-only child surface acceptable?** i.e. should the Runtime gain a terminal for "a real
   subject with real truth and no available command"? That is a doctrine change, not a bug fix.

## What is buildable without any of these answers

- Child subject truth (E1) — identity, family context, participation, effective stage, household links.
- A child stage/work projection (E2) that honestly reports *no configured work* at child stages.
- The action inventory (E3) as a written classification.

These are worth building and do not depend on the decisions above. What they **cannot** do is produce a
rendered, `operational` child panel on this tenant — which is what Phase E5 asks to prove.
