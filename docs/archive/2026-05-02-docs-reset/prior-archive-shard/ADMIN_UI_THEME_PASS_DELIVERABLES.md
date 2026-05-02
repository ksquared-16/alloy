> **Archived (2026-04):** One-time or superseded material; kept for history. **Current doctrine:** [`docs/architecture/README.md`](../architecture/README.md). Prefer [`docs/README.md`](../README.md) for where everything else lives.

---

# Admin / SaaS UI Theme Pass — Bend Pine Accent

**Goal:** Make the admin UI feel like the same brand as the Alloy website by using **Bend Pine** as the real accent for active/success/emphasis/selected states, without turning the sidebar dark blue or redesigning layouts.

**Design intent:** Blue = structure / primary actions. Gray = neutral surfaces. **Bend Pine = active / success / emphasis / selected state.**

---

## 1. Files changed

| File | Changes |
|------|--------|
| `web/app/globals.css` | Bend Pine comment; `.admin-btn-success` uses `alloy-pine` instead of `alloy-juniper`. |
| `web/components/admin/AdminLayout.tsx` | Sidebar: active state uses Bend Pine (bg, text, left border); hover remains `alloy-pine/5`. |
| `web/components/admin/StatusBadge.tsx` | Success variant and assignment accepted/completed use Bend Pine instead of Juniper. |
| `web/components/admin/DataTable.tsx` | Row hover = `alloy-pine/5`; filter button selected state = Bend Pine; sort column indicator = Bend Pine; active filter dot = Bend Pine. |
| `web/components/admin/RelatedRecordsTabs.tsx` | Active tab = Bend Pine (bg, text, bottom border); row hover = `alloy-pine/5`. |
| `web/components/admin/SectionCard.tsx` | Softer border (`border-admin-border/90`, header `border-admin-border/80`); subtle shadow; slightly more header padding (`py-3.5`). |
| `web/components/admin/KpiCard.tsx` | Added `pine` accent option; dashboard uses it for positive/success KPIs. |
| `web/app/admin/dashboard/DashboardClient.tsx` | "Booked" and "Accepted" KPI cards use `accent="pine"`. |
| `web/app/admin/financials/FinancialsAuditClient.tsx` | Ledger/Journal tab buttons: selected tab uses Bend Pine (border + text); hover = `alloy-pine/5`. |

---

## 2. Components / pages updated

- **AdminLayout** — Sidebar nav links and nested items (active + hover).
- **StatusBadge** — Success and assignment accepted/completed pills.
- **DataTable** — Toolbar filter button, filter dot, sort column, table row hover.
- **RelatedRecordsTabs** — Tab buttons and table row hover in drawer/related views.
- **SectionCard** — Card border and shadow, section header spacing.
- **KpiCard** — New `pine` accent; used on dashboard for success metrics.
- **Dashboard** — KPI row (booked, accepted use pine).
- **Financials audit** — Ledger vs Journal tab selection.

---

## 3. Where Bend Pine is now used intentionally

| Area | Use |
|------|-----|
| **Sidebar** | Active nav item: left border, background tint (`alloy-pine/8`), text. Hover: light tint (`alloy-pine/5`). |
| **Status badges** | "Active", "Completed", "Success", "Accepted", "Posted", "Approved" and assignment accepted/completed: Bend Pine background, text, border. |
| **Tables** | Row hover: subtle Bend Pine tint (`alloy-pine/5`). DataTable and RelatedRecordsTabs. |
| **Filters** | DataTable "Filter" button when open: border, ring, background, text = Bend Pine; active filter dot = Bend Pine. |
| **Tabs** | RelatedRecordsTabs and Financials Ledger/Journal: selected tab = Bend Pine (border + text); hover = Bend Pine tint. |
| **Sort indicator** | DataTable sorted column header and sort icon = Bend Pine. |
| **Success / confirmation** | `.admin-btn-success` and any use of that class = Bend Pine. StatusBadge success variant = Bend Pine. |
| **KPI / metrics** | Dashboard "Booked" and "Accepted" KPI cards use `accent="pine"` (left border). |
| **Cards / surfaces** | SectionCard: softer borders and subtle shadow only (no pine on cards to avoid overuse). |

---

## 4. What was deliberately NOT changed

- **Sidebar background** — Remains light (`#ffffff`). No midnight/dark blue sidebar.
- **Primary actions** — Primary buttons stay **Alloy Blue** (e.g. "Apply", "Add", main CTAs). Not turned green/pine.
- **AdminPageHeader** — Kept **blue** left border (`border-l-alloy-blue`) for structure.
- **DataTable container** — Kept **blue** left border for structure.
- **Drawer** — Default accent remains blue; no change to drawer layout or primary actions.
- **Page layouts** — No changes to information architecture, grid, or page structure.
- **Workflow or logic** — Styling/theming only; no behavior changes.
- **Info/scheduled states** — StatusBadge `info` variant and "scheduled"-type statuses remain **Alloy Blue** (not overusing pine for statuses).

---

## 5. Manual visual QA checklist

- [ ] **Sidebar**
  - [ ] Sidebar background is still light/white (not dark blue).
  - [ ] Active nav item has a clear **left border** and **Bend Pine** tint (text and bg); not blue.
  - [ ] Hover on nav items is a subtle branded tint, not heavy.
  - [ ] Nested items (e.g. Workflows, Settings) show same active/hover treatment when open/selected.

- [ ] **Status badges**
  - [ ] "Active", "Completed", "Success", "Accepted" (and similar) show **Bend Pine** (not generic green).
  - [ ] Neutral/inactive states (e.g. "Inactive", "Canceled") remain gray.
  - [ ] Info/scheduled-type badges remain blue where applicable.

- [ ] **Tables and rows**
  - [ ] DataTable: row hover has a **subtle Bend Pine** tint (not blue, not gray-only).
  - [ ] RelatedRecordsTabs table rows: same subtle pine hover.
  - [ ] No loud or overwhelming pine; feels premium and subtle.

- [ ] **Filters / chips / toggles**
  - [ ] DataTable: open "Filter" button shows **Bend Pine** (border, bg, text) and active filter dot is pine.
  - [ ] Financials: selected tab ("Ledger transactions" or "Journal entries") has **Bend Pine** bottom border and text; unselected tab hover has light pine tint.
  - [ ] RelatedRecordsTabs: selected tab uses Bend Pine.

- [ ] **Step / progress / indicators**
  - [ ] DataTable sorted column header and sort icon use **Bend Pine** when that column is sorted.
  - [ ] Any other step or milestone indicators (if present) use Bend Pine where appropriate.

- [ ] **Buttons and hierarchy**
  - [ ] Primary buttons (e.g. "Apply", "Add Role Type", "Add") remain **Alloy Blue**.
  - [ ] Success/confirmation-style actions (where `.admin-btn-success` or equivalent is used) use **Bend Pine**.

- [ ] **Surfaces / cards**
  - [ ] SectionCard has slightly **softer** borders and **subtle** shadow; section headers have a bit more spacing.
  - [ ] Overall admin feels less like a default template; no layout redesign.

- [ ] **Dashboard**
  - [ ] "Booked" and "Accepted" KPI cards have a **Bend Pine** left border (accent).
  - [ ] Other KPI cards keep their existing accents (navy, gold, slate, ember).

- [ ] **Regression**
  - [ ] No new layout or workflow changes.
  - [ ] Sidebar is not a large dark blue block.
  - [ ] Blue is still clearly used for structure and primary actions; Bend Pine is the accent for active/success/selected.
