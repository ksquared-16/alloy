-- =============================================================================
-- `authenticated` could write two Communications tables. Two different bugs.
-- =============================================================================
--
-- Found while certifying the observe-only Email ingress gate: both
-- `communication_provider_bindings` and `communication_ingress_routes` carried
-- INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER for `authenticated`, even though
-- the second one's migration grants nothing but SELECT. Only RLS stood between a
-- tenant JWT and rewriting the table that decides which organization owns inbound
-- mail — and a grant is the boundary; RLS is the filter inside it.
--
-- The two tables got there by DIFFERENT authorities, which is why fixing one shape
-- would have left the other:
--
--   communication_provider_bindings   EXPLICIT MIGRATION GRANT.
--       `20260430254100_communications_v1_foundation.sql:150`
--           GRANT ALL ON TABLE public.communication_provider_bindings TO authenticated;
--       (line 149 did the same for `anon`; `20260804180000_platform_anon_privilege_revocation.sql`
--        removed that one. `authenticated` was never in that migration's scope.)
--
--   communication_ingress_routes      DEFAULT ACL.
--       `20260329165048_remote_schema.sql:9771`
--           ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--               GRANT ALL ON TABLES TO authenticated;
--       Repository migrations run as `postgres`, so this fires at CREATE TABLE.
--       The 2026-08-17 migration then granted SELECT — and a GRANT never removes
--       anything, so `grant select` read like a restriction while adding nothing.
--
-- This is the same trap `20260804180000` recorded for `anon`: a default ACL is not
-- disabled by revoking one principal from it, and an explicit grant elsewhere is not
-- disabled by revoking the default. Both authorities have to be named, per role.
--
-- -----------------------------------------------------------------------------
-- WHAT THE RUNTIME ACTUALLY NEEDS — established by reading every caller
-- -----------------------------------------------------------------------------
--
-- Every code path that touches either table resolves its client through
-- `createAdminClient()` (service role): the four `/api/admin/communications/*` routes
-- that write bindings and ingress routes, and the Resend webhook, which passes its
-- admin client into `ingestResendInboundEmail`. No user-scoped client — no
-- `@supabase/ssr`, no browser client — reads or writes either table anywhere in the
-- application.
--
-- So the required principal set is exactly: the owner, and `service_role`.
-- `service_role` also holds BYPASSRLS, which is why its table grants are the whole of
-- its access and must be preserved precisely.
--
-- `authenticated` and `anon` are removed COMPLETELY, SELECT included. Leaving SELECT
-- would have been defensible — both tables carry an org-scoped SELECT policy — but
-- nothing exercises it, and a privilege kept "in case" is how the next audit finds the
-- same finding. The RLS SELECT policies are deliberately left in place: they are now
-- unreachable, and they are the safety net if a future surface re-grants SELECT, so
-- that re-granting cannot skip tenant scoping.
--
-- -----------------------------------------------------------------------------
-- REPLAY-SAFE
-- -----------------------------------------------------------------------------
--
-- REVOKE and GRANT are idempotent, the default-ACL changes are idempotent, and the
-- assertions describe an end state rather than a transition. Re-running is a no-op.
-- Replayed from empty in version order this runs last, so it cannot change how the
-- 341 tables created before it were provisioned.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FUTURE OBJECTS — so the next table does not silently reacquire this.
--
-- `authenticated` keeps SELECT in the default and loses every write privilege. That
-- line is deliberate: a silent READ grant is still contained by RLS, which denies by
-- default on an RLS-enabled table with no matching policy, whereas a silent WRITE
-- grant on a table whose author never considered writes is unbounded. Removing SELECT
-- from the default too would be defensible discipline, and is a platform decision
-- with a much wider blast radius than this repair — every future table would need an
-- explicit read grant or fail at runtime rather than at migration time.
--
-- `anon` and PUBLIC are re-asserted rather than assumed: `20260804180000` cleared
-- `anon`, and this migration must converge to a clean state even when replayed on a
-- database where that one has not run.
--
-- `supabase_admin` is attempted and its outcome reported rather than assumed — a
-- migration is not always a member of that role on hosted Supabase. The `postgres`
-- half is the load-bearing one and is asserted in section 3.
-- -----------------------------------------------------------------------------
do $future$
declare
    v_role text;
begin
    foreach v_role in array array['postgres', 'supabase_admin'] loop
        if not exists (select 1 from pg_roles where rolname = v_role) then
            raise notice 'default-ACL owner % does not exist here — skipped', v_role;
            continue;
        end if;
        begin
            execute format(
                'alter default privileges for role %I in schema public '
                || 'revoke insert, update, delete, truncate, references, trigger on tables from authenticated',
                v_role);
            -- MAINTAIN (PostgreSQL 17+) cannot be named unconditionally: on 16 and
            -- earlier the keyword does not parse, and a migration that fails to load on
            -- an older server is worse than one that leaves VACUUM reachable. It is the
            -- same class of miss that produced this finding — a privilege nobody thought
            -- to name — so it is handled explicitly rather than left to `revoke all`,
            -- which is unavailable here because SELECT must survive.
            if current_setting('server_version_num')::int >= 170000 then
                execute format(
                    'alter default privileges for role %I in schema public revoke maintain on tables from authenticated',
                    v_role);
            end if;
            execute format(
                'alter default privileges for role %I in schema public revoke all on tables from anon', v_role);
            execute format(
                'alter default privileges for role %I in schema public revoke all on tables from public', v_role);
            raise notice 'default table privileges for role % no longer grant writes to authenticated, or anything to anon/PUBLIC', v_role;
        exception when insufficient_privilege then
            raise notice 'insufficient privilege to alter default ACLs for role % — existing objects are still corrected below', v_role;
        end;
    end loop;
end
$future$;

-- -----------------------------------------------------------------------------
-- 2. EXISTING OBJECTS — the two tables.
--
-- PUBLIC first and separately. Revoking from PUBLIC does not remove a privilege
-- granted directly to a role, and revoking from a role does not remove one held via
-- PUBLIC; the prior credential-authority finding was exactly this confusion. Both are
-- stated, for both tables, so neither authority can survive the other's removal.
-- -----------------------------------------------------------------------------
revoke all on table public.communication_provider_bindings from public;
revoke all on table public.communication_provider_bindings from anon;
revoke all on table public.communication_provider_bindings from authenticated;

revoke all on table public.communication_ingress_routes from public;
revoke all on table public.communication_ingress_routes from anon;
revoke all on table public.communication_ingress_routes from authenticated;

-- Re-asserted, not assumed. The revokes above are broad by design, and the runtime's
-- only principal must be restored in the same statement block that removed everything
-- else — so a partial application cannot leave the tables unreachable by the service.
grant all on table public.communication_provider_bindings to service_role;
grant all on table public.communication_ingress_routes to service_role;

-- -----------------------------------------------------------------------------
-- 3. PROVE IT — against the real roles, not against this file's own text.
--
-- `has_table_privilege` resolves inherited privileges as well as direct ones, which is
-- the whole point: `authenticator` is NOINHERIT and reaches these roles by SET ROLE,
-- so asking the roles themselves is asking the question PostgREST will ask.
--
-- PUBLIC cannot be passed to `has_table_privilege`, so it is checked structurally —
-- an ACL entry with a zero grantee OID is the PUBLIC grant.
-- -----------------------------------------------------------------------------
do $verify$
declare
    v_table text;
    v_role text;
    v_priv text;
    v_public_grants int;
    v_missing text[] := array[]::text[];
begin
    foreach v_table in array array[
        'public.communication_provider_bindings',
        'public.communication_ingress_routes'
    ] loop
        -- (a) no tenant-facing role holds ANY privilege.
        foreach v_role in array array['anon', 'authenticated'] loop
            foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
                if has_table_privilege(v_role, v_table, v_priv) then
                    raise exception 'privilege repair failed: % still holds % on %', v_role, v_priv, v_table;
                end if;
            end loop;
        end loop;

        -- (a2) and structurally: ZERO ACL entries, whatever they might be named.
        --      The list above is portable across server versions, which means it cannot
        --      name privileges that only exist on some of them — PostgreSQL 17 adds
        --      MAINTAIN, and both tables were carrying it. Counting entries catches every
        --      privilege type, including ones invented after this migration was written.
        select count(*) into v_public_grants
        from pg_class c
        cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
        where c.oid = v_table::regclass
          and a.grantee <> 0
          and pg_get_userbyid(a.grantee) in ('anon', 'authenticated');
        if v_public_grants > 0 then
            raise exception 'privilege repair failed: % ACL entr(y/ies) remain for anon/authenticated on %', v_public_grants, v_table;
        end if;

        -- (b) nothing reaches them through PUBLIC either.
        select count(*) into v_public_grants
        from pg_class c
        cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
        where c.oid = v_table::regclass and a.grantee = 0;
        if v_public_grants > 0 then
            raise exception 'privilege repair failed: PUBLIC still holds % grant(s) on %', v_public_grants, v_table;
        end if;

        -- (c) the runtime principal keeps EXACTLY what it needs — proven positively,
        --     because a repair that silently locked out the service would pass every
        --     check above and break inbound mail.
        foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
            if not has_table_privilege('service_role', v_table, v_priv) then
                v_missing := v_missing || format('%s on %s', v_priv, v_table);
            end if;
        end loop;
    end loop;

    if array_length(v_missing, 1) is not null then
        raise exception 'privilege repair broke the runtime: service_role is missing %', array_to_string(v_missing, ', ');
    end if;

    -- (d) the source of the ingress-routes exposure is closed for future tables.
    --     Asserted only for `postgres`, the owner repository migrations actually run
    --     as; `supabase_admin` is best-effort by design (section 1).
    if exists (
        select 1
        from pg_default_acl d
        cross join lateral aclexplode(d.defaclacl) a
        where d.defaclnamespace = 'public'::regnamespace
          and d.defaclobjtype = 'r'
          and pg_get_userbyid(d.defaclrole) = 'postgres'
          and pg_get_userbyid(a.grantee) = 'authenticated'
          and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
    ) then
        raise exception 'default privileges for role postgres in schema public still grant writes to authenticated';
    end if;

    if exists (
        select 1
        from pg_default_acl d
        cross join lateral aclexplode(d.defaclacl) a
        where d.defaclnamespace = 'public'::regnamespace
          and d.defaclobjtype = 'r'
          and pg_get_userbyid(d.defaclrole) = 'postgres'
          and (a.grantee = 0 or pg_get_userbyid(a.grantee) = 'anon')
    ) then
        raise exception 'default privileges for role postgres in schema public still grant to anon or PUBLIC';
    end if;

    raise notice 'privilege repair verified: anon/authenticated/PUBLIC hold nothing on either table; service_role intact; postgres table defaults grant no writes to authenticated';
end
$verify$;

comment on table public.communication_ingress_routes is
    'Where inbound mail is delivered so Alloy can observe it, kept SEPARATE from the address families see and reply to. Transport metadata: never rendered outside administrator routing setup. Reachable only by the service role — every caller resolves through createAdminClient(), and anon/authenticated hold no privilege (see 20260818140000).';
