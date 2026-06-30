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
| **Expanded** | The **same** answer with more **room** — breadth / history / additional context. Overlays downward, never reflows. | Focus · Edit · Workspace |
| **Workspace** | Doing **larger work** — bulk edits, document / financial review, mass scheduling, ledger review. | an expanded card |

- **Summary** examples — Household: primary contact · children count · contact status.
  Child: name · age · program · room · schedule/status.
- **Focus** example — Household focused contact: photo · phone · email · preferred
  channel · language · can pick up · receives billing.
- **Edit** stays visually connected to the row/evidence being edited (phone row → phone
  input; schedule days → selectable chips; times → editable values).
- **Expanded** examples — Household: mailing/secondary/former address, additional
  contacts, contact history. Child: schedule history, future schedules, program/status
  history. Billing: weekly-charge history. Readiness: full blocker list.
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

## 5. Why this matters

Locking the lifecycle, capability matrix, evidence-group model, profile-image evidence,
and edit/expand language means **every future card inherits them**. A new card declares
its capabilities and binds its evidence groups; it does not re-implement Summary, Focus,
inline Edit, Expansion, or avatars. That is the leverage behind the next 36 cards.
