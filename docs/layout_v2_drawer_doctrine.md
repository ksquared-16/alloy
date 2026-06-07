# Layout V2 — Drawer Doctrine

**Status:** Completion-pass reference (proof/config only). Documents what is, and
is not, configurable for record drawers in Layout V2 — and the bounded future
direction for tabs. No runtime is wired by this doc.

**Applies to:** Lead (Opportunity), Person, and Child drawers — all of which use
the **same** shell and the **same** Layout V2 builder.

---

## 1. Fixed shell doctrine

Every record drawer uses the **same shell**. The shell is fixed; only the
Overview **body** is configured by Layout V2.

- Center-modal pop-up (not the legacy right-side drawer).
- Modal header: title · status · top-level action area.
- Fixed core tabs (see §4).
- Lifecycle / stage rail where applicable (e.g. Lead).
- **Overview body** — the configurable region (Layout V2 doc).

Reference shell: `web/components/layout/proofShell/ProofRecordModal.tsx`
(mirrors the staging drawer chrome). Body renderer:
`web/components/layout/LayoutRecordView.tsx`. Builder preview:
`web/components/layout/LayoutPreviewRenderer.tsx`.

---

## 2. Configurable today

Inside the Overview body, an admin can configure (via `/adminV2/settings/layouts`):

- Overview **sections** (titles, order, default expanded/collapsed).
- **Rows / columns** (1/2/3-column placement, widths).
- **Field groups** (controlled subgrids — column-in-column).
- **Widgets** (placeholders from the global widget catalog — Tasks, Notes,
  Recent Communication, …).
- **Related lists** (collection tables — e.g. Associated Children).
- **Field adornments** (lucide/Alloy icons; optional drawer-link action).
- **Conditions** (simple show-when rules — exists / equals).
- **Queue card face** (for queue surfaces — Header · Context · Body · Actions).

The same builder, preview, save/publish, and versioning apply to **Lead, Person,
and Child** drawers.

---

## 3. Not configurable yet

These remain fixed (shell-owned), by design, in this phase:

- Modal header layout.
- Status dropdown placement.
- Top-level action placement.
- Core system tabs (the tab set itself — see §4).
- Lifecycle rail logic (stage model + readiness).

Layouts reference these surfaces; they do not own them. (Lifecycle references
layouts; layouts never own lifecycle.)

---

## 4. Core tabs (fixed) + future configurable tabs

**Core tabs remain fixed** and present on every drawer:

- Overview
- Communications
- Notes
- Documents
- Activity

Only **Overview** is Layout V2-configurable today; the other tabs are
live-runtime surfaces.

**Future direction (documented only — NOT implemented now):** allow *additive*
custom tabs that point to one of:

- a Layout V2 section group,
- a related list,
- a widget surface, or
- an entity-specific sub-layout.

Example — a Lead drawer could add: a **Children** tab, a **Parent / Contacts**
tab, a **Billing** tab, a **Subsidy** tab. These would be additive only; the
five core tabs stay fixed. **Tab configuration is not built in this phase** — it
is recorded here as the bounded next step, not a commitment to scope now.

---

## 5. Drawer presets (this phase)

Curated, presentation-only defaults exist for:

| Drawer | entity_type | Sections |
|---|---|---|
| **Lead** | `opportunities` | Lead Summary · Lead Children · Lead Source · Notes/Communication |
| **Person** | `person` | Person Summary · Associated Children/Relationships · Communications · Notes |
| **Child** | `child` | Child Summary · Family/Contacts · Enrollment/Opportunity context · Notes/Activity |

Source: `web/lib/layout/defaultLeadLayouts.ts` (Lead),
`web/lib/layout/defaultRecordDrawers.ts` (Person, Child). RefKeys follow the
canonical namespaces — `child.*` (durable) / `inquiry_child.*` (enrollment);
never new `child_inquiry.*` (see `child_namespace_addendum.md`).

All three are created/edited/published through the same builder and rendered by
the same body renderer. **Not wired into live Person/Child runtime drawers** —
proof/config only.
