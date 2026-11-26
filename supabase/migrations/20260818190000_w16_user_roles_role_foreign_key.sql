-- W-16 / M9 — `user_roles.role` becomes a constrained reference, not free text.
--
-- `03-implementation-qa-sequence.md` §9, W-16 (`I-8`, closes `C2`). Governance already CLAIMS this
-- foreign key exists (`docs/platform/governance/roles-and-permissions.md`), and it does not: the
-- constraint lives in one application write path. This makes the claim true.
--
-- `02…§8`'s `M2-2` states the asymmetry precisely — *"redundancy beside an absence"*:
--   `role_permission_grants` carried TWO identical foreign keys onto `role_definitions`;
--   `user_roles.role`                carried NONE.
-- The redundancy half is already closed by `M21`
-- (`20260818130000_w61_role_key_fk_restrict_no_cascade.sql`), which collapsed the duplicate pair to
-- one `ON DELETE RESTRICT`. This migration closes the absence half. Together they are `M15`.
--
-- Baseline evidence, verified this pass: `user_roles` constrains `org_id` and `user_id` only
-- (`20260329165048_remote_schema.sql:6618,6623`). `role` is unconstrained text.
--
-- **W-0 Q3 returned 0** — no `user_roles` row named an undefined role — which is what unblocked this
-- workstream and struck `M8`'s remediation from the register. The plan attaches two cautions to that
-- result and BOTH are honoured below:
--
--   1. Q3 deliberately ignores `role_definitions.is_active`, because a foreign key does. The
--      preflight therefore matches on `(org_id, role_key)` ALONE and never on `is_active` — using
--      Q5's form here would abort on rows a foreign key would happily accept.
--   2. `user_roles.role` stays unconstrained until this lands, so a violating row can appear between
--      the census and the migration. The plan is explicit: **re-run Q3 as the preflight rather than
--      citing this result.** §0 below is that re-run, executed at apply time, failing closed.
--
-- **Lockout class `L3`.** A row this constraint rejects is a membership that would fail to insert
-- after apply. The preflight converts that from a silent future write failure into a refusal to
-- migrate, naming the offending pairs.
--
-- ON DELETE RESTRICT, matching `M21` on the neighbouring table: deleting a role definition that
-- still has members is refused, not cascaded. Nothing in the product deletes a `role_definitions`
-- row — retirement is `is_active = false` — so this constrains no working path.
--
-- NOT APPLIED BY THIS COMMIT. Authored only; the apply channel is OD-1 and remains the operator's.

-- ---------------------------------------------------------------------------
-- 0. W-0 Q3, re-run at apply time. Fail closed before adding the constraint.
--
--    Matches Q3's form exactly: existence of a `role_definitions` row for the pair, with NO
--    `is_active` predicate. A foreign key does not read `is_active`, and neither does this.
-- ---------------------------------------------------------------------------

DO $preflight$
DECLARE
    undefined_rows bigint;
    sample text;
BEGIN
    SELECT count(*) INTO undefined_rows
    FROM public.user_roles AS ur
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.role_definitions AS rd
        WHERE rd.org_id = ur.org_id
          AND rd.role_key = ur.role
    );

    IF undefined_rows > 0 THEN
        SELECT string_agg(DISTINCT format('(%s, %L)', ur.org_id, ur.role), ', ')
        INTO sample
        FROM public.user_roles AS ur
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.role_definitions AS rd
            WHERE rd.org_id = ur.org_id
              AND rd.role_key = ur.role
        );

        RAISE EXCEPTION
            'W-16/M9 aborted: % user_roles row(s) name a role with no role_definitions row. W-0 Q3 returned 0 when it was asked; this is the re-run the plan requires, and it disagrees. Offending (org_id, role): %. Seed the definitions or correct the rows, then re-run.',
            undefined_rows, sample;
    END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. The constraint governance already claims exists.
--
--    Guarded so a clean replay reaches the same state — Phase 0 was not idempotent and its re-run
--    failed on an unguarded constraint ADD.
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_roles
    DROP CONSTRAINT IF EXISTS user_roles_role_definitions_fkey;

ALTER TABLE public.user_roles
    ADD CONSTRAINT user_roles_role_definitions_fkey
    FOREIGN KEY (org_id, role)
    REFERENCES public.role_definitions (org_id, role_key)
    ON DELETE RESTRICT;

COMMENT ON CONSTRAINT user_roles_role_definitions_fkey ON public.user_roles IS
    'W-16/M9: membership names a DEFINED role. Closes C2 and the absence half of M2-2 (M21 closed the redundancy half). ON DELETE RESTRICT — a role definition with members cannot be deleted out from under them; retire it with is_active = false.';
