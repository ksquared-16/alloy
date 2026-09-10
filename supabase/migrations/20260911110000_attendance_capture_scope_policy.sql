-- =============================================================================
-- Attendance capture scope — a policy on the access profile, not a permission
-- =============================================================================
-- Thread 6, Slice 1. Some attendance actors are site-wide; others should be
-- constrained to the rooms they are actually assigned to. Something must say
-- which, and the first attempt said it with a permission key whose PRESENCE
-- narrowed authority. That was wrong, and wrong in a way worth recording.
--
-- ── WHY A NARROWING PERMISSION WAS THE WRONG SHAPE ──
--
-- Permissions are additive: a grant answers "what may this actor do", and roles
-- union. A key that REMOVES authority breaks that law. An actor holding both an
-- administrator role and an educator role would have ended up with LESS
-- attendance authority than the administrator role alone, because the educator
-- role contributed a restriction. Adding a role would have quietly reduced
-- access — anti-monotonic, invisible at the grant surface, and exactly the kind
-- of composition rule nobody should have to discover from behaviour.
--
-- ── WHY THIS TABLE ──
--
-- `user_access_profiles` already answers questions of this exact kind:
-- `department_scope` and `site_scope` are per-user MODES, not grants, and
-- `resolveAdminAccessCore` already reads them into the scope dimensions every
-- authorization site receives. Capture scope is the same kind of answer about
-- the same subject, so it belongs beside them rather than in the permission
-- catalog.
--
-- The union problem disappears structurally: `uq_user_access_profiles_user_org`
-- means exactly one profile row per user per org. There is nothing to union, so
-- there is no composition law to invent and no way for a second role to change
-- the answer.
--
-- ── WHY THE DEFAULT IS `site` ──
--
-- It is today's behaviour. Every existing profile takes it on backfill, so no
-- operator's reach changes the day this ships, and no administrator can drift
-- into the constrained policy by acquiring a role, an employment record or a
-- schedule assignment. Narrowing requires someone to deliberately set this
-- column for that user — "unless an explicit access policy says otherwise".
-- =============================================================================

ALTER TABLE public.user_access_profiles
    ADD COLUMN IF NOT EXISTS attendance_capture_scope text NOT NULL DEFAULT 'site';

DO $$
BEGIN
    ALTER TABLE public.user_access_profiles
        DROP CONSTRAINT IF EXISTS user_access_profiles_attendance_capture_scope_check;
    ALTER TABLE public.user_access_profiles
        ADD CONSTRAINT user_access_profiles_attendance_capture_scope_check
        CHECK (attendance_capture_scope = ANY (ARRAY['site'::text, 'assigned'::text]));
END $$;

COMMENT ON COLUMN public.user_access_profiles.attendance_capture_scope IS
    'Which attendance capture scope policy applies to this user: `site` (the default — ordinary org/site scope decides reach) or `assigned` (reach is further narrowed to the locations their current staff operational assignments cover, resolved through their explicit user-to-person link at the fact''s service date). A MODE, never a grant: it narrows scope and never confers attendance.record. Placed here rather than in the permission catalog because permissions are additive and union across roles, so a narrowing permission would make adding a role reduce authority. One profile row per user per org means there is nothing to union.';
