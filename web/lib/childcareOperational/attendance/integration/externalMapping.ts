/**
 * Which canonical entity does a provider's own identifier mean?
 *
 * The single most dangerous question in an integration. A wrong answer attaches
 * a real attendance fact to the wrong child, and it does so silently — the fact
 * looks perfectly ordinary afterwards. So every failure here is a refusal, never
 * a guess, and never a creation.
 *
 * ── UNKNOWN NEVER CREATES ──
 *
 * An unmapped external child does not cause a child to exist. Alloy's canonical
 * identity is established by enrollment, not by a partner system mentioning a
 * string. An unmapped identifier produces an explicit disposition and no
 * attendance truth, and stays that way until somebody makes the mapping.
 *
 * ── AMBIGUITY IS IMPOSSIBLE RATHER THAN HANDLED ──
 *
 * The database carries a partial unique index on (org, producer, type, external
 * id) where the mapping is active, so two live answers cannot exist. This module
 * still refuses on multiple rows rather than taking the first: a resolver that
 * silently picks one is a resolver that will one day pick wrong, and defending
 * the invariant in both places costs nothing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ExternalEntityType = "child" | "location";

export type MappingResolution =
    | { ok: true; entityType: "child"; customerMemberId: string }
    | { ok: true; entityType: "location"; locationId: string }
    | { ok: false; code: string; detail: string };

const deny = (code: string, detail: string): MappingResolution => ({ ok: false, code, detail });

/**
 * Resolve one provider identifier, scoped to the producer that presented it.
 *
 * Producer-scoped on purpose: two providers may legitimately use the same string
 * for different children, so a mapping belonging to one must never answer for
 * another. That is why the lookup keys on `producerId` and not merely on org.
 */
export async function resolveExternalMapping(params: {
    supabase: SupabaseClient;
    orgId: string;
    producerId: string;
    entityType: ExternalEntityType;
    externalId: string | null | undefined;
}): Promise<MappingResolution> {
    const externalId = (params.externalId ?? "").trim();
    if (!externalId) return deny("external_id_missing", `No external ${params.entityType} identifier was supplied.`);

    const { data, error } = await params.supabase
        .from("attendance_integration_mappings")
        .select("child_customer_member_id, location_id, external_entity_type")
        .eq("org_id", params.orgId)
        .eq("producer_id", params.producerId)
        .eq("external_entity_type", params.entityType)
        .eq("external_id", externalId)
        .eq("status", "active");

    if (error) return deny("mapping_unresolved", "The mapping could not be read.");

    const rows = (data ?? []) as unknown as Array<{
        child_customer_member_id?: unknown;
        location_id?: unknown;
        external_entity_type?: unknown;
    }>;

    if (rows.length === 0) {
        // The disposition that matters: not an error in the provider's request,
        // and not a reason to invent anything. Somebody has to decide what this
        // identifier means, and until they do there is no attendance truth.
        return deny("mapping_required", `No active mapping for ${params.entityType} "${externalId}".`);
    }
    if (rows.length > 1) {
        return deny("mapping_ambiguous", `More than one active mapping for ${params.entityType} "${externalId}".`);
    }

    const row = rows[0];
    if (params.entityType === "child") {
        const id = row.child_customer_member_id != null ? String(row.child_customer_member_id).trim() : "";
        if (!id) return deny("mapping_unresolved", "The child mapping names no canonical child.");
        return { ok: true, entityType: "child", customerMemberId: id };
    }
    const id = row.location_id != null ? String(row.location_id).trim() : "";
    if (!id) return deny("mapping_unresolved", "The location mapping names no canonical location.");
    return { ok: true, entityType: "location", locationId: id };
}
