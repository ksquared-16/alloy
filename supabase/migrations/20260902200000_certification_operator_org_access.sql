-- Grant the certification operator access to the certification org, once their account exists.
--
-- WHY THIS IS A MIGRATION AND NOT A SCRIPT. Writing to the deployed database is a Director-owned
-- capability, and `database.apply_migration` is the only write this lane can request. So an
-- operational grant has to travel as a migration. It is written to behave itself accordingly.
--
-- WHY IT EXISTS AT ALL. Hands-on QA of Enrollment requires signing in at the lane's local server,
-- which authenticates against the hosted certification project. The operator's address had no
-- account there -- the password was correct for a different environment -- so a correct password was
-- rejected. The account itself must be created by a human in the provider's own console: no governed
-- action can mint one, and the managed QA identities are deliberately non-human accounts whose
-- passwords nobody holds. This migration supplies only the half that follows: the org membership,
-- without which a successful sign-in lands on /unauthorized and looks like a second failure.
--
-- WHY IT IS SAFE EVERYWHERE ELSE. It resolves the account BY E-MAIL and does nothing at all if that
-- account is absent, so in every environment that has never heard of this address it is a no-op. It
-- targets one named org and no other. It is idempotent -- ON CONFLICT DO NOTHING against
-- (user_id, org_id, role) -- so re-running grants nothing twice. It creates no account, sets no
-- password, and contains no credential.

DO $$
DECLARE
    v_org_id  uuid := '93667019-bd28-49b5-a688-acc9bb1e0a19';
    v_email   text := 'kelly@kurzmancapital.com';
    v_user_id uuid;
BEGIN
    -- The org must exist here, or this is not the certification project and there is nothing to do.
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = v_org_id) THEN
        RAISE NOTICE 'certification org not present — skipping operator grant';
        RETURN;
    END IF;

    SELECT id INTO v_user_id
    FROM auth.users
    WHERE lower(email) = lower(v_email)
    ORDER BY created_at
    LIMIT 1;

    IF v_user_id IS NULL THEN
        -- Expected until the account is created in the provider console. Not an error: this
        -- migration must be applyable before and after, and say which it was.
        RAISE NOTICE 'operator account not present in this project — no grant made';
        RETURN;
    END IF;

    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (v_user_id, v_org_id, 'admin')
    ON CONFLICT (user_id, org_id, role) DO NOTHING;

    RAISE NOTICE 'operator granted admin on the certification org';
END
$$;
