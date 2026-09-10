/**
 * Find — or publish — the Packet version a new session should pin.
 *
 * ## Forward-only, and never a guess
 *
 * A session created before versioning existed has no proven version. Nothing here backfills one:
 * `packet_definition_version_id` stays null for those sessions and they keep resolving exactly as
 * they always have, through the per-step `resolved_form_definition_version_id` that D-94 already
 * pins. Writing a plausible version onto a family's completed paperwork would be a claim about what
 * they signed, and we cannot make it.
 *
 * ## It must survive the table not existing yet
 *
 * The migration reaches an environment on its own schedule, and session creation must not start
 * failing in the window before it lands. Every read and write here treats a missing relation as
 * "versioning is not available here" and returns null, which the caller records as "not pinned" —
 * identical to today's behaviour. The packet still runs; it simply is not yet version-pinned.
 *
 * ## No version spam
 *
 * A published version is looked up by its derivation fingerprint first. Equivalent configuration
 * resolves to the row that already exists rather than minting another, so running a resolver twice
 * is not a change.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    derivePacketVersionSnapshot,
    type PacketVersionSnapshot,
    type PacketVersionStep,
} from "@/lib/forms/packets/versioning/derivePacketVersionSnapshot";

const VERSIONS_TABLE = "form_packet_definition_versions";

/** Postgres/PostgREST codes that mean "this environment has not run the migration yet". */
function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    // 42P01 undefined_table; PostgREST reports an unknown relation as PGRST205/PGRST200.
    if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST200") return true;
    return /does not exist|schema cache/i.test(error.message ?? "");
}

export type ResolvedPacketVersion = {
    readonly id: string;
    readonly versionNumber: number;
    readonly snapshot: PacketVersionSnapshot;
    /** True when this call published it rather than finding it. */
    readonly created: boolean;
};

/**
 * @returns the published version to pin, or null when versioning is unavailable here or the
 *          snapshot is not publishable (a step without a published Form version)
 */
export async function resolvePublishedPacketVersion(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        packetDefinitionId: string;
        steps: readonly PacketVersionStep[];
        businessProcessRevisionId?: string | null;
        publishedByUserId?: string | null;
    },
): Promise<ResolvedPacketVersion | null> {
    const snapshot = derivePacketVersionSnapshot(input.steps);
    /*
     * An incomplete snapshot is never published. A step with no pinned Form version would make the
     * version claim something it cannot deliver, and session creation already fails closed on that
     * case for its own reasons.
     */
    if (!snapshot.complete) return null;

    const existing = await supabase
        .from(VERSIONS_TABLE)
        .select("id, version_number")
        .eq("org_id", input.orgId)
        .eq("form_packet_definition_id", input.packetDefinitionId)
        .eq("status", "published")
        .eq("derivation_fingerprint", snapshot.fingerprint)
        .maybeSingle();
    if (existing.error && isMissingRelation(existing.error)) return null;
    if (existing.data) {
        const row = existing.data as { id: string; version_number: number };
        return { id: row.id, versionNumber: row.version_number, snapshot, created: false };
    }

    // Next version number for this packet — the Form convention, so the two read alike.
    const highest = await supabase
        .from(VERSIONS_TABLE)
        .select("version_number")
        .eq("org_id", input.orgId)
        .eq("form_packet_definition_id", input.packetDefinitionId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (highest.error && isMissingRelation(highest.error)) return null;
    const nextVersion = ((highest.data as { version_number?: number } | null)?.version_number ?? 0) + 1;

    const inserted = await supabase
        .from(VERSIONS_TABLE)
        .insert({
            org_id: input.orgId,
            form_packet_definition_id: input.packetDefinitionId,
            version_number: nextVersion,
            status: "published",
            steps_json: snapshot.steps,
            business_process_revision_id: input.businessProcessRevisionId ?? null,
            derivation_fingerprint: snapshot.fingerprint,
            published_at: new Date().toISOString(),
            published_by_user_id: input.publishedByUserId ?? null,
        })
        .select("id, version_number")
        .maybeSingle();

    if (inserted.error) {
        if (isMissingRelation(inserted.error)) return null;
        /*
         * Two sessions starting at once race for the same fingerprint. The partial unique index
         * makes one of them lose, and losing means the row it wanted now exists — so read it back
         * rather than failing a family's session over a conflict that resolved itself correctly.
         */
        const raced = await supabase
            .from(VERSIONS_TABLE)
            .select("id, version_number")
            .eq("org_id", input.orgId)
            .eq("form_packet_definition_id", input.packetDefinitionId)
            .eq("status", "published")
            .eq("derivation_fingerprint", snapshot.fingerprint)
            .maybeSingle();
        const row = raced.data as { id: string; version_number: number } | null;
        if (row) return { id: row.id, versionNumber: row.version_number, snapshot, created: false };
        return null;
    }

    const row = inserted.data as { id: string; version_number: number } | null;
    if (!row) return null;
    return { id: row.id, versionNumber: row.version_number, snapshot, created: true };
}
