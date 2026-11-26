#!/usr/bin/env tsx
/**
 * Authenticated staging certification for Person ↔ Child relationship admin APIs.
 *
 * Usage (requires admin session cookie from staging login):
 *   STAGING_BASE_URL=https://staging.workwithalloy.com \
 *   STAGING_SESSION_COOKIE="sb-..." \
 *   CERTIFY_ORG_SLUG=your-org \
 *   npx tsx web/scripts/certifyPersonChildRelationshipStagingApi.ts
 *
 * Optional two-org matrix:
 *   STAGING_SESSION_COOKIE_ORG_B="..." CERTIFY_CROSS_ORG_RELATIONSHIP_ID=uuid
 */

type StepResult = { step: string; status: number; ok: boolean; detail?: string };

function requiredEnv(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`Missing required env: ${name}`);
    return v;
}

async function requestJson(
    baseUrl: string,
    cookie: string,
    path: string,
    init?: RequestInit,
): Promise<{ status: number; json: Record<string, unknown> }> {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        headers: {
            ...(init?.headers ?? {}),
            Cookie: cookie,
            "Content-Type": "application/json",
        },
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
}

async function main(): Promise<void> {
    const baseUrl = requiredEnv("STAGING_BASE_URL");
    const cookie = requiredEnv("STAGING_SESSION_COOKIE");
    const results: StepResult[] = [];

    const list = await requestJson(baseUrl, cookie, "/api/admin/person-child-relationships", { method: "GET" });
    results.push({ step: "list", status: list.status, ok: list.status === 200 });

    const unauth = await fetch(`${baseUrl}/api/admin/person-child-relationships`, { method: "GET" });
    results.push({ step: "unauthenticated", status: unauth.status, ok: unauth.status === 401 || unauth.status === 403 });

    const orgBCookie = process.env.STAGING_SESSION_COOKIE_ORG_B?.trim();
    const crossOrgId = process.env.CERTIFY_CROSS_ORG_RELATIONSHIP_ID?.trim();
    if (orgBCookie && crossOrgId) {
        const cross = await requestJson(
            baseUrl,
            orgBCookie,
            `/api/admin/person-child-relationships/${encodeURIComponent(crossOrgId)}`,
            { method: "GET" },
        );
        results.push({
            step: "cross_org_read_denied",
            status: cross.status,
            ok: cross.status === 404 || cross.status === 403,
            detail: String(cross.json.error ?? ""),
        });
    }

    const failed = results.filter((r) => !r.ok);
    console.log(JSON.stringify({ results, passed: failed.length === 0 }, null, 2));
    if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
