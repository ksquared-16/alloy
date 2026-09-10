-- =============================================================================
-- attendance.record.assigned_only — capture narrowed to current assignments
-- =============================================================================
-- Thread 6, Slice 1. Teacher capture must be limited to the rooms a teacher is
-- actually assigned to, while directors and admins keep the site-wide authority
-- they legitimately have today. Something has to distinguish the two, and the
-- one thing it must NOT be is an inference.
--
-- ── WHY NOT A `teacher` ROLE ──
--
-- There is no `teacher` role in this platform. The canonical catalog holds
-- admin, ops, regional_lead and school_director, and `attendance.record` is
-- granted to admin and ops. Inventing a role here would make Attendance the
-- owner of a staffing concept it does not own, and every org that names its
-- educators something else would need Attendance to learn the new word.
--
-- Equally refused: `if person.is_employee`, `if an assignment exists`, or any
-- other shape where the SUBJECT's properties decide which authorization policy
-- applies. That is role inference wearing a different hat — an actor's authority
-- would change because their staffing record changed, with no grant anywhere.
--
-- ── WHY A NARROWING CAPABILITY, WHICH IS UNUSUAL ──
--
-- Permissions almost always grant. This one restricts, and that direction is
-- deliberate: its ABSENCE is today's behaviour, so every existing operator is
-- untouched by construction and no migration can quietly reduce anybody's reach.
-- Granting it can only ever narrow. A capability that could only widen would put
-- the fail-safe on the wrong side — forgetting to grant it would leave a teacher
-- with site-wide capture rather than none.
--
-- So the policy is chosen by what the actor HOLDS:
--
--   attendance.record                        → site-scoped capture (unchanged)
--   attendance.record + assigned_only        → capture inside current staff
--                                              assignments only
--
-- A "teacher" is then whatever role an org grants both to. Attendance never
-- learns the word.
--
-- ── DELIBERATELY GRANTED TO NOBODY ──
--
-- No role receives this by default. Granting it is an org's decision about which
-- of its roles are classroom-scoped, and a default here would silently narrow
-- real users the day it shipped — the exact failure `attendance.record` avoided
-- by granting to both admin and ops rather than admin alone.
--
-- Additive + idempotent. No existing grant is altered or dropped.
-- =============================================================================

DO $$
DECLARE
    v_key text := 'attendance.record.assigned_only';
    v_label text := 'Limit attendance capture to assigned rooms';
    v_desc text := 'NARROWS attendance.record rather than granting it. A holder may capture attendance only for locations covered by their current staff operational assignments, resolved from the canonical assignment foundation through their explicit user-to-person link. Holding it without attendance.record grants nothing. Not holding it leaves site-scoped capture unchanged, which is why directors and administrators are unaffected.';
BEGIN
    -- The RBAC catalog is spread across up to three tables and NOT every
    -- environment has all three; `permission_definitions` is the one constant.
    -- Registering only where the table exists keeps this replayable everywhere,
    -- the same reasoning `attendance.record` itself was registered under.
    IF to_regclass('public.permissions') IS NOT NULL THEN
        EXECUTE 'INSERT INTO public.permissions (key, group_key, label, is_active)
                 VALUES ($1, ''operations'', $2, true)
                 ON CONFLICT (key) DO UPDATE SET
                    group_key = EXCLUDED.group_key, label = EXCLUDED.label,
                    is_active = EXCLUDED.is_active'
        USING v_key, v_label;
    END IF;

    IF to_regclass('public.permission_keys') IS NOT NULL THEN
        EXECUTE 'INSERT INTO public.permission_keys (key, label, group_key, description, is_active)
                 VALUES ($1, $2, ''operations'', $3, true)
                 ON CONFLICT (key) DO UPDATE SET
                    label = EXCLUDED.label, group_key = EXCLUDED.group_key,
                    description = EXCLUDED.description, is_active = EXCLUDED.is_active'
        USING v_key, v_label, v_desc;
    END IF;

    IF to_regclass('public.permission_definitions') IS NOT NULL THEN
        EXECUTE 'INSERT INTO public.permission_definitions (key, group_key, label, description, is_active)
                 VALUES ($1, ''operations'', $2, $3, true)
                 ON CONFLICT (key) DO UPDATE SET
                    group_key = EXCLUDED.group_key, label = EXCLUDED.label,
                    description = EXCLUDED.description, is_active = EXCLUDED.is_active'
        USING v_key, v_label, v_desc;
    END IF;
END $$;
