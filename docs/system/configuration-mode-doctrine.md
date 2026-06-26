# Configuration Mode Doctrine

**Status:** Frozen — Configuration Runtime V1 (June 2026)

Configuration Mode is the operator-facing settings experience: **Context → Queue → Workspace → BOS**.

See **`configuration-runtime-v1.md`** for frozen shell geometry and V1 completion criteria.

## Shell geometry (frozen)

| Column | Width |
|--------|-------|
| Section Queue | 260px |
| Object Queue | 320px |
| Workspace | flex (~950px at 1920 viewport) |

Widths live in shared CSS variables — never hardcode per page.

## Ownership (frozen)

| Concept | Owner |
|---------|--------|
| Campuses, programs, rooms, schedules | **Locations** |
| What data exists | **Fields** |
| Status vocabulary | **Statuses** |
| When operators use actions | **Processes** |
| Where operators see actions | **Surfaces** |
| Who can configure | **Access** |
| Messaging | **Communications** |
| Metrics and indicators | **Operational Intelligence** |
| Workflows | **Automation** |
| Platform action metadata (internal) | **Action definitions** — not primary nav |

## Primary Configuration IA

1. **Organization** — Locations, Access, Communications  
2. **Data** — Fields, Statuses  
3. **Operations** — Processes, Surfaces  
4. **Operational Intelligence**  
5. **Automation**

Actions is **not** in primary operator navigation.

## Visual doctrine

Use shared typography tokens (`config-typo-*`), Bend Pine active states, white cards, stone borders.

The `/settings` index uses a **compact context row** (`ConfigurationContext`) — not a bordered hero card. Title: **Settings**. Subtitle: *Configure Alloy by area.* Tiles begin ~24px below the context row.

Do **not** use blue/slate admin styling or table-first admin layouts as primary Configuration UI.

## Forbidden routes

- `/settings/queue-builder`
- `/settings/focus-panel-builder`

Presentation is authored in **Surfaces** only.

## Work View setup

Processes Work Views assign published surface documents and define **Show work when** using typed date/status/location controls.

Relative date presets: Today, Tomorrow, This week, Next week, Previous week, Custom date, Next/Previous N days/weeks/months.

---

See `configuration-ownership-doctrine.md` for the full matrix.
