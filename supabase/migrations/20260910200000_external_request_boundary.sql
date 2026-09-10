-- Thread 5 Slice B.2 — the external request boundary.
--
-- B.1 proved a credential can become a tenant-bound principal. It deliberately
-- built no HTTP surface. This adds the three things a real external request path
-- needs and stops there: a short-lived token so the long-lived secret is not
-- replayed on every call, a limiter that is shared rather than per-instance, and
-- an activity log that is separate from the security audit.
--
-- ─── WHY THE TOKEN CARRIES NO AUTHORITY ───
--
-- The token row stores WHICH installation and WHICH credential, and nothing
-- about what they may do. Scopes and boundary are re-read from the installation
-- on every verification.
--
-- That is the whole reason Thread 4 chose opaque tokens over JWTs: a token
-- carrying a snapshot of its own authority is authority frozen at mint time, and
-- revoking it needs a denylist — which is a lookup, which is what an opaque
-- token already is. Re-deriving means every change (scope revoked, location
-- removed, installation suspended, application disabled, credential revoked)
-- takes effect on the NEXT request, with no cache to wait out and no snapshot to
-- go stale. Alloy has a specific reason to care: Thread 3 found
-- `invalidateAdminShellContextCache` has zero production call sites and a 120
-- second TTL, and exporting that staleness to partners would be worse.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Access tokens
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.app_access_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Lineage. Revoking either the credential or the installation is enough to
    -- kill this token, because verification re-checks both.
    credential_id uuid NOT NULL REFERENCES public.app_credentials(id) ON DELETE CASCADE,
    installation_id uuid NOT NULL REFERENCES public.app_installations(id) ON DELETE CASCADE,

    -- The presented token is never stored. Same lookup shape as every other
    -- credential in Alloy: hashed, and SELECTED BY, never compared in process.
    token_hash text NOT NULL,

    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- The verification path's only lookup.
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_access_tokens_hash
    ON public.app_access_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_app_access_tokens_credential
    ON public.app_access_tokens (credential_id) WHERE revoked_at IS NULL;

-- Expired rows are garbage, not history: the security audit already records that
-- a token was issued. This index makes the sweep cheap.
CREATE INDEX IF NOT EXISTS idx_app_access_tokens_expiry
    ON public.app_access_tokens (expires_at);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Shared rate-limit windows
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `kioskRateLimit` is per-process and in-memory, and says so honestly: "on
-- serverless this is per-instance, not global… a distributed limiter is a
-- platform capability." For a public API that caveat is disqualifying — a
-- per-instance budget multiplies by an instance count that RISES exactly when
-- load rises. This is that platform capability, kept as small as it can be.
--
-- Fixed window rather than a token bucket: it is trivially correct under
-- concurrency (one atomic upsert), and its one weakness — up to double rate
-- across a window boundary — is acceptable at these volumes and is stated rather
-- than discovered.
CREATE TABLE IF NOT EXISTS public.app_rate_limit_windows (
    -- NEVER a secret. Callers key on a hash of the client_id and/or the client
    -- IP, so this table cannot become a place credentials accumulate.
    bucket_key text NOT NULL,
    window_start timestamptz NOT NULL,
    request_count integer NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_app_rate_limit_windows_start
    ON public.app_rate_limit_windows (window_start);

-- Atomic consume-and-report. The increment and the decision happen in ONE
-- statement, so two instances racing the same bucket cannot both read "under the
-- limit" and both proceed — which is the exact failure a per-process limiter has
-- by construction.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
    p_bucket_key text,
    p_window_seconds integer,
    p_limit integer
) RETURNS TABLE (allowed boolean, current_count integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_window_start timestamptz;
    v_count integer;
BEGIN
    IF p_window_seconds <= 0 OR p_limit < 0 THEN
        RAISE EXCEPTION 'rate_limit_invalid_parameters';
    END IF;

    -- Truncate to the window. to_timestamp(floor(epoch / n) * n) gives every
    -- caller in the same window the same key without a separate clock.
    v_window_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

    INSERT INTO public.app_rate_limit_windows (bucket_key, window_start, request_count)
    VALUES (p_bucket_key, v_window_start, 1)
    ON CONFLICT (bucket_key, window_start)
    DO UPDATE SET request_count = public.app_rate_limit_windows.request_count + 1
    RETURNING request_count INTO v_count;

    RETURN QUERY SELECT (v_count <= p_limit), v_count, (v_window_start + make_interval(secs => p_window_seconds));
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

-- Windows older than a day are spent. Unbounded growth is the failure mode a
-- database-backed limiter has and an in-memory one does not, so the sweep ships
-- with the table rather than after the first incident.
CREATE OR REPLACE FUNCTION public.prune_rate_limit_windows(p_older_than interval DEFAULT interval '1 day')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted integer;
BEGIN
    DELETE FROM public.app_rate_limit_windows WHERE window_start < now() - p_older_than;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_rate_limit_windows(interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_rate_limit_windows(interval) FROM anon;
REVOKE ALL ON FUNCTION public.prune_rate_limit_windows(interval) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prune_rate_limit_windows(interval) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. API activity — high-volume, and NOT the security audit
-- ═════════════════════════════════════════════════════════════════════════════
--
-- B.1 separated these deliberately and B.2 keeps them apart. `app_security_audit`
-- answers "who was granted what, and when was it taken away" and must stay
-- readable during an incident. This answers "why is my integration failing", is
-- written on every request, and will always be the larger table by orders of
-- magnitude. Merging them would put request traffic in the table an investigator
-- needs.
CREATE TABLE IF NOT EXISTS public.app_api_activity (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at timestamptz NOT NULL DEFAULT now(),

    -- The one identifier a developer quotes to support.
    request_id text NOT NULL,

    -- Nullable: a request rejected before authentication resolves none of them.
    org_id uuid REFERENCES public.orgs(id) ON DELETE SET NULL,
    application_id uuid REFERENCES public.developer_applications(id) ON DELETE SET NULL,
    installation_id uuid REFERENCES public.app_installations(id) ON DELETE SET NULL,
    token_id uuid REFERENCES public.app_access_tokens(id) ON DELETE SET NULL,

    method text NOT NULL,
    -- NORMALIZED. The route template, never the concrete path: a path with ids
    -- in it is both unaggregatable and a place identifiers leak.
    route text NOT NULL,
    operation_id text,

    status_code integer NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('success', 'client_error', 'server_error', 'rate_limited')),
    error_code text,
    latency_ms integer
);

CREATE INDEX IF NOT EXISTS idx_app_api_activity_installation_time
    ON public.app_api_activity (installation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_api_activity_request
    ON public.app_api_activity (request_id);
CREATE INDEX IF NOT EXISTS idx_app_api_activity_org_time
    ON public.app_api_activity (org_id, occurred_at DESC);

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Row-level security
-- ═════════════════════════════════════════════════════════════════════════════
-- CREATE TABLE leaves an ALL default and a GRANT never removes anything.

ALTER TABLE public.app_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_access_tokens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_access_tokens FROM PUBLIC;
REVOKE ALL ON public.app_access_tokens FROM anon;
REVOKE ALL ON public.app_access_tokens FROM authenticated;
-- No policy at all. A live bearer token is the one thing in this schema that
-- grants access on sight; no operator session has a reason to read the table,
-- and `token_hash` must never be selectable by anything but the server.

ALTER TABLE public.app_rate_limit_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_rate_limit_windows FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_rate_limit_windows FROM PUBLIC;
REVOKE ALL ON public.app_rate_limit_windows FROM anon;
REVOKE ALL ON public.app_rate_limit_windows FROM authenticated;
-- No policy: counters are written only by the SECURITY DEFINER function above.

ALTER TABLE public.app_api_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_api_activity FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_api_activity FROM PUBLIC;
REVOKE ALL ON public.app_api_activity FROM anon;
REVOKE ALL ON public.app_api_activity FROM authenticated;

GRANT SELECT (
    id, occurred_at, request_id, org_id, application_id, installation_id,
    method, route, operation_id, status_code, outcome, error_code, latency_ms
) ON public.app_api_activity TO authenticated;

-- `token_id` is omitted from the grant above: it identifies a live bearer token,
-- and an activity feed is not a place to enumerate them.
DROP POLICY IF EXISTS app_api_activity_select_org ON public.app_api_activity;
CREATE POLICY app_api_activity_select_org ON public.app_api_activity
    FOR SELECT TO authenticated
    USING (org_id IS NOT NULL AND public.has_org_role(org_id, ARRAY['owner','admin']));

COMMENT ON TABLE public.app_access_tokens IS
    'Short-lived opaque bearer tokens. Carries lineage (credential, installation) and NO authority snapshot: scopes and boundary are re-read from the installation on every verification, so every revocation takes effect on the next request.';
COMMENT ON TABLE public.app_rate_limit_windows IS
    'Shared fixed-window rate-limit counters. Durable and cross-instance, because a per-process limiter on serverless multiplies the real budget by an unknowable instance count. Keys are never secrets.';
COMMENT ON TABLE public.app_api_activity IS
    'High-volume external API request log for developer observability. Deliberately separate from app_security_audit. Never stores Authorization headers, tokens, request or response bodies, or personal data.';
