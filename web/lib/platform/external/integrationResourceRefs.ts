/**
 * Turning a partner's identifier into an Alloy resource — and refusing to guess.
 *
 * ── AN ALIAS, NEVER AN IDENTITY ──
 *
 * A reference row says "this installation calls that Alloy resource `abc-123`".
 * It is not evidence the resource exists, and resolving one never creates
 * anything. Creating identity from a correlation row is how an integration
 * silently forks a person record, and it is the failure this module exists to
 * make impossible: there is no create-on-miss path here, by construction.
 *
 * ── UNKNOWN FAILS CLOSED, AMBIGUOUS FAILS LOUD ──
 *
 * An unmapped external id resolves to nothing. An ambiguous one — two active
 * rows for the same external id — is refused rather than resolved by taking the
 * first. The database already forbids that with a partial unique index; this
 * refuses anyway, because a resolver that would quietly pick one if the
 * constraint were ever dropped is a resolver waiting to be wrong.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type IntegrationResourceType = "child" | "location";

export type ResourceRefResolution =
    | { ok: true; resourceType: IntegrationResourceType; alloyResourceId: string }
    | { ok: false; code: "not_mapped" | "ambiguous" | "lookup_failed" };

/**
 * Resolve one external identifier within one installation.
 *
 * Scoped by installation AND organization. The installation alone would be
 * enough — it belongs to exactly one org — but passing both means a mismatch
 * returns nothing rather than trusting a single join to have stayed correct.
 */
export async function resolveIntegrationResourceRef(params: {
    supabase: SupabaseClient;
    installationId: string;
    orgId: string;
    resourceType: IntegrationResourceType;
    externalId: string;
}): Promise<ResourceRefResolution> {
    const externalId = (params.externalId ?? "").trim();
    if (!externalId || !params.installationId || !params.orgId) return { ok: false, code: "not_mapped" };

    const { data, error } = await params.supabase
        .from("integration_resource_refs")
        .select("child_customer_member_id, location_id, resource_type")
        .eq("installation_id", params.installationId)
        .eq("org_id", params.orgId)
        .eq("resource_type", params.resourceType)
        .eq("external_id", externalId)
        .eq("status", "active")
        // Two is enough to know it is ambiguous; fetching more proves nothing extra.
        .limit(2);

    // A failed read is not an absent mapping. Deny, and say it was undecidable.
    if (error) return { ok: false, code: "lookup_failed" };

    const rows = (data ?? []) as Array<{
        child_customer_member_id: string | null;
        location_id: string | null;
        resource_type: string;
    }>;

    if (rows.length === 0) return { ok: false, code: "not_mapped" };
    if (rows.length > 1) return { ok: false, code: "ambiguous" };

    const row = rows[0];
    const target = params.resourceType === "child" ? row.child_customer_member_id : row.location_id;
    // The type/target constraint should make this unreachable. Refusing anyway
    // costs nothing and means a schema change can never turn a mismatch into a
    // silently wrong subject.
    if (!target) return { ok: false, code: "not_mapped" };

    return { ok: true, resourceType: params.resourceType, alloyResourceId: target };
}
