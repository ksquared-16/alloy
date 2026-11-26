---
owner: platform
status: proposed
last_reviewed: 2026-09-22
supersedes: []
---

# Does Operational Rules need to exist?

Not as a primary tab. **Demote it.** But the reason is not the one the mounted review
suggests, and two parts of the Director's intent should not be built yet.

Discovery only. Nothing was mutated. Every number below is measured against the deployed
primary on 2026-09-22 and the artifacts are named at the end.

## The finding that reframes the mission

The Director asked where `1:5` and `2:11` went. They are here:

    Infant A (North Campus)
      locations.metadata.student_teacher_ratio = "1:5,2:11"

    childcare_ratio_rules 31bc3220 (Infant A, room scope)
      tiers: 1 staff ≤ 4 · 2 staff ≤ 8 · 3 staff ≤ 12

**Two ratio truths for one classroom, and they disagree.** The string the Director
remembers is an untyped legacy field; the tiers the resolver actually uses say something
else entirely. Nothing was lost — but nothing reconciled them either.

This is the capacity disease one layer deeper, and it is worse in one specific way:
capacity's legacy field was at least *the same kind of number*. Here the legacy string and
the canonical tiers are different claims about staffing law.

Twelve more units carry a legacy ratio string: `1:4`, `1:6`, `1:7,2:15`, `1:8`. **Exactly
one canonical ratio rule exists in the entire database.**

## Why the Director cannot see 1:5 anywhere

`LocationOperationalRulesPanel.tsx:189`:

```ts
tiers.map((t) => `1:${t.required_staff} ≤ ${t.max_children}`)
```

A tier of *one staff for up to five children* renders as **`1:1 ≤ 5`**. The staff count is
printed in the ratio's second position, so `1:5` displays as `1:1` and `2:11` displays as
`1:2`. The canonical model holds the Director's numbers exactly; **the screen prints them
in a grammar that cannot express them.**

That is a one-line product defect sitting underneath a mission about information
architecture.

## What is actually in Operational Rules

| Family | Rows | Scopes used | Verdict |
|---|---|---|---|
| Capacity | 8 (3 closed) | room only | **already moved to the object** |
| Ratio | **1** rule, 3 tiers | room only | **move to the Operational Space** |
| Operating windows | **0** | — | never used, anywhere |
| Schedule rules | **0** | — | never used, anywhere |

**Every rule in the database is room-scoped.** Zero org, zero site, zero program. The
precedence hierarchy the page explains has never once been exercised.

## The answers

### 1–2. Physical / Operational as structural Kind — yes

It is already the canonical distinction (`physical_space` / `operational_group`), and the
data says "Classroom" is not structural: `semantic_kind` is the constant string
`"classroom"` on every unit that has it, carrying no information at all.

### 3. Type — a small system list, on Physical spaces only. Do not build a taxonomy.

The evidence against a configurable taxonomy is in the data. `metadata.category` holds
`toddler`, `preschool`, `infant`, `pre_k`, `classroom` — which is **the program vocabulary
wearing a different hat**. Building a Type authority would create a second, uncontrolled
way to say what Programs already says.

- **Operational spaces** are classified by the Programs they serve. No Type field.
- **Physical spaces** get a short system-defined Type — Room, Playground, Gym, Kitchen,
  Multipurpose — because "what kind of place is this" is genuinely not a program question,
  and a playground with no Type reads as an unnamed thing.

Not org-configurable in V1. A five-value list nobody can extend is honest; a free-text box
that half-duplicates Programs is how the `category` field became what it is.

### 4. Cardinality — one Physical to many Operational, and no more

Already true and already enforced: the database refuses a physical space inside a physical
space, and only a classroom may sit inside one. Three classrooms currently sit inside
Room 1. **Do not invent many-to-many placement**; nothing in the domain asks for it.

### 5–7. Capacity and Ratio both belong on the Operational Space

Capacity is already there. Ratio should join it, through the same shape: the object is the
authoring surface, `childcare_ratio_rules` + tiers stay the authority, and effective dating
happens without the operator administering it.

`1:5` and `2:11` map exactly onto the canonical tier model:

| Director says | Canonical tier |
|---|---|
| 1:5 | `required_staff 1, max_children 5` |
| 2:11 | `required_staff 2, max_children 11` |

The tiers are not a ratio repeated — `2:11` is deliberately not `2:10`, and that
non-linearity is exactly what the tier model exists to express. **A Space editor must
offer tiers, not a single ratio field**, or it will silently flatten the second tier away.

Proposed read grammar, in the Director's own words:

    Staffing ratio
    1 staff for up to 5 children
    2 staff for up to 11 children

### 8–11. Programs, Schedule, operating hours, defaults

- **Programs** — Operational spaces only. Already true.
- **Schedule** — the default pattern stays on the Operational space. Schedule *rules*
  (eligibility, min/max days) have **zero rows** and no operator has ever authored one.
- **Operating hours** — belong to the Site. There are **zero operating windows** and no
  site carries hours in metadata; every site has only `timezone` and `site_phone`. They are
  not hidden — they have never been configured. Build a Site hours surface when someone
  needs one, not as part of decomposing a page.
- **Defaults** — see below.

### 12. Inheritance UX — do not build it yet

This is where I disagree with the brief, and the reason is the data.

The proposed chip — *"Ratio 1:5 · From Toddler Program"* — is a good design for a system
where program and site defaults exist. **None exist.** All ten rules are room-scoped. An
inheritance display today would render "Set on this space" on every object, forever, while
adding a concept the operator has to learn.

Build the override affordance at the moment the first non-room rule is authored. Until
then it is a fixture for a hierarchy nobody uses.

### 13. Operational Rules — **B, demote it**

Not removed: rule history, future-dating and licensed ceilings need a home, and the
canonical APIs must not be deleted. But it fails every test for a primary tab:

- two of its four families have **never** been used;
- its third has moved to the object;
- its fourth should follow;
- and "that is where the rule tables are edited" is explicitly not a product reason.

Remove it from the primary Site tabs. Keep it reachable as **Advanced** from the object
whose facts it governs — which is where the existing *Advanced rules →* link already goes.

### 14. Advanced version and history destination

Behind the object, not beside it. A Space that has more than one version of a fact earns a
quiet "history" affordance; today **no room has ever had a second ratio version**, and only
three capacity rows are closed — all three from this week's work.

## Impact

| Area | Impact |
|---|---|
| Child assignment | none — targets `operational_group`, untouched |
| Staff / scheduling | none — same filter |
| Attendance | none — offers every unit regardless of role |
| OI | none — ancestry ignores role |
| Capacity | resolver unchanged; gains no new writer |
| Ratio | resolver unchanged; gains an object-level writer |
| Routes / deep links | the `operational-rules` tab key stays valid; only its placement changes |
| Rule history | untouched; nothing deleted |

## Existing-data impact

- **13 units carry a legacy ratio string.** They need the same adopt/discard review
  capacity got — and unlike capacity, adopting is not mechanical: `"1:5,2:11"` must become
  two tiers, and where a canonical rule already disagrees (Infant A) **a human must choose**.
- `metadata.category` on 14 units is program vocabulary; it should be read as a hint during
  adoption, never promoted to a Type authority.
- Nothing needs a migration to enable the model.

## Phases

1. **Ratio on the object** — tier editor, canonical writes, and the `1:N ≤ M` display
   defect fixed. This is the mission; everything else is smaller.
2. **Legacy ratio review** — the adopt/discard flow capacity already has, with the
   Infant A conflict surfaced rather than silently resolved.
3. **Kind and Type** — Physical/Operational as the structural word, system Type on physical
   spaces.
4. **Demote Operational Rules** — out of primary tabs, reachable as Advanced from objects.

Phase 1 alone closes the Director's complaint. Phases 3–4 are cheap afterwards. **Do not
run four phases as four sprints.**

## Decisions needing Kelly

1. **Ratio tiers on the Operational Space** — recommended.
2. **The `1:N ≤ M` display defect** — fix in Phase 1; it is why the numbers looked missing.
3. **Infant A's conflict**: legacy `1:5,2:11` versus canonical `1:4 / 2:8 / 3:12`. **Which
   is true?** I will not guess; it is a staffing-law claim.
4. **Type as a five-value system list on physical spaces only** — recommended.
5. **Defer inheritance UX** until a non-room rule exists — recommended, against the brief.
6. **Defer Site operating hours** — recommended; nothing has ever been configured.

## Measurements

| Claim | Artifact |
|---|---|
| rule families, counts, scopes, versions, tiers | `certification/migrations/spaces-rules-inventory.sql.results.json` |
| legacy ratio and category strings per unit; site metadata keys | `certification/migrations/spaces-legacy-ratio-category.sql.results.json` |
