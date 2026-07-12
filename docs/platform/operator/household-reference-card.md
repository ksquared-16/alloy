---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Alloy OS — Household Reference Card (Identity Archetype Design Freeze)

**Status:** **Correction pass (June 2026) — pending re-approval.** v1 implementation exists; this pass fixes icon, Children focus routing, other-parent visibility, address group, and documents Subject Change + Experience Builder configurability.

> **Correction pass fixes (June 2026):**
> - **Icon:** platform `Home` (Lucide outline) — no emoji house glyph.
> - **Children focus:** clicking Children focuses the **Children evidence group** (belonging-only names) — never primary contact, never Subject Change in v1.
> - **Other parent / guardian:** distinct evidence group; reads raw family rows so role=`parent` is never hidden when a primary exists.
> - **Address:** distinct evidence group when real data exists.
> - **Subject Change** documented as final interaction primitive ([`operational-grammar.md`](./operational-grammar.md), [`card-language.md`](./card-language.md)).
> - **Experience Builder configurability** section added (§13).
**Built on:** [`operational-context-boundary.md`](./operational-context-boundary.md) (runtime spine) · [`operational-grammar.md`](./operational-grammar.md) · [`card-language.md`](./card-language.md) · [`universal-card-archetypes.md`](./universal-card-archetypes.md)
**Interaction laws:** [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md) · **Convergence:** [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md)

> This is a **product architecture** document, not runtime. It freezes the Household card before code so every future Identity card (Children, Contacts, Assignment, Staff, Organization) inherits the same behavior. Wireframes are directional, not pixel specs.

> **Cutover prerequisite (met):** this card builds on the **Operational Context** boundary, which is now the canonical card contract in code (Phase D0 — see [`focus-panel-runtime-cutover-report.md`](./focus-panel-runtime-cutover-report.md)). Implementation may proceed once this freeze is approved.

> **Reviewable visual mock:** a static fixture mock of every state/density/transition lives at route `/dev/household-card-mock` (`web/app/dev/household-card-mock/`). Snapshots + how-to-view: `docs/sprints/archive/06_2026/household-card-mock/` (historical: `../../sprints/archive/06_2026/household-card-mock/README.md`). **Hard rule: do not implement the production card until this mock/spec is reviewed and approved.**

### Deliverable coverage (sprint freeze checklist → section)

| Required deliverable | Where |
|----------------------|-------|
| Complete visual mock | §4 (all states) + §5 (all densities) — directional wireframes |
| Every perspective | §0 (one question, depth-only), §3 (evidence groups), §4.1–4.6 |
| Every density | §5 (Queue / Summary / Work / Focused / Mobile) |
| Every transition | §6 (per-transition: change / animate / mount / load / never-load) |
| Performance model | §7 |
| Interaction model | §6 + [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md) |
| **Loading model** | §4.11 (no card-owned loading; Operational Context owns it) + §7 |
| **Editing model** | §4.6 (inline within a focused group; never a card-wide form) + §6 (Edit / Save rows) |

---

## 0. The one question

> **Who belongs to this household, and who can I contact?**

This is **one** question with **two facets**:

- **Belonging** — who is in this household (composition).
- **Reachability** — who can I contact, and who is permitted to act (channels + permissions: primary contact, emergency, authorized pickup, billing).

**Freeze law:** every perspective answers this *same* question at greater depth. Perspectives change **depth**, never the question. (See §9, Challenge 1 — this corrects the mock, which relabels the question per perspective.)

---

## 1. Question validation (element-by-element)

Every visible element must help answer belonging **or** reachability. If it answers neither, it is removed or handed to another card.

| Element | Belonging | Reachability | Verdict |
|---------|:--------:|:------------:|---------|
| Household name / identity glyph | ✅ | — | **Keep** — identity anchor |
| Primary contact (name + role) | ✅ | ✅ | **Keep** — the primary answer |
| Primary contact channel (phone/email) | — | ✅ | **Keep** — reachability |
| Preferred contact method | — | ✅ | **Keep** — *only if present* (data gap, §11) |
| Child count + names | ✅ | — | **Keep** as belonging context (**names + count only**, no age) |
| Emergency contacts | ✅ | ✅ | **Keep** — reachability + permission |
| Authorized pickups | ✅ | ✅ | **Keep** — permission (who may act) |
| Additional contacts / guardians | ✅ | ✅ | **Keep** |
| Billing contact | partial | ✅ | **Keep, demoted** — billing *identity* belongs here; billing *amounts* belong to a Financial card |
| Last updated / source | — | — | **Keep as metadata** (de-emphasized) — trust, not answer |
| Child program / room / schedule / status | ❌ | ❌ | **REMOVE** → Children card (answers "what's true for this child"). See §9, Challenge 2 |
| "Receives billing: Yes" as a contact attribute | — | partial | **Demote** to a permission chip, not a profile row |
| Relationship graph / org chart | ❌ | ❌ | **Out of scope** — not this question |

**Result:** the Household card carries *people, contact channels, permissions, emergency info, and composition* — and nothing about a child's program/placement/schedule.

---

## 2. Anatomy (mapped to Card Language regions)

| Region | Household content |
|--------|-------------------|
| **Identity** | Platform **Home** icon (Lucide outline, monochrome) + household name (e.g., "Johnson Household"). Always visible. **Never moves.** No emoji glyph. |
| **Insight** | One sentence: *"Sarah Johnson is the primary contact · 3 children · prefers text."* |
| **Primary Answer** | **Primary contact** with a reachable channel + quiet call/message affordance. Strongest operational emphasis. |
| **Supporting Evidence** | Composition + permission chips: children · additional contacts · emergency · authorized pickups. |
| **Collections** | Evidence groups (focusable): Primary contact · Other parent / guardian · Additional contacts · Emergency contacts · Authorized pickups · Children (belonging) · Address · Billing contact. |
| **Actions** | Contextual, quiet: Call · Message · Edit (inline, in a focused group) · Add emergency/pickup. |
| **Context** | Metadata: "Updated 2h ago", source. De-emphasized, bottom. |

---

## 3. Evidence model — belonging vs reachability

The card structures evidence into two columns of meaning (not two visual columns necessarily):

```
BELONGING                         REACHABILITY / PERMISSIONS
─────────                         ──────────────────────────
Primary contact (who leads)       Primary channel + preferred method
Children (names, ages)            Emergency contacts (who to call)
Additional household members      Authorized pickups (who may act)
                                  Billing contact (who pays)
```

Focusable evidence groups (stable keys): `primary_contact`, `other_parent_guardian`, `household_members` (additional contacts), `emergency_contacts`, `authorized_pickups`, `children`, `address`, `billing_contact`.

**Other parent / guardian rule:** one person may be primary contact; other parents/guardians (including role=`parent`) still appear in `other_parent_guardian`. The primary person is never duplicated there. Household reads raw `_opportunity_persons` / `_customer_persons` — not the drawer projection filter that excludes role=`parent` when a primary exists.

**Address rule:** included as an evidence group only when real address fields exist on the observed record. Never invented. Not forced into Overview unless missing and operationally critical.

**Children rule:** Household shows children as **belonging** evidence (**names + count only — no age**). **Focused Children inside Household is a Perspective Change** (same question, greater depth) — it shows names only. **Selecting a child to see program/room/schedule is a Subject Change** (future) to the Children card — Household never renders child operational truth. (§9, Challenge 2.)

---

## 4. States (complete)

Notation: `▸` collapsed affordance, `▾` expanded, `◀` back. Wireframes are directional.

### 4.1 Overview (default, healthy)

```
┌─────────────────────────────────────────────┐
│ 🏠  Johnson Household                     ▸  │  ← identity anchor (stable)
│     Sarah Johnson is primary · 3 children    │  ← insight (one line)
│ ─────────────────────────────────────────── │
│ 👤 Sarah Johnson            Primary          │  ← PRIMARY ANSWER (strongest)
│    (555) 123-4567 · prefers text   [Call][✉] │  ← reachability + quiet actions
│                                              │
│ 3 children · 2 emergency · 2 pickups         │  ← supporting evidence chips
│                                  Updated 2h  │  ← metadata (faint)
│ View household →                             │
└─────────────────────────────────────────────┘
```

### 4.2 Evidence (expanded)

```
┌─────────────────────────────────────────────┐
│ 🏠  Johnson Household                     ▾  │  ← anchor unchanged
│     Sarah Johnson is primary · 3 children    │
│ ─────────────────────────────────────────── │
│ PRIMARY CONTACT                              │
│   👤 Sarah Johnson  Primary  (555) 123-4567  │
│ CHILDREN                                  3 →│  ← belonging only (names + count)
│   Emma · Liam · Noah                         │
│ ADDITIONAL CONTACTS                       1 →│
│   👤 Michael Johnson  Guardian               │
│ EMERGENCY CONTACTS                        2 →│
│   Grandma Mary · Aunt Lisa                   │
│ AUTHORIZED PICKUPS                        2 →│
│   Grandma Mary · Uncle Tom                   │
│ BILLING CONTACT                           1 →│
│   Sarah Johnson                              │
│                                   Show less  │
└─────────────────────────────────────────────┘
```

Each group header (`N →`) focuses that group. No group navigates away.

### 4.3 Focused Contact (e.g., primary)

```
┌─────────────────────────────────────────────┐
│ 🏠 Johnson Household   ◀ All household        │  ← anchor persists; back affordance
│ ─────────────────────────────────────────── │
│ 👤 Sarah Johnson                  Primary    │
│    Relationship   Parent / Primary contact   │
│    Mobile         (555) 123-4567   [Call]    │
│    Email          sarah@…           [✉]      │
│    Prefers        Text messages              │
│    Can pick up    Yes                        │
│    Billing        Receives billing           │
│                                  [Edit]      │  ← inline edit (this group only)
└─────────────────────────────────────────────┘
```

### 4.4 Focused Emergency Contact

```
┌─────────────────────────────────────────────┐
│ 🏠 Johnson Household   ◀ All household        │
│ EMERGENCY CONTACTS                  [Edit]   │
│   ⚑ Grandma Mary   (555) 111-2222  Primary   │
│   ⚑ Aunt Lisa      (555) 333-4444  Secondary │
│   + Add emergency contact                    │
└─────────────────────────────────────────────┘
```

### 4.5 Focused Authorized Pickup

```
┌─────────────────────────────────────────────┐
│ 🏠 Johnson Household   ◀ All household        │
│ AUTHORIZED PICKUPS                  [Edit]   │
│   ✓ Grandma Mary    Approved                 │
│   ✓ Uncle Tom       Approved                 │
│   + Add authorized pickup                    │
└─────────────────────────────────────────────┘
```

### 4.6 Edit (contextual, inline — NOT a separate perspective)

Edit is an **inline state inside a focused group**, never a card-wide form (§9, Challenge 3).

```
┌─────────────────────────────────────────────┐
│ 🏠 Johnson Household   ◀ All household        │
│ EMERGENCY CONTACTS               [Cancel][Save]
│   ⚑ Grandma Mary   [(555) 111-2222]  [Primary▾]
│   ⚑ Aunt Lisa      [(555) 333-4444]  [Second▾]
│   + Add emergency contact                    │
│   ● Unsaved changes                          │  ← dirty indicator
└─────────────────────────────────────────────┘
```

### 4.7 Missing Primary Contact (blocking)

```
┌─────────────────────────────────────────────┐
│ 🏠  Johnson Household                         │
│ ⚠ No primary contact — this family cannot    │  ← RED answer (blocking)
│    be reached                                │
│   3 children belong to this household        │  ← belonging still answered
│   [ Set primary contact ]                    │  ← single decisive action
└─────────────────────────────────────────────┘
```

### 4.8 Missing Emergency Contact (attention)

```
┌─────────────────────────────────────────────┐
│ 🏠  Johnson Household                     ▸  │
│     Sarah Johnson is primary · 3 children    │
│ 👤 Sarah Johnson    Primary  (555) 123-4567  │
│ ⚠ No emergency contact on file               │  ← AMBER attention (not blocking)
│   [ Add emergency contact ]                  │
└─────────────────────────────────────────────┘
```

### 4.9 Empty (no household composed yet)

```
┌─────────────────────────────────────────────┐
│ 🏠  Household                                 │
│    No household linked to this record yet     │
│    [ Add primary contact ]                    │
└─────────────────────────────────────────────┘
```

### 4.10 Permission Limited

Identity + composition shown; contact **channels masked**; no edit affordances. Permission outcome comes from `OperationalContext.capabilities` — the card does **not** authorize independently.

```
┌─────────────────────────────────────────────┐
│ 🏠  Johnson Household                     ▸  │
│     Sarah Johnson is primary · 3 children    │
│ 👤 Sarah Johnson    Primary                  │
│    Contact details restricted   🔒           │  ← masked, no Call/Message
│ 3 children · 2 emergency · 2 pickups         │
└─────────────────────────────────────────────┘
```

### 4.11 Loading

**The card has no independent loading state.** Loading belongs to the **Operational Context** (`status: composing`), owned by the Focus Panel reveal gate. Until the context is `ready`, the Focus Panel shows the composed reveal; the Household card mounts only with data. There is **no card-owned spinner and no skeleton morph on expand** (see Performance model, §7, and the AdminV2 runtime performance doctrine).

```
(context composing)  → Focus Panel reveal gate holds → no partial Household paint
(context ready)      → Household card mounts with full Overview state
```

---

## 5. Densities

Density is presentation scaling and is **independent** of perspective and of Focus Panel mode (§9, Challenge 7). The same Household card, one identity, five densities.

### 5.1 Queue (micro)

One line; identity + the single most decisive fact. Preview only.

```
🏠 Johnson Household · Sarah Johnson · 3 children   ⚠
```

### 5.2 Summary (compact) — Focus Panel Summary mode

The §4.1 Overview state. Collapsed, scan-first, expandable in place.

### 5.3 Work (standard) — Focus Panel Work mode

Defaults to **Evidence** depth (groups visible) so the operator can act confidently; focused-group inline editing available. Same card, deeper default perspective — **not** a different card.

### 5.4 Focused (expanded)

A single evidence group occupies the body (§4.3–4.6). Identity anchor persists; back returns to Evidence.

### 5.5 Mobile

Single column; identity anchor sticky; primary contact + call/message are the first reachable actions; groups become full-width stacked sections; focused group is full-screen with a back affordance.

```
┌───────────────────────┐
│ 🏠 Johnson Household   │  ← sticky
│ Sarah Johnson Primary  │
│ [ Call ] [ Message ]   │  ← reachability first
│ ───────────────────── │
│ Children          3 → │
│ Emergency         2 → │
│ Pickups           2 → │
└───────────────────────┘
```

**Density law:** identity anchor and the primary-contact answer survive every density. What drops first as space shrinks: metadata → secondary evidence chips → group detail → (queue) everything but the one decisive line.

---

## 6. Interaction model (every transition)

All Household interactions use **Expand** (Interaction Model 1) or **Change Subject** (Model 4) from [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md). No drawer-to-drawer, no route change for in-card depth.

| Transition | What changes | What animates | What stays mounted | What loads | What never loads |
|-----------|--------------|---------------|--------------------|-----------|------------------|
| **Overview → Evidence** (expand) | Body reveals evidence groups | Body height + group fade-in (≤200ms) | Identity anchor, insight, primary answer | Nothing | No fetch, no skeleton |
| **Evidence → Focused group** | Body swaps to one group | Cross-fade/slide within body | Identity anchor, card frame | Nothing | No fetch |
| **Focused group → back** | Body returns to Evidence | Reverse transition | Identity anchor | Nothing | No fetch |
| **Focused group → Edit** | Inline controls appear in group | Controls fade in | Whole card, group rows | Nothing (edits the observed truth) | No new card, no form route |
| **Edit → Save** | Optimistic update, dirty clears | Save affordance state | Card + group | **Write** (mutation) + observed-truth refresh through the context | Card does not re-fetch itself; context owns refresh |
| **Overview ↔ density change** | Scaling only | Layout reflow | Identity + primary answer | Nothing | No fetch |
| **Select a child** | **Change Subject** → Children card | Subject swap / warm transition | Focus Panel shell | **New Operational Context** for the child | Not "more Household" |
| **Change Subject → person** (future; *not* a v1 card affordance) | **Change Subject** → person | Subject swap | Focus Panel shell | **New Operational Context** for the person | Not a card expand; no in-card "open full profile" link |
| **Focus Panel mode switch** (Summary/Work/Activity) | Card composition + default depth | Composition reflow | Operational Context | Nothing | No fetch |

**Mounting rule:** the identity anchor (glyph + name) and the card frame **never unmount** across overview/evidence/focus/edit. Only the **body region** transforms.

---

## 7. Performance model

| Level | Loads? | Rule |
|-------|:------:|------|
| **Operational Context** | **Yes (once)** | Subject + process + composed truth + capabilities load once per subject, owned by the Focus Panel reveal gate. |
| **Perspective** (collapse/expand/focus) | **Never** | Pure local UI state. |
| **Card** | **Never independently** | Observes `OperationalContext.truth`. No card-level fetch, no card-level spinner. |
| **Transition** | **Never** | Animation only. No skeleton morph on expand. |
| **Workspace / Deep focus** (full profile, Change Subject, ledger) | **Only when deep requires** | Establishes a *new* Operational Context (new subject) or a domain workspace — not an enrichment of the current card. |

**Hard guarantees (align with AdminV2 runtime performance doctrine):**
- No independent card fetch on expand.
- No loading spinner collapsed → expanded.
- No skeleton morph; no route change; no drawer-to-drawer navigation for in-card depth.
- Valid displayed data is never cleared before a replacement is ready.

---

## 8. Visual hierarchy

Order of attention (strongest → faintest), and motion behavior:

1. **Primary contact answer** — strongest weight; the actionable reachability answer. *Transforms* into the focused contact.
2. **Identity anchor** (glyph + household name) — high but calm; **never moves, never fades**.
3. **Insight line** — single sentence; medium.
4. **Attention/missing warning** (when present) — amber/red; pulls attention only when it exists.
5. **Supporting evidence chips / groups** — quiet; **fade in** on expand, **fade out** on collapse.
6. **Actions** — quiet, contextual; appear with their evidence.
7. **Metadata** (updated/source) — faintest; bottom; never competes.

Color is **semantic only** (Card Language): neutral/slate for identity & context, green for healthy/complete, amber for needs-attention, red only for blocking. **No module color.** The card is a calm white surface with a subtle border and minimal shadow; operational state — not decoration — introduces color.

- **What never moves:** identity anchor.
- **What transforms:** the body region.
- **What fades:** supporting evidence and metadata.
- **What gets the most attention:** the primary contact (or, when missing, the blocking warning).

---

## 9. Challenges to the mock (with rationale)

1. **One question, not four.** The mock relabels the question per perspective ("Who belongs?" → "Who is the primary contact?" → "Who can help in an emergency?"). That violates Operational Grammar Law #2. **Converge:** one frozen question ("Who belongs, and who can I contact?"); perspectives add depth, not new questions.

2. **Children are not Household evidence detail.** The mock lists children under "Household members" *and* the Children card duplicates them with program/room/schedule. Two owners = drift. **Converge:** Household shows children as belonging (**names + count only — no age**); all child operational truth lives in the Children card, reached via **Change Subject**.

3. **Editing is not a perspective.** The mock's "Editing" is a 4th perspective. Card Language: editing is contextual/inline. **Converge:** Edit is an inline state *inside a focused group*; the card never becomes a form.

4. **Lead with reachability, not the label.** The mock's collapsed view is a flat list of equal-weight rows (count, count, "Text Preferred") — a field dump that buries the answer. **Converge:** primary contact + channel is the primary answer (strongest); counts demote to evidence chips; "Text Preferred" rides inline on the contact, not as its own row.

5. **Permissions are reachability, framed as such.** "Can pick up: Yes / Receives billing: Yes" appear as flat profile rows. **Converge:** model emergency/pickup/billing as **permission-bearing evidence groups** ("who may act"), which is exactly the reachability facet of the question.

6. **Add the operational states the mock omits.** Missing-primary (blocking), missing-emergency (attention), empty, permission-limited, and loading are first-class and specified here (§4.7–4.11). A reference card must define its unhappy paths.

7. **Separate the three axes the mock conflates.** The mock binds perspective to mode ("Overview = Summary Mode", "Expanded = Work Mode"). **Converge:** three independent axes — *perspective* (depth, local), *Focus Panel mode* (cognitive composition), *density* (presentation scaling). Work mode may *default* to a deeper perspective, but expansion is not "entering Work mode."

8. **Metadata is trust, not an answer.** "Updated 2h ago" is fine but must be the faintest element, never a row competing with contacts.

9. **Billing identity yes, billing amounts no.** Keep "who pays" (identity/permission). Push balances/invoices to a Financial card — they answer a different question.

---

## 10. Identity archetype reference contract

Every future Identity card (Children, Contacts, Assignment, Staff, Organization) inherits the following from this freeze:

| Inherited behavior | Rule |
|--------------------|------|
| **One question, two-facet structure** | Identity cards answer "who is this?" with *who/composition* + *how to reach/act* facets. |
| **Identity anchor is permanent** | Glyph + name never move or fade across perspectives. |
| **Primary answer = the actionable identity** | Strongest weight goes to the subject the operator most needs to act on. |
| **Evidence groups are focusable, not navigable** | Expand/focus stays in-card (Model 1); selecting an entity is **Change Subject** (Model 4). |
| **Editing is inline, in a focused group** | Never a card-wide form, never a separate perspective. |
| **Permission via context capabilities** | Permission-limited renders from `OperationalContext.capabilities`; no card-level authorization fetch. |
| **States are first-class** | Overview, Evidence, Focused, Edit, Missing-critical, Empty, Permission-limited, Loading-via-context. |
| **Performance** | Observe-only; no fetch on expand; only Change-Subject/deep workspace may load. |
| **Calm + semantic color** | White surface; color encodes operational state only. |

---

## 11. Data dependencies & gaps (carried from runtime audit)

The card observes `OperationalContext.truth` (composed once). Known gaps to resolve at implementation, **documented not invented**:

- **Preferred contact method** — no canonical preference field on the composed subject truth today; surface only when present.
- **Secondary parent visibility — resolved (June 2026):** Household evidence assembly reads raw family rows; role=`parent` on a non-primary person surfaces in `other_parent_guardian`.
- **Per-contact deep profile** — reaching a person's full profile is a future **Subject Change** load (new context), documented separately; it is **not** an in-card affordance in v1 (no "open full profile" link on the Household card).
- **Employee status** — not a Household field. Derived when Operational Context shifts to a person linked to Employee (see Subject Change §13).
- **Capabilities/masking** — permission-limited rendering requires `capabilities.maskedChannels` on the context.

---

## 13. Subject Change (Household)

Household answers: **"Who belongs to this household, and who can I contact?"**

| Interaction | Type | What happens |
|-------------|------|--------------|
| Overview → Evidence → Focused Children | **Perspective Change** | Same subject, same question — shows belonging-only child names |
| Click Emma to see program/room/enrollment | **Subject Change** (future) | New Operational Context around Emma; Children card answers operational child truth |
| "Open full contact profile" | **Subject Change** (future) | New context around that contact — **not** a Household v1 action |

**v1 freeze:** Focused Children shows names/count only. No Subject Change wiring in Household v1.

---

## 14. Experience Builder configurability

Household becomes configurable at the **card-definition level** in Experience Builder — not by adding arbitrary fields.

### Allowed configuration

- Show/hide approved evidence groups
- Reorder evidence groups
- Choose which approved fields appear in Overview / Evidence / Focused group
- Configure empty-state copy
- Configure condition rules (when to show a group or warning)
- Configure actions (call, message, add emergency…)
- Configure density defaults per surface

### Not allowed

- Adding fields that do not answer the Household question
- Adding child program / room / schedule / status / age
- Adding invoices / payments / tasks / timeline / history
- Changing the archetype or the card's operational question
- Wiring Subject Change inside Household v1 (future platform primitive)

Household may only be configured within its **approved evidence catalog**: primary contact, other parent/guardian, additional contacts, emergency, authorized pickups, children (belonging), address, billing contact.

---

## 12. Freeze checklist (acceptance)

- [ ] One frozen question; perspectives add depth only.
- [ ] Children removed from Household detail (belonging-only), child truth via Change Subject.
- [ ] Editing is inline within a focused group; no card-wide form.
- [ ] All states defined: Overview, Evidence, Focused (Contact/Emergency/Pickup), Edit, Missing-primary, Missing-emergency, Empty, Permission-limited, Loading-via-context.
- [ ] All densities defined: Queue, Summary, Work, Focused, Mobile.
- [ ] Interaction transitions specify change/animation/mount/load/never-load.
- [ ] Performance model: only Operational Context (and deep/Change-Subject) load.
- [ ] Visual hierarchy: identity anchor never moves; body transforms; metadata faintest.
- [ ] Card builds against **Operational Context**, not drawer terminology ([`operational-context-boundary.md`](./operational-context-boundary.md)).

When this checklist is approved, Household implementation is mechanical and becomes the Identity archetype template.
