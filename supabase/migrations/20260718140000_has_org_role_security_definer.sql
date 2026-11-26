-- Break user_roles ↔ has_org_role RLS recursion: membership lookup must not re-enter
-- user_roles policies when other tables evaluate has_org_role() as authenticated.

CREATE OR REPLACE FUNCTION public.has_org_role(_org_id uuid, _roles text[])
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.org_id = _org_id
          AND ur.role = ANY(_roles)
    );
$$;

REVOKE ALL ON FUNCTION public.has_org_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, text[]) TO anon, authenticated, service_role;
