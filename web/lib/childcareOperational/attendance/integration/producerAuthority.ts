/**
 * Who is calling, and may they still author here?
 *
 * The kiosk answered this for one device with one site. An integration producer
 * is the same question with more sites and a different credential, so this
 * resolves into the SAME `NonHumanProducerAuthority` the attendance gate already
 * takes. Nothing new decides authorization; this only establishes identity.
 *
 * ── THE CREDENTIAL IS NEVER COMPARED IN PROCESS ──
 *
 * A presented secret is hashed and the row is SELECTED BY the digest — the same
 * lookup shape the kiosk device credential and the public form links use. An
 * attacker learns "a row matched" or "none did", and there is no per-byte
 * comparison in the application to time. The secret itself is never stored, so a
 * dump of this table cannot be replayed against the API.
 *
 * ── NOTHING THE CALLER SENDS IS AUTHORITY ──
 *
 * Org, sites and capabilities are read from the registry, never from the
 * request. A producer that could name its own org would be no boundary at all,
 * and the one thing an integration boundary exists to prevent is a caller
 * describing itself.
 *
 * ── WHAT IS NOT HERE ──
 *
 * ROTATION IS NOT IMPLEMENTED. A credential can be replaced by writing a new
 * digest, but there is no rotation flow and no overlap window, so replacing one
 * breaks the partner at the instant it is written. Supporting rotation properly
 * means more than one live credential per producer, which this schema's unique
 * digest deliberately forbids — a change to make knowingly, not by accident.
 * Revocation, which is what an incident actually needs, does work today.
 */
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { NonHumanProducerAuthority } from "@/lib/childcareOperational/attendance/attendancePermissions";

/** SHA-256 hex of a presented producer credential. */
export function hashProducerCredential(secret: string): string {
    return createHash("sha256").update(String(secret ?? ""), "utf8").digest("hex");
}

export type ResolvedIntegrationProducer = {
    producerId: string;
    orgId: string;
    providerKey: string;
    /** Written to the fact as `source_key`. Stable across credential rotation. */
    producerKey: string;
    label: string;
    authority: NonHumanProducerAuthority;
};

export type ProducerResolution =
    | { ok: true; producer: ResolvedIntegrationProducer }
    | { ok: false; code: string; detail: string };

const deny = (code: string, detail: string): ProducerResolution => ({ ok: false, code, detail });

/**
 * Resolve a presented credential to a trusted producer.
 *
 * Every failure is the SAME shape to the caller's eye — an unknown credential
 * and a revoked one both mean "you are not authorized" — while the codes stay
 * distinct for the evidence row, so an operator debugging a partner integration
 * can tell a typo from a revocation without that distinction leaking outward.
 */
export async function resolveIntegrationProducer(
    supabase: SupabaseClient,
    presentedCredential: string | null | undefined,
): Promise<ProducerResolution> {
    const secret = (presentedCredential ?? "").trim();
    // An absent credential is not an anonymous caller with no authority; it is
    // an unidentified one. Refuse before touching the database.
    if (!secret) return deny("credential_missing", "No producer credential was presented.");

    const { data, error } = await supabase
        .from("attendance_integration_producers")
        .select("id, org_id, provider_key, producer_key, label, capabilities, status")
        .eq("credential_hash", hashProducerCredential(secret))
        .limit(1);

    // A failed read is not an absent producer. Deny, and say it was undecidable.
    if (error) return deny("producer_unresolved", "The producer could not be resolved.");

    const rows = (data ?? []) as unknown as Array<{
        id: string; org_id: string; provider_key: string; producer_key: string;
        label: string; capabilities: string[] | null; status: string;
    }>;
    const row = rows[0];
    if (!row) return deny("producer_unknown", "No producer holds that credential.");
    if (String(row.status).trim() !== "active") {
        // Revocation takes effect on the next request, not eventually. The
        // historical facts this producer authored remain untouched — revoking a
        // producer withdraws its future authority, never its past provenance.
        return deny("producer_revoked", "That producer has been revoked.");
    }

    const { data: siteRows, error: siteError } = await supabase
        .from("attendance_integration_producer_sites")
        .select("site_location_id")
        .eq("producer_id", row.id)
        .eq("org_id", row.org_id);
    if (siteError) return deny("producer_unresolved", "The producer's sites could not be resolved.");

    const allowedSiteLocationIds = ((siteRows ?? []) as unknown as Array<{ site_location_id?: unknown }>)
        .map((s) => (s.site_location_id != null ? String(s.site_location_id).trim() : ""))
        .filter(Boolean);

    return {
        ok: true,
        producer: {
            producerId: row.id,
            orgId: row.org_id,
            providerKey: String(row.provider_key),
            producerKey: String(row.producer_key),
            label: String(row.label ?? ""),
            authority: {
                producerKey: String(row.producer_key),
                // Empty denies everything — a producer registered for no site can
                // author nothing, which is the correct state for a row that was
                // just created and not yet authorized anywhere.
                allowedSiteLocationIds,
                grantedPermissionKeys: (row.capabilities ?? []).map(String),
            },
        },
    };
}
