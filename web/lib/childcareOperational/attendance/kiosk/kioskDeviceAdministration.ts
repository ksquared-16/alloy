/**
 * What an administrator may SEE about trusted kiosk devices.
 *
 * ── WHAT IS DELIBERATELY ABSENT ──
 *
 * There is no health, no "online", and no last-seen. `attendance_kiosk_devices`
 * carries a `last_seen_at` column and NOTHING WRITES IT — not the device
 * authority that resolves a credential on every kiosk request, not the capture
 * route. A "Last seen: never" column on every device in the fleet would be read
 * as a fleet-wide outage; a "healthy" badge derived from the same column would
 * be worse, because it would be reassuring and false.
 *
 * So this projection omits the field entirely rather than rendering a column the
 * substrate cannot answer. Wiring the write is real follow-up capability debt and
 * is recorded as such — when it lands, health belongs here, derived from a
 * timestamp something actually maintains.
 *
 * ── WHAT IS DELIBERATELY PARTIAL ──
 *
 * `credentialLastFour` is not a secret and is not sufficient to authenticate. It
 * exists for exactly one operator task: telling two tablets apart when deciding
 * which one to rotate. The credential itself is returned once, at registration or
 * rotation, and is unrecoverable afterwards — this module has no path that could
 * re-display it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type KioskDeviceStatus = "active" | "revoked";

export type KioskDeviceAdminRow = {
    id: string;
    label: string;
    siteLocationId: string;
    /** Operator-facing site name, resolved for display; null when unreadable. */
    siteName: string | null;
    status: KioskDeviceStatus;
    /** What this device is permitted to do. Explicit, so revoking one is expressible. */
    capabilities: string[];
    /** Last four characters of the current secret. NOT a credential. */
    credentialLastFour: string | null;
    registeredAt: string | null;
    rotatedAt: string | null;
    revokedAt: string | null;
};

/**
 * The devices in one org, newest first.
 *
 * The select list is explicit and does NOT include `credential_hash`. A
 * `select("*")` here would put every device's hash into an admin API response,
 * which is the kind of leak that never announces itself.
 */
export async function listKioskDevicesForOrg(
    supabase: SupabaseClient,
    orgId: string,
): Promise<KioskDeviceAdminRow[]> {
    const { data, error } = await supabase
        .from("attendance_kiosk_devices")
        .select(
            "id, label, site_location_id, status, capabilities, credential_last_four, created_at, rotated_at, revoked_at",
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as {
        id: string;
        label: string | null;
        site_location_id: string;
        status: string | null;
        capabilities: string[] | null;
        credential_last_four: string | null;
        created_at: string | null;
        rotated_at: string | null;
        revoked_at: string | null;
    }[];

    const siteIds = [...new Set(rows.map((r) => r.site_location_id).filter(Boolean))];
    const siteNames = new Map<string, string>();
    if (siteIds.length > 0) {
        const { data: sites } = await supabase
            .from("locations")
            .select("id, label")
            .eq("org_id", orgId)
            .in("id", siteIds);
        for (const s of (sites ?? []) as { id: string; label: string | null }[]) {
            const label = String(s.label ?? "").trim();
            if (label) siteNames.set(s.id, label);
        }
    }

    return rows.map((r) => ({
        id: r.id,
        label: String(r.label ?? "").trim() || "Untitled device",
        siteLocationId: r.site_location_id,
        siteName: siteNames.get(r.site_location_id) ?? null,
        // Anything that is not literally `active` is treated as revoked. A status
        // this surface does not recognise must not read as a working device.
        status: r.status === "active" ? "active" : "revoked",
        capabilities: Array.isArray(r.capabilities) ? r.capabilities : [],
        credentialLastFour: r.credential_last_four,
        registeredAt: r.created_at,
        rotatedAt: r.rotated_at,
        revokedAt: r.revoked_at,
    }));
}

/**
 * Operator-facing phrasing for what a device may do.
 * Capability keys are implementation vocabulary and must not reach the screen.
 */
export function kioskCapabilityLabel(capability: string): string {
    switch (capability) {
        case "attendance.record":
            return "Record attendance";
        case "attendance.read":
            return "View attendance";
        default:
            return capability;
    }
}
