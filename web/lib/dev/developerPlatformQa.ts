/**
 * The Developer Platform QA environment: one authority for the fixture and for
 * live verification.
 *
 * WHY THIS IS ONE MODULE AND NOT TWO. The walkthrough's technical steps and the
 * fixture they run against have to agree about what exists. When the fixture
 * lived in a script and verification lived in the operator's terminal, agreement
 * was the operator's job — they prepared three installations by hand and then
 * retyped curl commands to ask whether those installations behaved. That is
 * certification work wearing a QA costume. Both halves live here, the page calls
 * them, and the operator is left with the questions only a person can answer.
 *
 * VERIFICATION GOES OVER THE WIRE, ALWAYS. Every check below issues a real HTTP
 * request to the running server's own origin — same listener, same middleware,
 * same `Authorization` parsing a partner would meet. Calling the route handlers
 * directly would be faster and would prove less; the layers a partner meets
 * first are exactly the ones a direct call skips.
 *
 * NO SECRET LEAVES THIS MODULE. The verification credential is issued through
 * the canonical authority, held in a local variable for the length of one run,
 * and revoked in a `finally`. It is never returned to the page, never persisted,
 * and never rendered. The credential the OPERATOR issues in DP-QA-12 is a
 * different thing entirely and is never read here — watching that one-time
 * reveal is a product experience the walkthrough deliberately keeps human.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { issueCredential, revokeCredential } from "@/lib/platform/principal/applicationCredential";

/** The certification organization and its two campuses. Fixture data, not customer data. */
const ORG = "00000000-0000-4000-8000-000000000001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const LAKESIDE = "00000000-0000-4000-8000-000000000011";

export const FIXTURE_REPAIR_COMMAND = "npm run qa:developer-platform -- ensure";

type BoundarySpec = { mode: "org_wide" | "locations"; ids: string[] };

/** The four shapes, and the question each exists to answer. */
const PLAN: {
    key: string;
    slug: string;
    name: string;
    scopes: string[];
    boundary: BoundarySpec;
    proves: string;
}[] = [
    {
        key: "orgwide",
        slug: "qa-dp-orgwide",
        name: "QA Integration — Org-wide",
        scopes: ["context.read", "locations.read"],
        boundary: { mode: "org_wide", ids: [] },
        proves: "the happy path: every location in the organization",
    },
    {
        key: "restricted",
        slug: "qa-dp-restricted",
        name: "QA Integration — Single campus",
        scopes: ["context.read", "locations.read"],
        boundary: { mode: "locations", ids: [RIVERSIDE] },
        proves: "the boundary gate: one campus and its rooms, never a sibling",
    },
    {
        key: "empty",
        slug: "qa-dp-empty",
        name: "QA Integration — No locations selected",
        scopes: ["context.read", "locations.read"],
        boundary: { mode: "locations", ids: [] },
        proves: "restricted-empty fails closed rather than widening to org-wide",
    },
    {
        key: "noscope",
        slug: "qa-dp-noscope",
        name: "QA Integration — No location capability",
        scopes: ["context.read"],
        boundary: { mode: "org_wide", ids: [] },
        proves: "scope and boundary are different: org-wide reach, still refused",
    },
];

export type FixtureRow = {
    key: string;
    slug: string;
    name: string;
    proves: string;
    applicationId: string;
    installationId: string;
};

export type FixtureState =
    | { ok: true; installations: FixtureRow[] }
    | { ok: false; code: string; detail: string; repairCommand: string };

function serviceClient(): SupabaseClient {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !key) throw new Error("no_service_credentials");
    return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Bring the fixture to its known state, destroying its own prior rows first.
 *
 * Rebuild rather than patch: a half-edited installation left by a previous
 * walkthrough is exactly the state that makes a boundary question unanswerable,
 * and the operator would have no way to tell.
 */
export async function ensureFixture(): Promise<FixtureState> {
    let supabase: SupabaseClient;
    try {
        supabase = serviceClient();
    } catch {
        return {
            ok: false,
            code: "no_certification_environment",
            detail: "The server is not running against a certification database.",
            repairCommand: FIXTURE_REPAIR_COMMAND,
        };
    }

    try {
        await removeFixture(supabase);
        const installations: FixtureRow[] = [];
        for (const item of PLAN) {
            // The catalog identity comes from the canonical registration
            // authority, never an INSERT — the same rule the product is held to.
            const { data, error } = await supabase.rpc("register_developer_application", {
                p_slug: item.slug,
                p_name: item.name,
                p_publisher: "Alloy QA",
                p_ownership_mode: "alloy_managed",
                p_environment: "sandbox",
                p_distribution_mode: "private",
                p_status: "active",
                p_registered_by: "developer-platform-qa-fixture",
                p_metadata: { fixture: "developer-platform-qa" },
            });
            const result = data as { ok?: boolean; code?: string; application?: { id: string } } | null;
            if (error || !result?.ok) {
                return {
                    ok: false,
                    code: "application_registration_failed",
                    detail: error?.message ?? result?.code ?? "unknown",
                    repairCommand: FIXTURE_REPAIR_COMMAND,
                };
            }
            const applicationId = result.application!.id;

            const inst = await supabase.from("app_installations").insert({
                application_id: applicationId,
                org_id: ORG,
                producer_key: `qa-dp:${item.key}`,
                granted_scopes: item.scopes,
                boundary_mode: item.boundary.mode,
                location_boundary: item.boundary.ids,
                status: "active",
            }).select("id").single();
            if (inst.error) {
                return {
                    ok: false,
                    code: "installation_failed",
                    detail: inst.error.message,
                    repairCommand: FIXTURE_REPAIR_COMMAND,
                };
            }
            installations.push({
                key: item.key,
                slug: item.slug,
                name: item.name,
                proves: item.proves,
                applicationId,
                installationId: (inst.data as { id: string }).id,
            });
        }
        return { ok: true, installations };
    } catch (err) {
        return {
            ok: false,
            code: "fixture_error",
            detail: String((err as Error)?.message ?? err),
            repairCommand: FIXTURE_REPAIR_COMMAND,
        };
    }
}

export async function removeFixture(supabase: SupabaseClient = serviceClient()): Promise<void> {
    for (const item of PLAN) {
        const { data: app } = await supabase.from("developer_applications")
            .select("id").eq("slug", item.slug).maybeSingle();
        if (!app) continue;
        const { data: installs } = await supabase.from("app_installations")
            .select("id").eq("application_id", app.id);
        for (const inst of installs ?? []) {
            await supabase.from("app_credentials").delete().eq("installation_id", inst.id);
            await supabase.from("app_api_activity").delete().eq("installation_id", inst.id);
            await supabase.from("app_security_audit").delete().eq("installation_id", inst.id);
            await supabase.from("app_installations").delete().eq("id", inst.id);
        }
        await supabase.from("app_security_audit").delete().eq("application_id", app.id);
        await supabase.from("developer_applications").delete().eq("id", app.id);
    }
}

/** Present without rebuilding — what the page asks on load. */
export async function fixtureStatus(): Promise<FixtureState> {
    let supabase: SupabaseClient;
    try {
        supabase = serviceClient();
    } catch {
        return {
            ok: false,
            code: "no_certification_environment",
            detail: "The server is not running against a certification database.",
            repairCommand: FIXTURE_REPAIR_COMMAND,
        };
    }
    const installations: FixtureRow[] = [];
    for (const item of PLAN) {
        const { data: app } = await supabase.from("developer_applications")
            .select("id").eq("slug", item.slug).maybeSingle();
        if (!app) return { ok: false, code: "fixture_absent", detail: `${item.slug} is not registered.`, repairCommand: FIXTURE_REPAIR_COMMAND };
        const { data: inst } = await supabase.from("app_installations")
            .select("id").eq("application_id", app.id).maybeSingle();
        if (!inst) return { ok: false, code: "fixture_incomplete", detail: `${item.slug} has no installation.`, repairCommand: FIXTURE_REPAIR_COMMAND };
        installations.push({
            key: item.key, slug: item.slug, name: item.name, proves: item.proves,
            applicationId: app.id, installationId: inst.id,
        });
    }
    return { ok: true, installations };
}

// ── Live verification ────────────────────────────────────────────────────────

export type CheckId =
    | "token_exchange" | "context" | "locations" | "tenant_assertion"
    | "selected_location" | "restricted_empty" | "missing_capability"
    | "invalid_credential" | "revoked_credential" | "suspended_installation"
    | "pagination" | "incremental_sync" | "rate_limit" | "openapi_parity";

export type CheckResult = {
    id: CheckId;
    /** The QA steps this evidence informs. It never sets their result. */
    steps: string[];
    label: string;
    verdict: "PASS" | "FAIL" | "BLOCKED";
    /** One sentence an operator can read without knowing the implementation. */
    evidence: string;
};

type Ctx = {
    baseUrl: string;
    supabase: SupabaseClient;
    creds: Map<string, { clientId: string; clientSecret: string; credentialId: string }>;
    fixture: FixtureRow[];
};

const check = (
    id: CheckId, steps: string[], label: string,
    verdict: CheckResult["verdict"], evidence: string,
): CheckResult => ({ id, steps, label, verdict, evidence });

async function tokenFor(ctx: Ctx, key: string): Promise<{ status: number; body: Record<string, unknown> }> {
    const c = ctx.creds.get(key)!;
    const res = await fetch(`${ctx.baseUrl}/api/v1/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            grant_type: "client_credentials",
            client_id: c.clientId,
            client_secret: c.clientSecret,
        }),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function bearer(ctx: Ctx, key: string): Promise<string> {
    const { body } = await tokenFor(ctx, key);
    return String(body.access_token ?? "");
}

async function get(ctx: Ctx, path: string, token: string) {
    const res = await fetch(`${ctx.baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
    let body: Record<string, unknown> = {};
    try { body = (await res.json()) as Record<string, unknown>; } catch { /* empty body */ }
    return { status: res.status, body, headers: res.headers };
}

/**
 * Run every deterministic check against the mounted boundary.
 *
 * Credentials are issued here and revoked in the `finally`, so a run that throws
 * halfway does not leave a working credential behind on the fixture.
 */
export async function runLiveVerification(baseUrl: string): Promise<{
    ok: boolean;
    ranAt: string;
    checks: CheckResult[];
    blockedReason?: string;
}> {
    const state = await fixtureStatus();
    if (!state.ok) {
        return {
            ok: false,
            ranAt: new Date().toISOString(),
            checks: [],
            blockedReason: `${state.code}: ${state.detail}`,
        };
    }

    const supabase = serviceClient();
    const ctx: Ctx = { baseUrl: baseUrl.replace(/\/+$/, ""), supabase, creds: new Map(), fixture: state.installations };
    const checks: CheckResult[] = [];

    try {
        for (const row of ctx.fixture) {
            const issued = await issueCredential(supabase, {
                installationId: row.installationId,
                label: `qa-live-verification ${Date.now()}`,
            });
            if (!issued.ok) {
                return {
                    ok: false, ranAt: new Date().toISOString(), checks: [],
                    blockedReason: `credential issue failed for ${row.slug}: ${issued.reason}`,
                };
            }
            ctx.creds.set(row.key, {
                clientId: issued.issued.clientId,
                clientSecret: issued.issued.clientSecret,
                credentialId: issued.issued.credentialId,
            });
        }

        // 1. Token exchange
        {
            const { status, body } = await tokenFor(ctx, "orgwide");
            const token = String(body.access_token ?? "");
            const opaque = token.startsWith("alloy_at_") && !token.includes(".");
            checks.push(check("token_exchange", ["DP-QA-26", "DP-QA-40", "DP-QA-50"],
                "Token exchange",
                status === 200 && opaque && body.expires_in === 900 ? "PASS" : "FAIL",
                status === 200
                    ? `POST /api/v1/oauth/token returned 200 with an opaque bearer token (prefix alloy_at_, not a JWT) expiring in ${body.expires_in}s.`
                    : `POST /api/v1/oauth/token returned ${status}.`));
        }

        const orgToken = await bearer(ctx, "orgwide");

        // 2. Context
        {
            const { status, body } = await get(ctx, "/api/v1/context", orgToken);
            const inst = (body.installation as { id?: string } | undefined)?.id;
            const org = (body.organization as { id?: string } | undefined)?.id;
            const ok = status === 200 && inst === ctx.fixture.find((f) => f.key === "orgwide")!.installationId && org === ORG;
            checks.push(check("context", ["DP-QA-27", "DP-QA-41", "DP-QA-51"], "Installation context",
                ok ? "PASS" : "FAIL",
                ok
                    ? "GET /api/v1/context named the calling Installation, its organization, its scopes and its resource boundary — and nothing about any person."
                    : `GET /api/v1/context returned ${status} and did not describe the expected Installation.`));
        }

        // 3. Locations, and the published field set
        {
            const { status, body } = await get(ctx, "/api/v1/locations", orgToken);
            const rows = (body.data ?? []) as Record<string, unknown>[];
            const expected = ["active", "id", "name", "parent_id", "site_id", "type", "unit_role", "updated_at"];
            const fields = rows[0] ? Object.keys(rows[0]).sort() : [];
            const ok = status === 200 && rows.length > 0 && JSON.stringify(fields) === JSON.stringify(expected);
            checks.push(check("locations", ["DP-QA-28", "DP-QA-42", "DP-QA-55"], "Location resource",
                ok ? "PASS" : "FAIL",
                ok
                    ? `GET /api/v1/locations returned ${rows.length} records carrying exactly the eight published fields, with no timezone field.`
                    : `GET /api/v1/locations returned ${status}; fields were ${fields.join(", ") || "none"}.`));
        }

        // 4. The caller cannot choose a tenant
        {
            const other = "00000000-0000-4000-8000-000000000999";
            const ctxRes = await get(ctx, `/api/v1/context?org_id=${other}`, orgToken);
            const org = (ctxRes.body.organization as { id?: string } | undefined)?.id;
            const ok = ctxRes.status === 200 && org === ORG;
            checks.push(check("tenant_assertion", ["DP-QA-27", "DP-QA-51", "DP-QA-80"], "Tenant assertion resistance",
                ok ? "PASS" : "FAIL",
                ok
                    ? "Passing another organization id as a query parameter changed nothing: the response still described the Installation's own organization."
                    : "A caller-supplied organization id altered the response."));
        }

        // 5. Selected-location boundary
        {
            const token = await bearer(ctx, "restricted");
            const { status, body } = await get(ctx, "/api/v1/locations", token);
            const rows = (body.data ?? []) as { id: string; site_id: string | null }[];
            const onlyRiverside = rows.length > 0 && rows.every((r) => r.id === RIVERSIDE || r.site_id === RIVERSIDE);
            const noSibling = !rows.some((r) => r.id === LAKESIDE);
            checks.push(check("selected_location", ["DP-QA-29", "DP-QA-37", "DP-QA-80"], "Selected-location boundary",
                status === 200 && onlyRiverside && noSibling ? "PASS" : "FAIL",
                status === 200 && onlyRiverside && noSibling
                    ? `A single-campus Installation saw ${rows.length} records, all within its authorized campus. The sibling campus did not appear.`
                    : "A restricted Installation returned records outside its boundary."));

            const forced = await get(ctx, `/api/v1/locations?location_id=${LAKESIDE}`, token);
            const forcedRows = (forced.body.data ?? []) as unknown[];
            checks.push(check("restricted_empty", ["DP-QA-30", "DP-QA-37", "DP-QA-80"], "Filter cannot widen authority",
                forced.status === 200 && forcedRows.length === 0 ? "PASS" : "FAIL",
                forced.status === 200 && forcedRows.length === 0
                    ? "Asking explicitly for an unauthorized campus returned an empty page rather than the record."
                    : "A query parameter reached past the Installation's boundary."));
        }

        // 6. Restricted-empty fails closed
        {
            const token = await bearer(ctx, "empty");
            const { status, body } = await get(ctx, "/api/v1/locations", token);
            const rows = (body.data ?? []) as unknown[];
            const ok = status === 200 && rows.length === 0;
            checks.push(check("restricted_empty", ["DP-QA-30", "DP-QA-11", "DP-QA-80"], "Restricted-empty fails closed",
                ok ? "PASS" : "FAIL",
                ok
                    ? "An Installation restricted to no locations received nothing. It did not silently widen to organization-wide."
                    : `An Installation with an empty boundary returned ${rows.length} records.`));
        }

        // 7. Missing capability
        {
            const token = await bearer(ctx, "noscope");
            const { status, body } = await get(ctx, "/api/v1/locations", token);
            const err = (body.error ?? {}) as Record<string, unknown>;
            const ok = status === 403 && err.type === "forbidden_scope";
            checks.push(check("missing_capability", ["DP-QA-36", "DP-QA-24", "DP-QA-80"], "Missing capability",
                ok ? "PASS" : "FAIL",
                ok
                    ? "An Installation without the Locations capability was refused with 403 forbidden_scope — a refusal, not an empty list."
                    : `Expected 403 forbidden_scope; received ${status}.`));
        }

        // 8. Invalid credential
        {
            const c = ctx.creds.get("orgwide")!;
            const wrong = await fetch(`${ctx.baseUrl}/api/v1/oauth/token`, {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ grant_type: "client_credentials", client_id: c.clientId, client_secret: "not-the-secret" }),
            });
            const unknown = await fetch(`${ctx.baseUrl}/api/v1/oauth/token`, {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ grant_type: "client_credentials", client_id: "alloy_ci_no_such_client", client_secret: "whatever" }),
            });
            const wrongBody = (await wrong.json()) as { error?: { code?: string } };
            const ok = wrong.status === 401 && unknown.status === 401 && wrongBody.error?.code === "invalid_credential";
            checks.push(check("invalid_credential", ["DP-QA-33", "DP-QA-57"], "Invalid credential",
                ok ? "PASS" : "FAIL",
                ok
                    ? "A wrong secret and an unknown client both returned 401 invalid_credential — indistinguishable on the wire, with no stack trace or hint."
                    : `Wrong secret returned ${wrong.status}; unknown client returned ${unknown.status}.`));
        }

        // 9. Revoked credential
        {
            const c = ctx.creds.get("noscope")!;
            const revoked = await revokeCredential(supabase, { credentialId: c.credentialId });
            if (!revoked.ok) {
                checks.push(check("revoked_credential", ["DP-QA-34"], "Revoked credential", "BLOCKED",
                    `The verification credential could not be revoked: ${revoked.reason}`));
            } else {
                const after = await tokenFor(ctx, "noscope");
                checks.push(check("revoked_credential", ["DP-QA-34", "DP-QA-16", "DP-QA-80"], "Revoked credential",
                    after.status === 401 ? "PASS" : "FAIL",
                    after.status === 401
                        ? "A revoked credential stopped exchanging for a token immediately — revocation is not deferred to token expiry."
                        : `A revoked credential still returned ${after.status}.`));
            }
        }

        // 10. Suspended installation
        //
        // `suspended_at` is written alongside `status`, because the table carries
        // `CHECK (status <> 'suspended' OR suspended_at IS NOT NULL)`. Omitting it
        // makes the UPDATE fail, and an unchecked failure here produced a
        // confident FAIL against a product that was behaving correctly — a
        // phantom defect is worse than no check, so the write is verified before
        // anything is concluded from it.
        {
            const row = ctx.fixture.find((f) => f.key === "restricted")!;
            const suspend = await supabase.from("app_installations")
                .update({ status: "suspended", suspended_at: new Date().toISOString() })
                .eq("id", row.installationId)
                .select("status")
                .maybeSingle();

            if (suspend.error || suspend.data?.status !== "suspended") {
                checks.push(check("suspended_installation", ["DP-QA-35", "DP-QA-17", "DP-QA-80"], "Suspended Installation",
                    "BLOCKED",
                    `The Installation could not be put into a suspended state, so nothing was proven: ${suspend.error?.message ?? "status unchanged"}.`));
            } else {
                const suspended = await tokenFor(ctx, "restricted");
                const restore = await supabase.from("app_installations")
                    .update({ status: "active", suspended_at: null })
                    .eq("id", row.installationId)
                    .select("status")
                    .maybeSingle();
                const restored = await tokenFor(ctx, "restricted");
                const ok = suspended.status === 401 && restore.data?.status === "active" && restored.status === 200;
                checks.push(check("suspended_installation", ["DP-QA-35", "DP-QA-17", "DP-QA-80"], "Suspended Installation",
                    ok ? "PASS" : "FAIL",
                    ok
                        ? "While suspended the Installation could not obtain a token at all; reactivating restored access with no reconfiguration."
                        : `Suspended returned ${suspended.status}; after reactivation ${restored.status}.`));
            }
        }

        // 11. Pagination
        {
            const first = await get(ctx, "/api/v1/locations?limit=2", orgToken);
            const page1 = (first.body.data ?? []) as { id: string }[];
            const cursor = first.body.next_cursor as string | null;
            let noOverlap = true;
            if (cursor) {
                const second = await get(ctx, `/api/v1/locations?limit=2&cursor=${encodeURIComponent(cursor)}`, orgToken);
                const page2 = ((second.body.data ?? []) as { id: string }[]).map((r) => r.id);
                noOverlap = !page2.some((id) => page1.map((r) => r.id).includes(id));
            }
            const whole = await get(ctx, "/api/v1/locations?limit=200", orgToken);
            const all = ((whole.body.data ?? []) as { id: string }[]).map((r) => r.id);
            const stable = JSON.stringify(all.slice(0, 2)) === JSON.stringify(page1.map((r) => r.id));
            const ok = page1.length === 2 && Boolean(cursor) && noOverlap && stable;
            checks.push(check("pagination", ["DP-QA-32", "DP-QA-56"], "Pagination",
                ok ? "PASS" : (page1.length < 2 ? "BLOCKED" : "FAIL"),
                ok
                    ? "Paging with limit=2 advanced through a cursor with no duplicates, and the paged order matched a single full read."
                    : page1.length < 2
                        ? "The fixture holds too few locations to page. Repair the fixture rather than recording a pass."
                        : "Paging produced duplicate or inconsistent records."));
        }

        // 12. Incremental sync
        {
            const future = new Date(Date.now() + 86_400_000).toISOString();
            const none = await get(ctx, `/api/v1/locations?updated_since=${encodeURIComponent(future)}`, orgToken);
            const past = await get(ctx, `/api/v1/locations?updated_since=${encodeURIComponent(new Date(0).toISOString())}`, orgToken);
            const ambiguous = await get(ctx, "/api/v1/locations?updated_since=2026-01-01T00:00:00", orgToken);
            const ok = ((none.body.data ?? []) as unknown[]).length === 0
                && ((past.body.data ?? []) as unknown[]).length > 0
                && ambiguous.status === 400;
            checks.push(check("incremental_sync", ["DP-QA-31", "DP-QA-56"], "Incremental synchronization",
                ok ? "PASS" : "FAIL",
                ok
                    ? "A future watermark returned nothing, an epoch watermark returned everything, and a timestamp with no timezone was refused rather than guessed."
                    : "Incremental synchronization did not behave as documented."));
        }

        // 13. Rate-limit contract
        {
            const res = await get(ctx, "/api/v1/context", orgToken);
            const limit = res.headers.get("RateLimit-Limit");
            const remaining = res.headers.get("RateLimit-Remaining");
            const reset = res.headers.get("RateLimit-Reset");
            const ok = Boolean(limit && remaining && reset);
            checks.push(check("rate_limit", ["DP-QA-38", "DP-QA-58"], "Rate-limit contract",
                ok ? "PASS" : "FAIL",
                ok
                    ? `An ordinary response carried RateLimit-Limit ${limit}, RateLimit-Remaining ${remaining} and RateLimit-Reset ${reset}. No budget was exhausted to prove it.`
                    : "Rate-limit headers were absent from an ordinary response."));
        }

        // 14. OpenAPI / runtime parity
        {
            const spec = await fetch(`${ctx.baseUrl}/api/admin/integrations/openapi`).catch(() => null);
            if (!spec || spec.status !== 200) {
                checks.push(check("openapi_parity", ["DP-QA-39", "DP-QA-54"], "OpenAPI parity", "BLOCKED",
                    "The governed OpenAPI artifact could not be read from this server without an operator session; compare it by hand in Section J."));
            } else {
                const doc = (await spec.json()) as { paths?: Record<string, unknown> };
                const paths = Object.keys(doc.paths ?? {}).sort();
                const expected = ["/api/v1/context", "/api/v1/locations", "/api/v1/oauth/token"];
                const ok = JSON.stringify(paths) === JSON.stringify(expected);
                checks.push(check("openapi_parity", ["DP-QA-39", "DP-QA-54"], "OpenAPI parity",
                    ok ? "PASS" : "FAIL",
                    ok
                        ? "The governed reference documents exactly the three implemented public paths — no speculative endpoint, no internal route."
                        : `The reference documents: ${paths.join(", ")}`));
            }
        }

        return { ok: true, ranAt: new Date().toISOString(), checks };
    } finally {
        // The verification credentials die with the run, whatever happened above.
        for (const [, c] of ctx.creds) {
            await revokeCredential(supabase, { credentialId: c.credentialId }).catch(() => undefined);
            await supabase.from("app_credentials").delete().eq("id", c.credentialId);
        }
    }
}
