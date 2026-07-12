# Interaction Walkthroughs

**Path:** `docs/sprints/archive/06_2026/experience-builder-v2-runtime-editing/06-interaction-walkthroughs.md`
**Status:** UX architecture sprint — design only (June 2026)
**Deliverable:** 7 — Interaction walkthroughs (complete flows)

Each walkthrough is step-by-step, surface-centric, and assumes the operator is an admin with `experience.configure`. Notation: **[Viewing]**, **[Structure]**, **[Content]** mark the active state.

---

## 1. Enter Edit Mode

1. **[Viewing]** Admin is looking at the live **Enrollment Summary** Focus Panel for the Hayes family.
2. They click **Edit this surface** in the surface chrome.
3. The **Edit Bar** slides in at the top of the panel. The panel content **does not move** — same cards, same spacing.
4. State indicator reads **Working Copy**; mode defaults to **Content**; Scope chip reads **Organization**.
5. No working copy is written yet — entry is side-effect-free until the first edit.

> Exit at any time via **Done** → returns to **[Viewing]** with edits auto-saved to the working copy (unpublished).

---

## 2. Add a Card

1. **[Content]** → toggle to **[Structure]** in the Edit Bar.
2. Cards shift to structural blocks; zone boundaries and the column grid become faintly visible.
3. Admin hovers the gap **between Family and Current Work** → an **insertion line with `+`** appears.
4. Click `+` → an **inline Card Type picker** opens anchored at that gap, listing platform Card Types relevant to Opportunity (Readiness, Billing, Attendance, Tasks, Documents, …), grouped by purpose, searchable.
5. Admin picks **Billing**.
6. A real **Billing card** appears at that exact position, pre-filled with its default Content Template (balance · status · next invoice).
7. The working copy updates instantly. Admin can toggle to **[Content]** to configure the new card, or keep arranging.

---

## 3. Move a Card

1. **[Structure]** Admin wants Readiness higher.
2. They grab Readiness by its **drag handle**.
3. The card lifts (subtle elevation); other cards reflow to reveal drop targets; insertion lines mark valid positions.
4. Admin drags it above Family and releases.
5. Cards reflow with motion that preserves context (no jump). Readiness now leads the zone.
6. Tier rule honored: Readiness stays within its allowed tier band; an out-of-tier drop target would be inert.

---

## 4. Resize a Card

1. **[Structure]** Admin selects the **Billing** card.
2. **Resize handles** appear on its edges.
3. Admin drags the right edge → the card snaps from **span 1 → span 2** on the column grid; the real card re-renders wider in place.
4. A **density** control offers Compact / Standard / Expanded (where Billing permits) — switching re-renders the real card.
5. Disallowed spans simply don't snap (platform-owned per Card Type).

---

## 5. Edit a Renderer

1. **[Content]** Admin hovers the Billing card's **balance** value → it gains an edit outline.
2. Click → an **inline editor** opens anchored to the value.
3. It shows **Data Source** `billing.balance` and **Renderer** `Currency`.
4. Admin opens **Change renderer** → the closed Renderer catalog (Numbers & money group) → currently `Currency`; options include `Gauge`, `Scorecard`.
5. Admin keeps `Currency` but toggles its semantic option **"show cents"** off.
6. The value re-renders in place as `$1,234`. Change is live in the working copy. Click away closes the editor.

---

## 6. Edit a Field (Data Source)

1. **[Content]** Admin clicks the **next invoice** slot on the Billing card.
2. Inline editor shows Data Source `billing.next_invoice_date`, Renderer `Date`.
3. Admin opens **Data Source** → the **Field Catalog** picker (grouped by entity) → selects `billing.next_autopay_date` instead.
4. Renderer stays `Date` (compatible). The slot re-renders with the new value.
5. Label auto-suggests "Next Autopay"; admin edits it inline to "Autopay".

---

## 7. Set a Visibility Condition

1. **[Content]** Admin selects the **Attendance** card → edit chip → **"Show when…"**.
2. A typed condition control opens: `Show when` → `stage` → `is` → `Enrolled`.
3. The working copy now hides Attendance unless the record is in the Enrolled stage; admin uses the **Scope/record lens** to spot-check against a non-enrolled record (card correctly hidden).

---

## 8. Publish

1. Admin clicks **Publish** in the Edit Bar.
2. **Pre-publish validation** runs: all required slots filled, no unresolved data sources, no publish-blocked renderers. ✓
3. **Impact analysis** confirmation: *"Enrollment Summary is assigned to 3 Work Views and 1 stage. Publishing at Organization scope updates the runtime for all of them."* → **Publish**.
4. A new **Published v4** is created (author + timestamp). Runtime reads it immediately for all assignments.
5. The working copy now equals Published (clean). Admin clicks **Done** → **[Viewing]** the updated live surface.

---

## 9. Duplicate a Surface

1. From **Browse & Manage** (or the Edit Bar overflow), admin chooses **Duplicate** on Enrollment Summary.
2. A new working copy **"Enrollment Summary (copy)"** is created with identical composition and **no assignments**.
3. It opens in Edit Mode. Admin edits and publishes it independently; it must be assigned in a Work View to go live.

---

## 10. Undo / Redo

1. **[Structure or Content]** Admin deletes the Documents card by mistake.
2. They click **Undo (⤺)** in the Edit Bar → the card returns exactly where it was.
3. **Redo (⤻)** re-applies. Undo/redo is per-session edit history over the working copy; it does not affect Published versions.

---

## 11. History

1. Admin clicks **History** in the Edit Bar.
2. A **version timeline** opens in place: v4 (now), v3 (Maria, Jun 24), v2 (Jun 20), v1 (Jun 12) — each with a one-line change summary.
3. Selecting **v3 vs v4** turns the surface into a **diff view**: changed/added/removed cards and slots get markers **on the surface itself** (no JSON diff).

---

## 12. Restore a Version

1. In **History**, admin selects **v2** and chooses **Restore this version**.
2. Confirmation: *"Restore creates a new published version equal to v2. History is preserved."*
3. A new **Published v5** is created, identical to v2. The working copy updates to match. Prior versions remain intact.

---

## 13. Edit a Location override

1. **[Content]** Admin changes the **Scope chip** from `Organization` to `Location: North Campus`.
2. The surface re-renders through North Campus's resolved config; inherited elements show **ⓘ**.
3. Admin hides the **Executive KPI** card for this site → it gains an **✎ override** marker.
4. Publishing applies **only** to North Campus; Organization and other sites are untouched.
5. "Reset to inherited" on that card would revert the override.

---

## 14. Edit a Dashboard (Analytics) — proving parity

1. **[Viewing]** Admin opens the **Enrollment Dashboard** → **Edit this surface**.
2. Same Edit Bar; defaults to **[Content]**, Scope **Organization**.
3. **[Structure]** → hover between two metric cards → `+` → inline Card Type picker → **Metric** card type → inserts a real metric card.
4. **[Content]** → click the new card → Data Source = **metric ref** `enrollment.tour_show_rate` (read-only here, with a link to Operational Intelligence to edit its math) → Renderer = **KPI Card** → add a **Sparkline** slot for trend.
5. **Publish** → identical flow to the Focus Panel. The only differences encountered were the Card Type (Metric) and the Renderers (KPI Card, Sparkline) — exactly as the "Analytics is identical" law requires.

---

## 15. Cross-references

| Concern | Doc |
|---|---|
| Interaction model | [`01-runtime-editing-interaction-model.md`](./01-runtime-editing-interaction-model.md) |
| Edit Mode lifecycle | [`03-edit-mode-doctrine.md`](./03-edit-mode-doctrine.md) |
| Structure / Content modes | [`04-structure-mode-doctrine.md`](./04-structure-mode-doctrine.md), [`05-content-mode-doctrine.md`](./05-content-mode-doctrine.md) |
| Mockups | [`mockups/README.md`](./mockups/README.md) |
