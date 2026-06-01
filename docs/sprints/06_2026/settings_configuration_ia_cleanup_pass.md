# Settings Configuration & IA Cleanup Pass

**Path:** `docs/sprints/06_2026/settings_configuration_ia_cleanup_pass.md`  
**Status:** Audit + editable lifecycle MVP (May 2026)  
**Route:** `/adminV2/settings/lifecycle` (lifecycle hub shipped prior pass)

---

## Part 1 — Settings IA audit (every tile)

| Tile (current) | Current group | Controls | Audience | Mode today | Recommended group | Recommended label / copy |
|----------------|---------------|----------|----------|------------|-------------------|---------------------------|
| Communications | Organization setup | Provider bindings, email/SMS setup | Operator | **Editable** | **Organization** | Communications — *Email and SMS delivery setup* |
| Departments | Organization setup | Dept structure, attention metadata root | Operator / admin | **Editable** | **Organization** | Departments |
| Locations & hierarchy | Organization setup | Sites, rooms, hierarchy | Operator | **Editable** | **Organization** | Locations & hierarchy |
| Work units & queues | Organization setup | `work_units`, `queue_definition` | Operator | **Partial** (WU metadata; queue JSON advanced) | **Enrollment operations** | Work units & queues — *Pipeline lanes and queue layout* |
| Waitlist Ranking Policy | Organization setup | `priority_rule_*` on placement policy | Operator | **Editable** | **Enrollment operations** | Waitlist ranking — *Priority order for waitlisted children* |
| Workspace metrics | Organization setup | KPI placements | Operator | **Editable** | **Organization** | Workspace metrics — *Dashboard KPI tiles* |
| Users & access | Organization setup | Roles, scope, members | Admin | **Editable** | **Organization** | Users & access |
| Lifecycle stages & requirements | Enrollment lifecycle (lonely) | Stage doctrine checklist (code catalog) | Operator | **Read-only** | **Enrollment operations** | Lifecycle stages & requirements |
| Record layouts | Records & layouts | Drawer sections, `field_placements_v1` | Operator | **Editable** | **Record setup** | Record layouts |
| Fields | Records & layouts | `field_definitions` labels, visibility | Operator | **Editable** | **Record setup** | Fields |
| Statuses | Records & layouts | `status_definitions` labels/order | Operator | **Editable** | **Enrollment operations** | Statuses — *Names and order for pipeline statuses* |
| Record labels | Records & layouts | Entity label overrides | Operator | **Editable** | **Record setup** | Record labels |
| Attention & SLA | Records & layouts | `opportunity_attention_rules` on dept | Operator | **Editable** | **Enrollment operations** | Attention & SLA |
| Tour availability | Records & layouts | Tour bookable windows | Operator | **Editable** | **Enrollment operations** | Tour availability |
| Relationships | Records & layouts | Person/customer relationship types | Operator | **Partial** | **Record setup** | Relationships |
| Automations | Workflows & automation | `workflows` definitions | Admin / power user | **Editable** | **Actions & automation** | Automations |
| Action buttons | Workflows & automation | `action_placements` | Operator | **Editable** | **Actions & automation** | Action buttons — *Where buttons appear (not what they do)* |
| Configuration proposals | Workflows & automation | BOS layout proposals | Admin | **Partial** | **Actions & automation** | Configuration proposals |
| Option lists | Communication & documents | Option sets | Operator | **Editable** | **Record setup** | Option lists |
| Document fields | Communication & documents | Document field config | Operator | **Partial** | **Documents & forms** | Document fields |
| Forms & packets | Communication & documents | Form definitions (related hub) | Operator | **Editable** (hub) | **Documents & forms** | Forms & packets |
| Workflow automation rules | Diagnostics sidebar | `status_transition_rules` | Developer / admin | **Read-only** | **Diagnostics** | Workflow automation rules |
| Field grouping (advanced) | Diagnostics sidebar | `field_section_definitions` bulk | Developer | **Editable** but advanced | **Diagnostics** | Field grouping (advanced) |

**Clutter drivers (before cleanup):**

- Enrollment ops split across Organization, lonely lifecycle group, and Records & layouts.
- Statuses and Attention buried under “Records & layouts” though they are pipeline operations.
- KPIs mixed with enrollment queue config.
- No mode hint (Editable / Read-only) on index tiles.

**Implemented in this pass:** Settings index regrouped per recommended groups + `Editable ·` / `Read-only ·` / `Partial ·` prefixes on tile descriptions.

---

## Part 2 — Lifecycle configuration source / editability

| Setting | Current source | Editable today? | Should be editable? | Needed work |
|---------|----------------|-----------------|---------------------|-------------|
| Stage required/recommended lists (Settings hub) | `lifecycleProgressionRequirementsCatalog.ts` (TS) | **No** | **Yes** (org policy) | Store overrides in `departments.metadata.lifecycle_progression_requirements_v1` or org metadata; PATCH API; merge in catalog + `evaluateLifecycleActionRequirements` |
| Execute-now preflight (`approve_enrollment`, `move_to_waitlist`, …) | `lifecycleActionRequirementCatalog.ts` (TS) | **No** | **Yes** (same policy store) | Wire evaluator to merged catalog; Settings checkboxes map labels → internal keys |
| Stage meanings (hub copy) | `LIFECYCLE_STAGE_MEANINGS` (TS) | **No** | Optional later | Low priority; copy rarely changes |
| Typical actions per stage (hub) | New static operator list in catalog (TS) | **No** | Visibility via Actions | Already editable via **Action buttons** placements |
| Status labels / order | `status_definitions` (DB) | **Yes** | **Yes** | None — use Statuses |
| Status transition allowed paths | `status_transition_rules` (DB) | **Read-only UI** | **Yes** | Editable rules UI (deferred) |
| Action visibility (header, section, queue, rail) | `action_placements` (DB) | **Yes** | **Yes** | None — use Action buttons; `condition_config` stage gating read-only |
| Action handlers / new buttons | `action_definitions` + code | **No** (platform) | No (platform) | New handlers = engineering |
| Field required on drawer | `field_placements_v1` (DB) | **Yes** | **Yes** | Layouts — not stage-scoped today |
| Field registry defaults | `field_definitions` (DB) | **Partial** | Partial | Fields UI |
| Needs Attention buckets / thresholds | `departments.metadata.opportunity_attention_rules` | **Yes** | **Yes** | Attention & SLA |
| Work unit queue domains | `work_units.queue_definition` (DB) | **Partial** | Partial | Advanced JSON; domain CRUD deferred |
| BOS recommendation copy | `operationalRecommendationCatalog.ts` (TS) | **No** | Partial | Catalog + preflight linkage |
| Completion guardrails (person) | Bootstrap TS catalog | **Read-only** | Partial | Separate from lifecycle stages |

**Truth for operators:** Lifecycle **stage requirements** shown on `/adminV2/settings/lifecycle` are **platform defaults in code**, not saved per org yet. **Action placement** and **Attention** are the main editable surfaces that affect lifecycle UX today.

---

## Part 3 — Lifecycle editing MVP proposal (smallest safe)

**Do not build** a rule builder or per-field `field_key` UI.

### MVP scope (next engineering slice)

1. **Storage:** `departments.metadata.lifecycle_progression_requirements_v1`  
   - Shape: `{ version: 1, stages: { qualification: { required_labels: string[], recommended_labels: string[] }, ... } }`  
   - Labels are operator tokens (`Child`, `Program`, …) mapped internally to evaluator keys.

2. **Settings UI:** On lifecycle hub, per stage:  
   - Checkboxes for allowed labels from a fixed palette per stage  
   - Save / Reset to platform default  
   - Badge: **Editable** when dept admin; **Viewing platform defaults** when no override

3. **Runtime:** `lifecycleProgressionRequirementsForStage(stage, deptMetadata?)` merges override; `evaluateLifecycleActionRequirements` reads same merge for preflight.

4. **Available actions:** Do not duplicate action registry — show read-only typical actions + link **Configure button visibility → Action buttons** with `?entity_type=opportunity`.

5. **Defer:** Stage-scoped `condition_config` builder, workflow rules editor, BOS copy editor.

**Implemented (May 2026 follow-up):** `departments.metadata.lifecycle_progression_requirements_v1`, GET/PATCH API, Settings hub checkboxes, runtime merge in catalog + action preflight.

---

## Part 4 — Action placement editability audit

| Placement surface | Storage | Configurable today? | BOS / NA? | MVP notes |
|-------------------|---------|---------------------|-----------|-----------|
| Record header (drawer Actions menu) | `action_placements` `surface=record_header` | **Yes** — enable, slot, order | No | Primary lifecycle actions |
| Record section | `surface=record_section` + `section_key` | **Yes** | No | Add child, family contacts |
| Workspace queue row | `surface=queue_row` | **Yes** | No | Open, mark lost, inline |
| Workspace side panel (right rail) | `surface=right_rail` | **Yes** | No | Create lead, view needs attention |
| Workspace root `surface=workspace` | Schema only | **No** — not wired in UI | No | Use right_rail / queue_row |
| Department vs WU scoped placement | `department_id`, `work_unit_id` on row | **Yes** (nullable = global org) | No | Filter in Action buttons UI |
| Stage/status visibility | `condition_config` on placement | **Read-only** in Settings | No | Seeded via migrations; builder deferred |
| BOS recommendations | Code catalog + attention resolver | **No** | N/A | Not action_placements |
| Needs Attention queue | Attention rules + resolver | **Partial** (buckets editable) | N/A | Not per-action placement |

**Operator goal:** “Show Move to waitlist in drawer and queue, not side rail” → **supported today** via Action buttons (two placement rows: `record_header` + `queue_row`).

**Gap:** Stage-based visibility without migrations requires `condition_config` UI (deferred).

---

## Part 5 — Implemented in this pass

| Item | Status |
|------|--------|
| Settings index regrouping + mode prefixes | **Done** — `web/app/adminV2/settings/page.tsx` |
| Lifecycle hub: source-of-truth banner | **Done** — `LifecycleConfigurationSourceBanner.tsx` |
| Lifecycle hub: related settings links | **Done** — `LifecycleRelatedSettingsLinks.tsx` |
| Lifecycle hub: typical actions (read-only) + link to Action buttons | **Done** — catalog + hub UI |
| Lifecycle requirement checkbox editing | **Done** — department-scoped hub + API |
| Settings tile renamed **Lifecycle** (editable) | **Done** |
| Title Case tile labels | **Done** |
| Tests | **Done** — `lifecycleSettingsHub.test.ts`, `settingsIndexIaCleanup.test.ts` |

---

## Remaining gaps

1. Persisted lifecycle requirement overrides (org/dept metadata + API).
2. `condition_config` visual editor for stage-scoped action visibility.
3. Status transition rules editable UI.
4. Queue definition domain CRUD in Settings.
5. Settings sidebar nav (still index-only discovery).

---

## References

- `docs/system/configuration-system.md` — four-plane model  
- `web/lib/completion/lifecycleActionRequirementCatalog.ts` — execute preflight  
- `web/lib/completion/lifecycleProgressionRequirementsCatalog.ts` — Settings doctrine  
- `web/lib/admin/actions/actionPlacementPresentation.ts` — placement surfaces  
