/**
 * The durable record of what happened at the external trust boundary.
 *
 * ── WHY THIS EXISTS AT ALL ──
 *
 * Thread 3 found `logAdminAudit` is a `console.log` with 57 call sites and no
 * table behind it, and that Alloy's authorization domain writes no audit of any
 * kind. Thread 4 made a durable store a prerequisite of the FIRST credential
 * rather than a follow-on, on one argument: a credential issued into a system
 * that records nothing cannot be investigated after the fact.
 *
 * ── SECURITY AUDIT, NOT REQUEST LOGGING ──
 *
 * This records the boundary — issuance, rotation, revocation, and authentication
 * outcomes. It is NOT per-request API activity. That belongs to the /api/v1
 * gateway, which does not exist; designing a request log now would mean guessing
 * the shape of requests nobody has built, and merging the two would put
 * high-volume traffic in the table that has to stay readable during an incident.
 *
 * ── WHAT MUST NEVER LAND HERE ──
 *
 * No plaintext secret, no digest, no Authorization header, no request body, no
 * child or family data. The identifiers are enough to answer "which application,
 * which installation, which credential, what happened" and nothing more is
 * needed to investigate. An audit table that accumulates payloads becomes a
 * second copy of the data it was meant to protect.
 *
 * ── FAILING TO AUDIT NEVER GRANTS ACCESS, AND NEVER BREAKS A REQUEST ──
 *
 * Writing is best-effort and swallowed. That is a deliberate trade with a stated
 * cost: an audit outage loses records rather than refusing authentications. It is
 * the right trade for authentication SUCCESS. It would be the wrong trade for a
 * high-value administrative act, which is why issuance and revocation write their
 * audit row through the same call but are expected to be checked by their caller.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SecurityAuditEvent =
    | "credential.created"
    | "credential.rotated"
    | "credential.revoked"
    | "installation.created"
    | "installation.suspended"
    | "installation.revoked"
    | "installation.scopes_changed"
    | "authentication.succeeded"
    | "authentication.rejected";

export type SecurityAuditRecord = {
    eventType: SecurityAuditEvent;
    outcome: "allowed" | "denied" | "error";
    orgId?: string | null;
    applicationId?: string | null;
    installationId?: string | null;
    credentialId?: string | null;
    /** Coarse and stable. Never free-form detail, never anything caller-supplied. */
    reasonCode?: string | null;
    correlationId?: string | null;
    actorUserId?: string | null;
    clientIpHash?: string | null;
    /** Bounded, non-PII. Keys are allowlisted below. */
    metadata?: Record<string, string | number | boolean> | null;
};

/**
 * Metadata is allowlisted rather than filtered.
 *
 * A denylist has to anticipate every field a future caller might add; an
 * allowlist fails safe when someone passes something new. This is the same
 * reasoning `canonicalSend` applies to message metadata, so that "a caller cannot
 * smuggle arbitrary state onto a row".
 */
const ALLOWED_METADATA_KEYS = new Set(["label", "scope", "location_id", "boundary_mode", "environment"]);

function safeMetadata(input: SecurityAuditRecord["metadata"]): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(input ?? {})) {
        if (!ALLOWED_METADATA_KEYS.has(k)) continue;
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    }
    return out;
}

export async function recordSecurityAudit(
    supabase: SupabaseClient,
    record: SecurityAuditRecord,
): Promise<{ ok: boolean }> {
    try {
        const { error } = await supabase.from("app_security_audit").insert({
            event_type: record.eventType,
            outcome: record.outcome,
            org_id: record.orgId ?? null,
            application_id: record.applicationId ?? null,
            installation_id: record.installationId ?? null,
            credential_id: record.credentialId ?? null,
            reason_code: record.reasonCode ?? null,
            correlation_id: record.correlationId ?? null,
            actor_user_id: record.actorUserId ?? null,
            client_ip_hash: record.clientIpHash ?? null,
            metadata: safeMetadata(record.metadata),
        });
        return { ok: !error };
    } catch {
        return { ok: false };
    }
}
