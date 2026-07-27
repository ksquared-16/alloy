---
owner: platform
status: proposed
last_reviewed: 2026-07-25
supersedes: []
---

# Assignment Platform — Settings Inventory (Phase 2C / 2C-A)

**Status:** Inventory only. **Do not build a new Settings area from this document.**

Phase 2C-A completed operator UX on existing Focus Panel surfaces; this inventory records ownership boundaries so Assignment Settings never duplicate Rooms, Programs, or Operational Calculations.

---

## 1. Assignment Types (current)

| Key | Label | Notes |
|-----|--------|--------|
| `primary_classroom` | Primary Classroom | Default home; billing + attendance + staffing demand |
| `before_care` | Before Care | Secondary concurrent commitment |
| `after_care` | After Care | Secondary concurrent commitment |
| `enrichment` | Enrichment | Secondary concurrent commitment |
| `transportation` | Transportation | No attendance/staffing by default |
| `therapy` | Therapy | No attendance/staffing by default |
| `recurring_service` | Recurring Service | Child or staff |

**Nothing missing for V1 operator vocabulary.** Do not invent further types unless a tenant proves a gap that cannot be expressed as a Program, Room, or pattern.

**Owner:** Organization (`operational_assignment_types`). Authoring surface: Assignments Workspace → Studio → Types (not a Location override in V1).

---

## 1b. Program / Room ownership (product rule)

| Phase | Program interest | Operational Program / Room / schedule |
|-------|------------------|----------------------------------------|
| Inquiry — no committed Assignment | Editable on the child / OCM enrollment path | Not yet owned by Assignment |
| Committed or proposed operational Assignment exists | Historical inquiry facts retained (not silently overwritten) | **Primary Assignment** owns Program, Room, days/time, effective dates |

Children summary derives Program/Room from the primary Assignment once one exists. Changing Program after that is **Edit Assignment / Change Assignment**, not an unrelated child field. Program selection gates Room eligibility (Site → Program → eligible Rooms); invalid Rooms clear on Program change via existing placement cascade helpers.

Do not invent a new Offering abstraction. Do not duplicate Program, Room, or schedule truth outside Assignment + placement sync.

---

## 2. Settings map (ownership)

| Setting | Belongs to | Assignment Platform exposes? |
|---------|------------|------------------------------|
| Assignment Types vocabulary | **Organization** | Yes (read for pickers; authoring later) |
| Default primary type key | **Organization** | Yes (future default for first create) |
| Status values (`planned` / `active` / `ending` / …) | **Platform** (ledger) | No Settings UI — code-owned |
| Overlap policy (warn vs block) | **Operational Calculations** + org policy | No — Calculations own binding; Assignments surface warnings |
| Primary policy (singular child primary) | **Platform** (`assignment.set_primary`) | No Settings toggle — invariant |
| Timeline default weekday | **Assignment Platform** (client preference) | Optional later; not Settings |
| Timeline show gaps / future | **Assignment Platform** | Presentation default; not Settings |
| Operational effects (attendance / staffing / billing participation) | **Assignment Type** | Yes as type fields — not free-form per assignment |
| Validation rules (type required on secondary create) | **Platform** (commands) | No Settings — product rule |
| Operating hours / closures | **Rooms / Location** | No |
| Program eligibility / age gates | **Programs** (+ Calculations evaluate) | No |
| Capacity / ratios | **Rooms** authored; **Calculations** bind | No |
| Schedule patterns / recurrence types | **Location** scheduling config | Already owned; Assignment consumes |
| Billing rates / tuition | **Billing** | Display only on Assignment |

**Schedule patterns detail:** one canonical `schedule_patterns` table/API
(`/api/admin/schedule-patterns`), scoped to a single `site_location_id` — there is no
org-wide pattern row. Studio → Patterns (Scheduling Workspace) and Locations → Schedule
(`LocationSchedulePatternsSettingsPanel` / `LocationSchedulePatternCreatePanel`) are two
UIs over the same rows; Studio is not a duplicate store. "Available everywhere" means
creating the same-shaped pattern at each site, not a new org-scoped table.

---

## 3. What Assignment Platform Settings should eventually include

Only surfaces that are truly Assignment-owned:

1. **Assignment Types** — CRUD, sort order, subject applicability, participation defaults, visual tone.
2. **Org defaults** — default type for first child assignment (usually Primary Classroom); optional “require type on all creates.”
3. **Operator presentation** — compact summary format toggles only if product later needs tenant choice (default stays Room · Days · Effective · Time).

Everything else stays with Location, Rooms, Programs, Calculations, Billing, or Staffing.

---

## 4. Phase 2D follow-ups (settings-related)

- Configuration authoring UI for Assignment Types (no new Settings IA until then).
- Wire org default primary type into first-create path.
- Conflict/overlap policy inputs once Operational Calculations expose them.
