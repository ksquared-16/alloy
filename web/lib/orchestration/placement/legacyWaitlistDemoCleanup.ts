/**
 * Dry-run / apply cleanup for legacy waitlist/placement demo rows beyond `waitlist_demo_v1`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { runWaitlistDemoCleanup, type WaitlistDemoCleanupResult } from "@/lib/orchestration/placement/waitlistDemoCleanup";

export type LegacyWaitlistDemoCleanupReport = {
    dry_run: boolean;
    org_id: string;
    waitlist_demo_v1: WaitlistDemoCleanupResult;
    legacy_opportunities_by_name: Array<{ id: string; name: string | null }>;
    legacy_locations_by_label: Array<{ id: string; label: string | null; location_type: string | null }>;
    legacy_opportunity_ids: string[];
    legacy_location_ids: string[];
    counts: {
        legacy_opportunities: number;
        legacy_locations: number;
        placement_overrides: number;
        placement_candidates: number;
    };
};

const LEGACY_OPP_NAME_PATTERNS = ["placement demo —", "waitlist demo —"] as const;
const LEGACY_LOCATION_LABEL_PATTERNS = ["waitlist demo —", "placement demo —"] as const;

async function selectLegacyOpportunities(supabase: SupabaseClient, orgId: string) {
    const { data, error } = await supabase
        .from("opportunities")
        .select("id, name, metadata")
        .eq("org_id", orgId)
        .or(LEGACY_OPP_NAME_PATTERNS.map((p) => `name.ilike.${p}%`).join(","));
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; name: string | null; metadata: unknown }>;
}

async function selectLegacyLocations(supabase: SupabaseClient, orgId: string) {
    const { data, error } = await supabase
        .from("locations")
        .select("id, label, location_type, metadata")
        .eq("org_id", orgId)
        .or(LEGACY_LOCATION_LABEL_PATTERNS.map((p) => `label.ilike.${p}%`).join(","));
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; label: string | null; location_type: string | null; metadata: unknown }>;
}

function isTaggedDemo(metadata: unknown): boolean {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return false;
    const m = metadata as Record<string, unknown>;
    return m.demo_batch_key != null || m.is_demo_data === true;
}

export async function runLegacyWaitlistDemoCleanupReport(
    supabase: SupabaseClient,
    orgId: string,
    execute: boolean
): Promise<LegacyWaitlistDemoCleanupReport> {
    const waitlist_demo_v1 = await runWaitlistDemoCleanup(supabase, orgId, execute);

    const legacyOppsRaw = await selectLegacyOpportunities(supabase, orgId);
    const legacyOpps = legacyOppsRaw.filter((o) => !isTaggedDemo(o.metadata));
    const legacyLocsRaw = await selectLegacyLocations(supabase, orgId);
    const legacyLocs = legacyLocsRaw.filter((l) => !isTaggedDemo(l.metadata));

    const legacyOppIds = legacyOpps.map((o) => o.id);
    const legacyLocIds = legacyLocs.map((l) => l.id);

    let placementCandidates = 0;
    let placementOverrides = 0;

    if (execute && legacyOppIds.length) {
        const { data: candRows } = await supabase
            .from("placement_candidates")
            .select("id")
            .eq("org_id", orgId)
            .in("opportunity_id", legacyOppIds);
        const candIds = (candRows ?? []).map((c) => (c as { id: string }).id);

        if (candIds.length) {
            const { data: ovs } = await supabase
                .from("placement_overrides")
                .delete()
                .eq("org_id", orgId)
                .in("placement_candidate_id", candIds)
                .select("id");
            placementOverrides = (ovs ?? []).length;
        }

        const { data: deletedCands } = await supabase
            .from("placement_candidates")
            .delete()
            .eq("org_id", orgId)
            .in("opportunity_id", legacyOppIds)
            .select("id");
        placementCandidates = (deletedCands ?? []).length;

        await supabase.from("opportunity_customer_members").delete().eq("org_id", orgId).in("opportunity_id", legacyOppIds);
        await supabase.from("opportunities").delete().eq("org_id", orgId).in("id", legacyOppIds);
    } else if (!execute && legacyOppIds.length) {
        const { count: pc } = await supabase
            .from("placement_candidates")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .in("opportunity_id", legacyOppIds);
        placementCandidates = pc ?? 0;
    }

    if (execute && legacyLocIds.length) {
        await supabase.from("locations").delete().eq("org_id", orgId).in("id", legacyLocIds);
    }

    return {
        dry_run: !execute,
        org_id: orgId,
        waitlist_demo_v1,
        legacy_opportunities_by_name: legacyOpps.map((o) => ({ id: o.id, name: o.name })),
        legacy_locations_by_label: legacyLocs.map((l) => ({
            id: l.id,
            label: l.label,
            location_type: l.location_type,
        })),
        legacy_opportunity_ids: legacyOppIds,
        legacy_location_ids: legacyLocIds,
        counts: {
            legacy_opportunities: legacyOppIds.length,
            legacy_locations: legacyLocIds.length,
            placement_candidates: placementCandidates,
            placement_overrides: placementOverrides,
        },
    };
}
