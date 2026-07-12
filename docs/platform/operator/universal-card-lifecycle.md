---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Universal Card Lifecycle (V1)

**Status:** Canonical (June 2026). The model **every** Alloy card follows. Locks the
lifecycle, capability matrix, edit/expand language, and profile-image evidence so the
next 36 cards inherit the same behavior instead of re-inventing it.

**Code:**
`web/lib/adminV2/runtime/focusPanel/focusPanelCardLifecycle.ts` (lifecycle + capability matrix) ·
`web/lib/adminV2/runtime/focusPanel/focusPanelIdentityAvatar.ts` + `web/components/admin/focusPanel/CardAvatar.tsx` (profile images).

**Companions:** [`focus-panel-composition-v2-and-editing.md`](./focus-panel-composition-v2-and-editing.md) ·
[`operational-depth-doctrine.md`](./operational-depth-doctrine.md) ·
[`card-composition-system.md`](./card-composition-system.md).

---

## 1. The lifecycle

A card moves through a declared lifecycle. **Not every card supports every state — but
every card declares which it supports.**

| State | Meaning | Not |
|-------|---------|-----|
| **Summary** | The 2–5 second operational answer on the Focus Panel surface. | — |
| **Focus** | The current operational **truth** — everything needed to understand the current state. | a separate form |
| **Edit** | Inline editing **inside** the focused card; rows transform into controls **in place**. | a separate form |
| **Expanded** | The **same** operational question with **additional configured evidence** (more evidence groups). Overlays downward, never reflows. **Not history.** | Focus · Edit · Workspace · history |
| **Workspace** | Doing **larger work** — bulk edits, document / financial review, mass scheduling, ledger review. | an expanded card |

> **Related Views** (separate from the lifecycle) are optional drill-downs to a **report
> / historical context** — Schedule History, Placement History, Billing History, Full
> Timeline. A Related View is a *related operational report*, **not** Expanded: Expanded
> answers the same question with more evidence; a Related View opens a different report.
> Declared per card as `relatedViews` (see §2a).

- **Summary** examples — Household: primary contact · children count · contact status.
  Child: name · age · program · room · schedule/status.
- **Focus** example — Household focused contact: photo · phone · email · preferred
  channel · language · can pick up · receives billing.
- **Edit** stays visually connected to the row/evidence being edited (phone row → phone
  input; schedule days → selectable chips; times → editable values).
- **Expanded** examples (additional configured evidence — *not* history) — Household:
  addresses, additional contacts, languages, household notes. Child: placement, medical,
  documents, pickup instructions, notes, readiness. Billing: current billing
  configuration, invoices, payment methods, balances.
- **Workspace** is only when the operator is *doing work*, not reviewing.

---

## 2. Capability matrix

Each card declares (`FocusPanelCardCapabilities`):

```
supportsSummary · supportsFocus · supportsInlineEdit · supportsExpanded ·
supportsWorkspace · supportsSubjectChange · supportsProfileImage ·
editableEvidenceGroups[] · expansionEvidenceGroups[]
```

The runtime, the canvas builder, and the Inspector read these — no per-card hardcoding.

| Card | Summary | Focus | Inline Edit | Expanded | Workspace | Profile image |
|------|:--:|:--:|:--:|:--:|:--:|:--:|
| **Household** | ✓ | ✓ | ✓ | ✓ | — | ✓ (contact/member rows) |
| **Child** | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Documents | ✓ | ✓ | ✓ | ✓ | — | — |
| Communications | ✓ | ✓ | — | ✓ | — | — |
| **Readiness** | ✓ | — | — | ✓ | — | — |
| **Current Work** | ✓ | — | — | ✓ | (later) | — |
| _default (other cards)_ | ✓ | — | — | — | — | — |

**Consistency invariants** (enforced by `validateCardCapabilities`, asserted in tests):
- Inline edit ⇒ Focus (edit happens inside the focused card).
- Inline edit ⇒ the card is an **operational truth card** (it owns what it mutates).
- Declaring `editableEvidenceGroups` ⇒ `supportsInlineEdit`; declaring
  `expansionEvidenceGroups` ⇒ `supportsExpanded`.

---

## 2a. Related Views (report drill-downs)

A card declares optional **Related Views** — drill-downs to a report or historical
context, distinct from Expanded:

| Card | Related Views |
|------|---------------|
| **Child** | Schedule History · Placement History |
| Household | Contact History |
| Billing | Billing History · Payment History |
| Attendance | Attendance History |
| Timeline | Full Timeline |

**Expanded vs Related View:** Expanded reveals more *evidence* for the **same question**
(overlays downward). A Related View opens a *different operational report* (history /
ledger / full list). Code: `relatedViews` on `FocusPanelCardCapabilities` /
`cardRelatedViews(key)`.

---

## 2b. Child ownership (Placement is an evidence group, not a card)

**Placement does NOT become its own card.** Placement is an **Evidence Group owned by the
Child card**. The Child card owns its full operational truth as evidence groups:

| Group | Fields |
|-------|--------|
| **Identity** | name · DOB / age · photo |
| **Placement** | Program · Room · Schedule · Teacher · Desired Start |
| **Medical** | allergies · conditions · medications |
| **Documents** | required / received documents |
| **Readiness** | enrollment-readiness factors |
| **Notes** | child notes |

Child edits these inline **only where a save adapter + permission + validation exist**;
today child operational fields have **no save adapter**, so inline edit is a read-only
**preview** (no fake save). Schedule/Placement *history* are **Related Views**, not
Expanded.

---

## 3. Profile images (evidence, not presentation)

Identity rows carry a profile image via the evidence model
(`resolveIdentityAvatar(name, imageUrl)` → image-or-initials). When no image exists,
the **initials fallback** renders (deterministic tone per name). Applies to Household
contacts/members and Child (Staff later). **Never** Readiness, Current Work, Billing,
Metrics, or Timeline — gated by `supportsProfileImage`.

---

## 4. Editability (ownership gate)

The question is never "is this field editable?" in isolation — it is **"which card /
evidence group owns this operational truth?"** A field is editable **only** when:

1. the card / evidence group **owns** it (one owning card per concept),
2. a **save adapter** exists,
3. **permissions** allow it,
4. a **validation route** exists.

If ownership is unclear, the field is **read-only** and the owning card is documented as
a gap. (Phone → Household · medical → Health & Safety · weekly charges → Billing ·
attendance → Attendance · timeline event → Timeline · program/room/schedule/desired
start → Placement/Child, pending the final ownership decision.)

---

## 4a. Authoring (final state) — Canvas owns composition, Inspector owns behavior

The card lifecycle is **authored**, not coded per-card:

- **Composition** (where a card sits, how wide/tall, stacking, row) is authored **directly
  on the canvas** (`FocusPanelCanvasBuilder`) — drag to move/stack, drag the edges to
  resize. Width changes layout; **height** = room before overlay/expanded. Resizing never
  changes a card's question, ownership, editability, or related views.
- **Behavior** (question, Evidence Groups, editing, Expanded, Related Views, actions,
  conditions, AI, ownership) is authored in the **Inspector**.
- A new card declares its capabilities (`cardCapabilities`) and its Evidence Groups
  (`defaultEvidenceGroupsForCard`), and inherits Summary/Focus/Edit/Expanded/Related-Views
  for free. See [`experience-builder-doctrine.md`](./experience-builder-doctrine.md).

## 5. Why this matters

Locking the lifecycle, capability matrix, evidence-group model, profile-image evidence,
and edit/expand language means **every future card inherits them**. A new card declares
its capabilities and binds its evidence groups; it does not re-implement Summary, Focus,
inline Edit, Expansion, or avatars. That is the leverage behind the next 36 cards.
