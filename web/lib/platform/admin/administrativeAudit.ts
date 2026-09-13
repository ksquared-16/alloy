/**
 * Consequential administrative acts, and the record that must survive them.
 *
 * ── THE PROBLEM B.1 LEFT OPEN, STATED PLAINLY ──
 *
 * B.1's `recordSecurityAudit` is best-effort and swallowed, and that is the right
 * trade for an authentication SUCCESS: an audit outage must not refuse a
 * partner's traffic. B.1 also recorded that it is the WRONG trade for issuing or
 * revoking a credential, and left the resolution to whoever productized those
 * actions. This is that resolution.
 *
 * ── WRITE THE INTENT FIRST ──
 *
 * The naive fix is to act and then audit, failing the response if the audit
 * write fails. That produces the worst outcome available: the credential exists,
 * the operator is told it did not, and nothing records either fact.
 *
 * So the order is inverted. A durable `attempted` row is written BEFORE the act.
 * If that write fails, the act never happens — nothing has changed, and refusing
 * is safe and honest. If the act then fails, the row is finalized `error`. If the
 * act succeeds, the row is finalized `allowed`.
 *
 * The invariant this buys is the one that matters after an incident:
 *
 *   **No consequential administrative act can occur without a durable record of
 *   the attempt already existing.**
 *
 * A finalize that fails leaves the `attempted` row behind, which is strictly
 * better than silence: an investigator sees that the act was begun, by whom, and
 * against what.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SecurityAuditEvent } from "@/lib/platform/principal/securityAudit";

export type AdministrativeContext = {
    eventType: SecurityAuditEvent;
    actorUserId: string;
    orgId: string;
    applicationId?: string | null;
    installationId?: string | null;
    credentialId?: string | null;
    correlationId?: string | null;
    metadata?: Record<string, string | number | boolean> | null;
};

export type AdministrativeOutcome<T> =
    | { ok: true; result: T; auditId: string }
    | { ok: false; code: "audit_unavailable" | "action_failed"; message: string; auditId?: string };

const ALLOWED_METADATA_KEYS = new Set(["label", "scope", "location_id", "boundary_mode", "environment", "status"]);

function safeMetadata(input: AdministrativeContext["metadata"]): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(input ?? {})) {
        if (!ALLOWED_METADATA_KEYS.has(k)) continue;
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    }
    return out;
}

/**
 * Run a consequential act inside a durable audit envelope.
 *
 * `action` must be the ONLY place the effect happens. Anything performed before
 * calling this is outside the guarantee.
 */
export async function withAdministrativeAudit<T>(
    supabase: SupabaseClient,
    context: AdministrativeContext,
    action: () => Promise<{ ok: true; value: T } | { ok: false; reason: string }>,
): Promise<AdministrativeOutcome<T>> {
    // 1. The intent, durably, before anything changes.
    const { data: intent, error: intentError } = await supabase
        .from("app_security_audit")
        .insert({
            event_type: context.eventType,
            outcome: "attempted",
            org_id: context.orgId,
            application_id: context.applicationId ?? null,
            installation_id: context.installationId ?? null,
            credential_id: context.credentialId ?? null,
            actor_user_id: context.actorUserId,
            correlation_id: context.correlationId ?? null,
            reason_code: null,
            metadata: safeMetadata(context.metadata),
        })
        .select("id")
        .maybeSingle();

    if (intentError || !intent) {
        // Nothing has happened. Saying so is both true and safe.
        return {
            ok: false,
            code: "audit_unavailable",
            message: "This action was not performed because it could not be recorded.",
        };
    }

    const auditId = (intent as { id: string }).id;

    // 2. The act.
    let outcome: { ok: true; value: T } | { ok: false; reason: string };
    try {
        outcome = await action();
    } catch (error) {
        outcome = { ok: false, reason: error instanceof Error ? error.message : "action_threw" };
    }

    // 3. Finalize. A failure here leaves the `attempted` row, which still tells
    //    an investigator the act was begun.
    await supabase
        .from("app_security_audit")
        .update({
            outcome: outcome.ok ? "allowed" : "error",
            reason_code: outcome.ok ? null : outcome.reason.slice(0, 120),
        })
        .eq("id", auditId);

    if (!outcome.ok) {
        return { ok: false, code: "action_failed", message: outcome.reason, auditId };
    }
    return { ok: true, result: outcome.value, auditId };
}
