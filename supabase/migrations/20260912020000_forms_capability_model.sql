-- FORMS STOPS BEING "WHOEVER IS CALLED admin".
--
-- Twenty-four Forms write handlers authorized on the literal `admin` role key, and one —
-- `confirm-linkage` — on `admin` OR `ops`. That is job-title authority: an organization could not
-- let a receptionist handle submissions without also calling them an administrator, and calling
-- someone an administrator granted them form DESIGN whether that was intended or not.
--
-- ── WHY THREE KEYS AND NOT TWO ──
--
-- The product already draws a line inside submission handling, and the docstrings say so.
-- `confirm-linkage` is "operator confirms auto-linked CRM rows are correct (payload.meta only; no
-- CRM mutation)" and `ops` may call it. `manual-link` "set[s] CRM FKs on a submitted row from
-- operator-selected UUIDs" and `ops` may not. Acknowledging a linkage the system proposed and
-- setting one by hand are different authorities, and today's roles are already separated by exactly
-- that difference.
--
-- One `forms.submissions` key cannot hold both halves. Granting it to `ops` to preserve
-- `confirm-linkage` would also hand them manual linkage, document generation, form sending and
-- submission-on-behalf — seven record- and customer-affecting operations in place of one
-- metadata-only acknowledgement. Preserving behaviour is the point of a compatibility migration, so
-- the narrow authority gets its own key rather than being rounded up into the broad one.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ──
--
-- No `forms.read`. The ordinary Forms GET handlers are open to any admitted portal member today,
-- and adding a read capability would REMOVE access people currently have. That is a product
-- decision, not a cleanup, and it is deliberately not taken here.
--
-- No job titles. `school_director` and `regional_lead` gain nothing; they have no Forms authority
-- today and inventing some would be exactly the package design this program concluded it does not
-- need. Every grant below exists only to keep a role doing what it already did.

DO $guard$
BEGIN
    IF to_regclass('public.permission_definitions') IS NULL THEN
        RAISE EXCEPTION 'FORMS ABORT: public.permission_definitions is absent.';
    END IF;
    IF to_regclass('public.role_permission_grants') IS NULL THEN
        RAISE EXCEPTION 'FORMS ABORT: public.role_permission_grants is absent.';
    END IF;
END
$guard$;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE CAPABILITIES.
--
-- Each final segment — `author`, `submissions`, `confirm` — is one the permission grid does not
-- recognise as a read/write verb, so each becomes its OWN row in the role editor rather than
-- folding into a shared radio. That is the catalog's existing doctrine and it is wanted here:
-- there is no implication between these keys, and a single operator gesture must not hand out a
-- second, stronger authority by accident.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permission_definitions (key, group_key, label, description, is_active)
VALUES
    ('forms.author', 'forms', 'Author forms',
     'Create, edit, version, publish and archive forms, packets and their public links.', true),
    ('forms.submissions', 'forms', 'Handle submissions',
     'Send forms, submit and link submissions, and generate documents from them.', true),
    ('forms.submissions.confirm', 'forms', 'Confirm automatic linkage',
     'Confirm that a submission was matched to the right record. Does not change the match itself.', true)
ON CONFLICT (key) DO UPDATE
    SET group_key = EXCLUDED.group_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMPATIBILITY GRANTS — preserve exactly what each role could already do.
--
-- Selected FROM `permission_definitions`, which is both the validation the catalog FK requires and
-- the reason this cannot grant a key that does not exist. `ON CONFLICT DO NOTHING` makes it
-- idempotent AND preserves organization customization: a row an administrator has already edited —
-- including one deliberately set to `allowed = false` — is left exactly as they left it. No
-- delete-and-reinsert, which is how earlier grant migrations erased deliberate revocations.
-- ─────────────────────────────────────────────────────────────────────────────

-- `admin` could perform every Forms write, so it receives all three.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, pd.key, true
FROM public.role_definitions rd
JOIN public.permission_definitions pd
  ON pd.key IN ('forms.author', 'forms.submissions', 'forms.submissions.confirm')
WHERE rd.role_key = 'admin'
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- `ops` could perform exactly ONE Forms write — confirming an automatic linkage — so it receives
-- exactly that. Widening it here would be the broadening this key exists to avoid.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, pd.key, true
FROM public.role_definitions rd
JOIN public.permission_definitions pd
  ON pd.key = 'forms.submissions.confirm'
WHERE rd.role_key = 'ops'
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SELF-TEST — the migration proves its own compatibility claim before it lands.
-- ─────────────────────────────────────────────────────────────────────────────
DO $selftest$
DECLARE
    v_missing   integer;
    v_admin_org uuid;
    v_admin_n   integer;
    v_ops_n     integer;
    v_ops_broad integer;
    v_titles    integer;
BEGIN
    SELECT count(*) INTO v_missing
    FROM (VALUES ('forms.author'), ('forms.submissions'), ('forms.submissions.confirm')) AS k(key)
    WHERE NOT EXISTS (SELECT 1 FROM public.permission_definitions pd WHERE pd.key = k.key AND pd.is_active);
    IF v_missing > 0 THEN
        RAISE EXCEPTION 'FORMS ABORT: % capability definition(s) missing after insert.', v_missing;
    END IF;

    SELECT rd.org_id INTO v_admin_org FROM public.role_definitions rd WHERE rd.role_key = 'admin' LIMIT 1;
    IF v_admin_org IS NOT NULL THEN
        SELECT count(*) INTO v_admin_n FROM public.role_permission_grants g
         WHERE g.org_id = v_admin_org AND g.role_key = 'admin' AND g.permission_key LIKE 'forms.%' AND g.allowed;
        IF v_admin_n <> 3 THEN
            RAISE EXCEPTION 'FORMS ABORT: admin holds % Forms capabilities, expected 3.', v_admin_n;
        END IF;

        IF EXISTS (SELECT 1 FROM public.role_definitions WHERE org_id = v_admin_org AND role_key = 'ops') THEN
            SELECT count(*) INTO v_ops_n FROM public.role_permission_grants g
             WHERE g.org_id = v_admin_org AND g.role_key = 'ops' AND g.permission_key = 'forms.submissions.confirm' AND g.allowed;
            SELECT count(*) INTO v_ops_broad FROM public.role_permission_grants g
             WHERE g.org_id = v_admin_org AND g.role_key = 'ops'
               AND g.permission_key IN ('forms.author', 'forms.submissions') AND g.allowed;
            IF v_ops_n <> 1 THEN
                RAISE EXCEPTION 'FORMS ABORT: ops lost its confirm authority (found %).', v_ops_n;
            END IF;
            IF v_ops_broad <> 0 THEN
                RAISE EXCEPTION 'FORMS ABORT: ops was broadened to % additional Forms capabilities.', v_ops_broad;
            END IF;
        END IF;
    END IF;

    -- No job title acquired Forms authority from this migration.
    SELECT count(*) INTO v_titles FROM public.role_permission_grants g
     WHERE g.role_key IN ('school_director', 'regional_lead') AND g.permission_key LIKE 'forms.%' AND g.allowed;
    IF v_titles > 0 THEN
        RAISE EXCEPTION 'FORMS ABORT: % job-title grant(s) were created; this migration preserves behaviour only.', v_titles;
    END IF;

    RAISE NOTICE 'FORMS: three capabilities defined; admin keeps every write, ops keeps exactly its confirmation.';
END
$selftest$;
