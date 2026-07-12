# Universal Card Archetype Mocks

Reviewable visual mocks — **one reference card per archetype**. These are
presentation mocks (fixture data, scoped styles), **not production cards**.
Identity is already implemented as the **Household card**; these eight cover the
remaining archetypes.

## How to view (live)

```bash
cd web && npm run dev
# open http://localhost:3000/dev/archetype-card-mocks   (dev-only; 404 in production)
```

Route: `web/app/dev/archetype-card-mocks/` (`page.tsx` gates production, the
gallery lives in `ArchetypeCardMocksGallery.tsx`).

## Cards

| # | Archetype | Card | Operational question |
|---|-----------|------|----------------------|
| 1 | Process | Tour Card | Where is this family in the tour process? |
| 2 | Work | Current Work Card | What needs to happen next on this record? |
| 3 | Intelligence | Readiness Card | Is this family ready to advance? |
| 4 | **Collection** | **Children Card** *(priority next build)* | **What is true for this child right now?** |
| 5 | Communication | Communications Card | What's the latest with this family? |
| 6 | Financial | Billing Preview Card | What will this family pay, and what's owed? |
| 7 | Activity | Timeline Card | What has happened on this record? |
| 8 | Metrics | KPI / Enrollment Health Card | How healthy is enrollment right now? |

## Each card shows

Overview · Evidence / expanded · Focused state · Empty · Missing/risk (where the
archetype has one — Activity is read-only history, marked N/A) · Mobile density,
plus per-card **Transition** and **Performance** notes.

## Snapshots

| File | Contents |
|------|----------|
| `00-full-gallery.png` | All eight archetype sections |
| `01-process-tour.png` | Process — Tour Card |
| `02-work-current.png` | Work — Current Work Card |
| `03-intelligence-readiness.png` | Intelligence — Readiness Card |
| `04-collection-children.png` | **Collection — Children Card (priority)** |
| `05-communication.png` | Communication — Communications Card |
| `06-financial-billing.png` | Financial — Billing Preview Card |
| `07-activity-timeline.png` | Activity — Timeline Card |
| `08-metrics-health.png` | Metrics — KPI / Enrollment Health Card |

## Shared rules demonstrated

- **Neutral chrome.** Semantic color appears only as a left **rail**, a **badge**,
  or a **warning** — never a large tinted header/container.
- **One question per card.** The insight line is the answer; the body is evidence.
- **Local depth.** Overview → Evidence → Focused is local UI; expanding never
  fetches. Only explicit Focus on a heavy item (message body, KPI trend, older
  timeline) may defer-load.
- **Operational Context boundary.** Each card observes the composed context for
  its subject (and the Children card *Change Subjects* to a focused child without
  a new drawer/route).

## Children Card — priority detail

The Children card answers **"What is true for this child right now?"** and is the
recommended next implementation after Household. Per child it carries: **name,
DOB/age, program, room, schedule, enrollment status, start date**, plus
**medical/document flags only when present**. The **focused child** state shows a
single child at full operational depth. This is the operational truth that
Household deliberately excludes (Household children are belonging-only).

> Architecture spine: `Queue → Operational Context → Focus Panel → Configured Surface → Cards → Perspectives`.
> See `docs/platform/operator/universal-universal-card-archetypes.md` and
> `docs/platform/operator/operational-context-boundary.md`.
