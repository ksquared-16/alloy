/**
 * The high-volume record of what external callers actually did.
 *
 * ── DELIBERATELY NOT THE SECURITY AUDIT ──
 *
 * B.1 built `app_security_audit` for the boundary: issuance, rotation,
 * revocation, authentication outcomes. This is the other thing, and they stay
 * apart. The security audit must remain small and readable during an incident;
 * this is written on every request and will be larger by orders of magnitude.
 * Merging them would put ordinary traffic in the table an investigator needs.
 *
 * ── WHAT NEVER LANDS HERE ──
 *
 * No Authorization header. No access token, in any form. No credential. No
 * request body, no response body. No child, family or staff data. No raw query
 * string — a query string is where personal data arrives when nobody planned for
 * it to.
 *
 * The route is stored NORMALIZED — the template, never the concrete path. A path
 * with identifiers in it cannot be aggregated and is itself a place identifiers
 * leak into a log.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ApiActivityOutcome = "success" | "client_error" | "server_error" | "rate_limited";

export type ApiActivityRecord = {
    requestId: string;
    method: string;
    /** Normalized route template, e.g. "/api/v1/context". Never a concrete path. */
    route: string;
    operationId?: string | null;
    statusCode: number;
    outcome: ApiActivityOutcome;
    errorCode?: string | null;
    latencyMs?: number | null;
    orgId?: string | null;
    applicationId?: string | null;
    installationId?: string | null;
    tokenId?: string | null;
};

export function outcomeForStatus(status: number): ApiActivityOutcome {
    if (status === 429) return "rate_limited";
    if (status >= 500) return "server_error";
    if (status >= 400) return "client_error";
    return "success";
}

/**
 * Best-effort and swallowed.
 *
 * An activity-log outage must not refuse traffic: this table exists for
 * observability, and failing a partner's request because a log write failed
 * would turn a reporting problem into an outage. The security audit makes the
 * opposite trade for the events that matter to an investigation.
 */
export async function recordApiActivity(
    supabase: SupabaseClient,
    record: ApiActivityRecord,
): Promise<{ ok: boolean }> {
    try {
        const { error } = await supabase.from("app_api_activity").insert({
            request_id: record.requestId,
            org_id: record.orgId ?? null,
            application_id: record.applicationId ?? null,
            installation_id: record.installationId ?? null,
            token_id: record.tokenId ?? null,
            method: record.method,
            route: record.route,
            operation_id: record.operationId ?? null,
            status_code: record.statusCode,
            outcome: record.outcome,
            error_code: record.errorCode ?? null,
            latency_ms: record.latencyMs ?? null,
        });
        return { ok: !error };
    } catch {
        return { ok: false };
    }
}
