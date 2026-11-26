import type { SupabaseClient } from "@supabase/supabase-js";

import {
    extractTourCommsMetadataRoot,
    mergeTourCommsConfig,
    parseTourCommsConfigFragment,
    type ResolveTourCommsConfigInput,
    type ResolveTourCommsConfigResult,
} from "@/lib/tours/comms/tourCommsConfig";

export type { ResolveTourCommsConfigInput, ResolveTourCommsConfigResult };

function requireOrgId(orgId: string): string {
    const id = String(orgId ?? "").trim();
    if (!id) throw new Error("resolveTourCommsConfig: orgId is required");
    return id;
}

async function loadOrgSettingsMetadata(supabase: SupabaseClient, orgId: string): Promise<unknown> {
    const { data, error } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
    if (error) {
        console.warn("[resolveTourCommsConfig] org_settings", error.message);
        return null;
    }
    return (data as { metadata?: unknown } | null)?.metadata ?? null;
}

async function loadLocationMetadata(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string
): Promise<unknown> {
    const { data, error } = await supabase
        .from("locations")
        .select("metadata, org_id")
        .eq("id", locationId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) {
        console.warn("[resolveTourCommsConfig] locations", error.message);
        return null;
    }
    return (data as { metadata?: unknown } | null)?.metadata ?? null;
}

/**
 * Resolve effective tour communications config for an org (and optional location).
 *
 * Precedence: platform defaults → `org_settings.metadata.tour_comms` → `locations.metadata.tour_comms`.
 *
 * Malformed metadata is sanitized; missing keys use {@link DEFAULT_TOUR_COMMS_CONFIG}.
 * Does not send messages or read tour bookings.
 */
export async function resolveTourCommsConfig(
    supabase: SupabaseClient,
    input: ResolveTourCommsConfigInput
): Promise<ResolveTourCommsConfigResult> {
    const orgId = requireOrgId(input.orgId);
    const locationId = input.locationId != null ? String(input.locationId).trim() : "";

    const orgMeta = await loadOrgSettingsMetadata(supabase, orgId);
    const orgRoot = extractTourCommsMetadataRoot(orgMeta);
    const orgFragment = parseTourCommsConfigFragment(orgRoot);
    const hasOrg = orgRoot != null && typeof orgRoot === "object";

    let locationFragment = parseTourCommsConfigFragment({});
    let hasLocation = false;
    if (locationId) {
        const locMeta = await loadLocationMetadata(supabase, orgId, locationId);
        const locRoot = extractTourCommsMetadataRoot(locMeta);
        hasLocation = locRoot != null && typeof locRoot === "object";
        locationFragment = parseTourCommsConfigFragment(locRoot);
    }

    return {
        config: mergeTourCommsConfig(orgFragment, locationFragment),
        sources: { org: hasOrg, location: hasLocation },
    };
}
