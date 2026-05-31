# Action Definition Legacy Mapping v1

**Path:** `docs/sprints/05_2026/action_definition_legacy_mapping_v1.md`  
**Status:** Phase 0 — review before migrations  
**Companion:** [`canonical_action_catalog_v1.md`](./canonical_action_catalog_v1.md)

---

## Purpose

Map every **`action_definitions.key`** currently seeded or referenced in Alloy to:

1. **Canonical catalog key** (target vocabulary)
2. **Disposition** — keep · deprecate · merge · platform-only · data-capture helper
3. **Replacement** — canonical key operators and BOS should use instead
4. **Migration action** — what Phase 0/1 Supabase change applies

**Sources inspected:** Supabase migrations `20260427180000` through `20260529200000`, `ACTION_BUTTON_LIBRARY`, `applyRegistryResolvedActionClient.ts`, hardcoded queue/tour UI.

---

## Mapping summary

| Disposition | Count |
|-------------|------:|
| Maps to canonical (keep or rename label) | 5 |
| Partial — needs upgrade to canonical | 6 |
| Deprecate — replace with canonical | 11 |
| Platform adjunct — keep, not in matrix | 6 |
| Data capture helper — keep, not lifecycle | 4 |
| Placeholder — deactivate | 4 |
| **Total legacy keys** | **36** |

---

## Full mapping table

| Current key | Scope | action_type (typical) | Canonical target | Disposition | Migration action |
|-------------|-------|----------------------|------------------|-------------|------------------|
| `open_record` | global | open_drawer | *(self — platform)* | **platform-only** | Keep active |
| `qualify_opportunity` | global | update_status | `move_to_qualification` | **deprecate** | `is_active=false`; `canonical_replacement` |
| `start_quote` | global | open_drawer | — | **deprecate** | Deactivate; not childcare |
| `mark_won` | global | update_status | `approve_enrollment` | **deprecate** | Deactivate; replacement stub |
| `mark_lost` | global | update_status | `mark_lost` | **keep** | Tighten lost-reason gates (Phase 1) |
| `schedule_tour` | global + org | update_status / start_workflow | `schedule_tour` | **partial → keep** | Upgrade org execute; catalog metadata |
| `reschedule_tour` | org | start_workflow | `reschedule_tour` | **partial → keep** | Same |
| `send_form` | global | ui_intent | `send_form` | **partial → keep** | Upgrade to open_form/workflow |
| `send_enrollment_packet` | global | ui_intent | `send_enrollment_packet` | **partial → keep** | Upgrade to start_workflow |
| `quick_message` | global + org | ui_intent | `send_email` / `send_sms` / `call_parent` | **deprecate** | Deactivate after comms split |
| `ask_bos` | global + org | ui_intent | *(self — platform)* | **platform-only** | Keep |
| `send_message_placeholder` | global | ui_intent | `quick_message` → comms split | **placeholder** | Already hidden; deactivate |
| `new_inquiry` | global | navigate | — | **deprecate** | Deactivated in `20260430241000` |
| `open_enrollment_work_unit` | global | navigate | — | **deprecate** | Deactivated |
| `add_child` | global | open_form | *(data capture)* | **helper** | Keep; not lifecycle CTA |
| `add_sibling` | global | open_form | *(data capture)* | **helper** | Keep |
| `add_related_person` | global | open_form | *(data capture)* | **helper** | Keep |
| `add_family_member` | global | open_form | *(data capture)* | **helper** | Keep; move off header (placement) |
| `create_inquiry` | org | ui_intent | `create_lead` | **deprecate** | Replace with `create_lead` stub |
| `open_enrollment_pipeline` | org | ui_intent | — | **deprecate** | Deactivated |
| `review_automations` | org | ui_intent | *(platform)* | **platform-only** | Keep on right rail |
| `view_needs_attention` | org | ui_intent | *(platform)* | **platform-only** | Keep |
| `contact_attempted` | org | open_form | `move_to_qualification` + comms | **deprecate** | Split; deactivate |
| `update_status_add_note` | org | open_form | `add_note` + lifecycle actions | **deprecate** | Restrict to overflow/admin |
| `send_paperwork_placeholder` | org | ui_intent | `send_enrollment_packet` | **placeholder** | Deactivated |
| `add_to_waitlist_placeholder` | org | ui_intent | `move_to_waitlist` | **placeholder** | Deactivate → `move_to_waitlist` stub |
| `convert_to_enrolled_placeholder` | org | ui_intent | `approve_enrollment` | **placeholder** | Deactivate → stub |

---

## Canonical keys with no `action_definitions` row today

These catalog keys need **new rows** in Migration A (stubs inactive until handlers):

| Canonical key | Closest legacy / parallel UI |
|---------------|------------------------------|
| `call_parent` | `quick_message` |
| `send_email` | comms drawer, Task Assist draft |
| `send_sms` | comms drawer, Task Assist draft |
| `add_note` | `update_status_add_note` (note portion) |
| `create_task` | — |
| `upload_document` | drawer documents tab |
| `create_lead` | `create_inquiry` |
| `move_to_qualification` | `qualify_opportunity`, `contact_attempted` |
| `move_to_waitlist` | `add_to_waitlist_placeholder` + waitlist API |
| `confirm_tour` | tour bar `/confirm` |
| `record_tour_outcome` | tour bar `/complete`, `/no-show` |
| `contact_family` | `quick_message` |
| `remove_from_waitlist` | status PATCH / placement |
| `collect_waitlist_fee` | — |
| `waive_waitlist_fee` | — |
| `review_enrollment_packet` | packet review modal/API |
| `request_missing_information` | — |
| `approve_enrollment` | `mark_won`, `convert_to_enrolled_placeholder` |
| `reserve_spot` | placement orchestration |
| `assign_classroom` | placement UI |
| `assign_schedule` | field edits |
| `set_start_date` | field edits |
| `collect_registration_fee` | — |
| `waive_registration_fee` | — |
| `collect_deposit` | — |
| `record_deposit` | — |
| `withdraw_child` | person/member lifecycle |
| `reopen_lead` | — |
| `reenroll_child` | — |

**Count:** 26 missing definition rows (matches catalog summary).

---

## Deprecation detail

### Tier 1 — Deactivate immediately after canonical stub exists (Migration B)

| Legacy key | Replacement | Risk if removed before replacement |
|------------|-------------|-------------------------------------|
| `qualify_opportunity` | `move_to_qualification` | Low — placements already removed |
| `start_quote` | — | Low — placements removed |
| `mark_won` | `approve_enrollment` | Medium — verify no hidden placement |
| `create_inquiry` | `create_lead` | High — right rail CTA; stub first |
| `contact_attempted` | comms + `move_to_qualification` | High — active placements |
| `add_to_waitlist_placeholder` | `move_to_waitlist` | Medium |
| `convert_to_enrolled_placeholder` | `approve_enrollment` | Medium |
| `send_paperwork_placeholder` | `send_enrollment_packet` | Low — deactivated |
| `send_message_placeholder` | comms split | Low |
| `quick_message` | comms split | High — active queue placements |
| `update_status_add_note` | lifecycle + `add_note` | High — queue + header placements |

### Tier 2 — Deprecate after Phase 1 handlers ship

| Legacy key | Replacement | Notes |
|------------|-------------|-------|
| `quick_message` | channel-specific comms | Migrate placements key-by-key |
| `update_status_add_note` | stage actions | Move to overflow only |
| `mark_lost` | same key | Not deprecated — tighten gates |

### Tier 3 — Non-action legacy (hardcoded UI)

| Location | Hardcoded behavior | Canonical target |
|----------|-------------------|------------------|
| `realWorkUnitFromOpportunities.ts` | qualify_opportunity, start_quote, mark_lost chips | Registry placements |
| `OpportunityTourBookingLifecycleBar.tsx` | confirm, complete, no-show | `confirm_tour`, `record_tour_outcome` |
| BOS `operationalRecommendationCatalog.ts` | prose action keys | Appendix C alias map |
| `AdminEntityDrawer` packet modal | direct modal open | `send_enrollment_packet` execute |
| Intake `applyFormIntakeSafe` | auto create opportunity | `create_lead` API equivalent |

---

## Key rename policy

**Do not rename DB keys in place** for breaking legacy (`create_inquiry` → `create_lead`, `mark_won` → `approve_enrollment`).

Preferred pattern:

1. Insert new canonical row with new key.
2. Set legacy `payload_schema.canonical_replacement`.
3. Dual-read in `executeAdminAction` for one release (optional).
4. Migrate placements to new `action_definition_id`.
5. Deactivate legacy row.

**Label-only renames** safe before key migration:

- `create_inquiry` label → "Create lead"
- `mark_won` label → "Approve enrollment" (discouraged — replace key instead)

---

## Org-scoped vs global template strategy

| Pattern | When to use |
|---------|-------------|
| **Global** (`org_id` NULL) | Universal catalog keys shared across industries |
| **Org-scoped** | Customer workflow overrides (e.g. org `schedule_tour` start_workflow) |
| **Industry template seed** | Childcare enrollment orgs get org rows copied from global on bootstrap |

Phase 0 migration inserts **global stubs only**. Org overrides remain for `schedule_tour` / `reschedule_tour` until consolidated.

---

## `action_placements` impact (Phase 0 = none)

Current placements reference legacy keys. **Phase 0 migrations must not DELETE placements.**

| Placement-heavy legacy key | Active surfaces (typical) |
|----------------------------|---------------------------|
| `contact_attempted` | queue_row, record_header |
| `update_status_add_note` | queue_row, record_header |
| `schedule_tour` / `reschedule_tour` | record_header |
| `mark_lost` | record_header overflow |
| `create_inquiry` | right_rail |
| `quick_message` / `ask_bos` | queue_row (org-added) |
| `add_child` / `add_sibling` | record_section inquiry_children |
| `add_family_member` | record_header |

Phase 1 placement migration will repoint to canonical definition IDs with `lifecycle_stage` conditions.

---

## Proposed migration SQL sketch (review only — not applied)

```sql
-- Migration A (sketch): insert inactive canonical stubs
INSERT INTO public.action_definitions (org_id, key, label, entity_type, action_type, payload_schema, is_active, priority)
SELECT NULL, v.key, v.label, 'opportunity', 'ui_intent',
       jsonb_build_object('catalog_version', 'v1', 'catalog_status', 'stub', 'lifecycle_stage', v.stage, 'universal', v.universal),
       false, v.priority
FROM (VALUES
  ('create_lead', 'Create lead', 'entry', false, 5),
  ('call_parent', 'Call parent', 'universal', true, 60),
  -- ... remaining missing keys
) AS v(key, label, stage, universal, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM public.action_definitions x
  WHERE x.key = v.key AND x.org_id IS NULL
);

-- Migration B (sketch): mark legacy replacements
UPDATE public.action_definitions
SET payload_schema = coalesce(payload_schema, '{}'::jsonb) || jsonb_build_object(
      'canonical_replacement', 'move_to_qualification',
      'deprecated', true,
      'catalog_version', 'v1'
    ),
    is_active = false,
    updated_at = now()
WHERE org_id IS NULL AND key = 'qualify_opportunity';
```

Full key list for Migration A belongs in the migration PR after this doc is approved.

---

## Verification queries (post-migration)

```sql
-- All catalog v1 keys present (global)
SELECT key, is_active, payload_schema->>'catalog_status'
FROM action_definitions
WHERE org_id IS NULL
  AND payload_schema->>'catalog_version' = 'v1'
ORDER BY key;

-- Legacy rows marked deprecated
SELECT key, payload_schema->>'canonical_replacement', is_active
FROM action_definitions
WHERE payload_schema->>'deprecated' = 'true';

-- Placements still pointing at deprecated defs (expect non-zero until Phase 1)
SELECT d.key, p.surface, count(*)
FROM action_placements p
JOIN action_definitions d ON d.id = p.action_definition_id
WHERE d.payload_schema->>'deprecated' = 'true'
  AND p.is_active = true
GROUP BY 1, 2;
```

---

## Sign-off

| Reviewer | Question | OK |
|----------|----------|-----|
| Product | Canonical keys match matrix operator language | |
| Eng | No placement migration in Phase 0 | |
| Eng | Deprecation tier order acceptable | |
| Eng | `mark_lost` retained as canonical (not deprecated) | |

After sign-off: implement Migration A + B in one PR; begin Phase 1 handlers for P0 keys.
