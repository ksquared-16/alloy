-- =============================================================================
-- Provision the `send_tour_invitation` operator command
-- =============================================================================
-- Slice D shipped the CODE half of this capability and not the CONFIG half:
-- `sendTourInvitationAction` is registered in `actionRegistry.ts`, mints the
-- invitation, renders content and enqueues on both channels — but no migration
-- ever provisioned an `action_definitions` row or an `action_placements` row.
--
-- The registry's own contract (actionRegistry.ts) is explicit:
--
--   "Config (action_definitions / placements) decides *where/when/how* an
--    action shows. The registry decides *what an action is and how it runs*."
--
-- With the config half absent the command appeared on NO operator surface, so
-- no operator could ever invite a family. A certification run confirmed it: the
-- Focus Panel Manage menu offered Schedule tour / Reschedule tour / Confirm
-- tour and nothing else, and the tenant held zero invitation messages and zero
-- invitation workflow events.
--
-- Structural template is `20260602190000_tour_canonical_action_alignment.sql`,
-- whose `confirm_tour` entry is this command's closest sibling: a registered
-- handler, on the opportunity record header, in the overflow (Manage) menu.
--
-- SCOPE — deliberately narrow for a first release:
--   * Focus Panel Manage only (`record_header` / `overflow`).
--   * NOT Workspace, NOT the Work Unit right rail, NOT queue rows, NOT the
--     generic primary slot. The command inherits the Focus Panel's currently
--     selected record; it has no meaning without one.
--   * Never marked as a universally recommended primary action — Business
--     Process stage configuration owns recommendation, not this migration.
--
-- Placement visibility is NOT security. `sendTourInvitationAction` independently
-- re-establishes operator identity, org membership, record scope and send
-- authority at execute time; hiding the button is presentation only.
--
-- IDEMPOTENT. Both inserts are guarded by NOT EXISTS on the natural key, so a
-- replay of the migration chain is a no-op rather than a duplicate command.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Definition — global template (org_id IS NULL), same as every other
--    platform-owned tour action. Org-level overrides remain possible.
-- ---------------------------------------------------------------------------

INSERT INTO public.action_definitions (
    org_id,
    key,
    label,
    description,
    entity_type,
    action_type,
    priority,
    payload_schema,
    is_active
)
SELECT
    v.org_id,
    v.key,
    v.label,
    v.description,
    v.entity_type,
    v.action_type,
    v.priority,
    v.payload_schema::jsonb,
    v.is_active
FROM (VALUES
    (
        NULL::uuid,
        'send_tour_invitation'::text,
        'Send tour invitation'::text,
        'Invite this family to choose a tour time.'::text,
        'opportunity'::text,
        -- Same dispatch shape as `confirm_tour`: the runtime routes to the
        -- registered handler by action key; `intent` carries the UI hop.
        'ui_intent'::text,
        56,
        '{"intent":"send_tour_invitation"}',
        true
    )
) AS v(org_id, key, label, description, entity_type, action_type, priority, payload_schema, is_active)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_definitions x
    WHERE x.key = v.key
      AND x.org_id IS NOT DISTINCT FROM v.org_id
);

-- ---------------------------------------------------------------------------
-- 2) Placement — Focus Panel Manage menu on an opportunity record.
--
--    ORDERING. Within the overflow menu this sits ahead of `confirm_tour` (57)
--    and `record_tour_outcome` (58). `schedule_tour` (55) and `reschedule_tour`
--    (56) live in the `secondary` slot and render as buttons before the menu
--    opens, so "after Schedule tour, before Confirm" holds in the rendered
--    order without renumbering any existing placement.
--
--    VISIBILITY. No display condition — deliberately, and corrected from a live
--    run. The first draft copied `schedule_tour`'s documented `status_key_in`
--    window from `20260602190000`. Against a real tenant that hid the command
--    on every record: those keys are pipeline-stage vocabulary, while the
--    opportunities carry `status_key` values of `open` / `closed` / `new`, and
--    the seeded `schedule_tour` placement in fact ships `condition_config {}`.
--
--    A status gate is also the wrong mechanism here. The approved behaviour is
--    that eligibility — resolvable recipient, at least one usable channel,
--    available slots — is decided by the action runtime at invoke time and
--    SHOWN as an operator-visible blocked reason. A display condition would
--    silently hide the command instead, which is the failure mode this whole
--    provisioning exists to end.
-- ---------------------------------------------------------------------------

WITH def AS (
    SELECT ad.id
    FROM public.action_definitions ad
    WHERE ad.org_id IS NULL
      AND ad.key = 'send_tour_invitation'
      AND ad.is_active = true
)
INSERT INTO public.action_placements (
    org_id,
    action_definition_id,
    surface,
    slot,
    entity_type,
    department_id,
    work_unit_id,
    section_key,
    order_index,
    display_style,
    condition_config,
    is_active
)
SELECT
    NULL::uuid,
    def.id,
    'record_header'::text,
    'overflow'::text,
    'opportunity'::text,
    NULL::uuid,
    NULL::uuid,
    NULL::text,
    56,
    'menu_item'::text,
    '{}'::jsonb,
    true
FROM def
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_placements ap
    WHERE ap.org_id IS NULL
      AND ap.action_definition_id = def.id
      AND ap.surface = 'record_header'
      AND ap.slot = 'overflow'
      AND ap.entity_type = 'opportunity'
      AND ap.department_id IS NULL
      AND ap.work_unit_id IS NULL
      AND ap.section_key IS NULL
);

-- ---------------------------------------------------------------------------
-- 3) Self-repair — normalise an already-applied placement.
--
-- The first version of this migration shipped a `status_key_in` display
-- condition that hid the command on every record. Any environment that applied
-- that version keeps its row (the guard above is NOT EXISTS, so a re-run will
-- not touch it), which would leave the command provisioned and invisible —
-- exactly the state this file exists to fix. Converge it explicitly.
--
-- Scoped to the global placement for this one action, and idempotent: on a
-- fresh apply the row already reads '{}' and the UPDATE is a no-op.
-- ---------------------------------------------------------------------------

UPDATE public.action_placements ap
SET condition_config = '{}'::jsonb,
    updated_at = now()
FROM public.action_definitions ad
WHERE ad.id = ap.action_definition_id
  AND ad.org_id IS NULL
  AND ad.key = 'send_tour_invitation'
  AND ap.org_id IS NULL
  AND ap.surface = 'record_header'
  AND ap.slot = 'overflow'
  AND ap.condition_config IS DISTINCT FROM '{}'::jsonb;
