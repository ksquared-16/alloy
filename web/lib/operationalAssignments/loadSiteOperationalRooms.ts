/**
 * Operational Rooms (current unit locations under a site) for Assignment Kind
 * eligibility and instant Create/Edit pickers. Physical Space linkage is a future
 * seam — these rows remain the operational destination today.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

export type SiteOperationalRoom = {
    roomId: string;
    roomName: string | null;
    programCategoryId: string | null;
    active: boolean;
};

function programCategoryFromMetadata(meta: Record<string, unknown> | null | undefined): string | null {
    if (!meta) return null;
    const direct = meta.program_category_id;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const nested = meta.room_config;
    if (nested && typeof nested === "object") {
        const id = (nested as Record<string, unknown>).program_category_id;
        if (typeof id === "string" && id.trim()) return id.trim();
    }
    return null;
}

/** Load active-ish operational rooms under a site (location_type = unit). */
export async function loadSiteOperationalRooms(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string
): Promise<SiteOperationalRoom[]> {
    if (!siteLocationId) return [];
    const { data, error } = await supabase
        .from("locations")
        .select("id, label, status_key, metadata")
        .eq("org_id", orgId)
        .eq("parent_location_id", siteLocationId)
        .eq("location_type", "unit")
        .order("label", { ascending: true });
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return (
        (data ?? []) as {
            id: string;
            label: string | null;
            status_key: string | null;
            metadata: Record<string, unknown> | null;
        }[]
    ).map((r) => {
        const status = (r.status_key ?? "").trim().toLowerCase();
        const active = status === "" || status === "active" || status === "open";
        return {
            roomId: r.id,
            roomName: r.label != null ? String(r.label).trim() || null : null,
            programCategoryId: programCategoryFromMetadata(r.metadata),
            active,
        };
    });
}
