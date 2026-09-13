/**
 * Thread 8, Slice B — what the device inventory may and may not say.
 *
 * Two properties matter more than the listing itself.
 *
 * SECRETS. The row holds `credential_hash`. An administration read that reached
 * for it — through a `select("*")`, or by adding it to the projection later —
 * would put every device's hash into an admin API response, and nothing about
 * that failure is visible on screen. So the select list is asserted directly.
 *
 * HEALTH. `last_seen_at` exists as a column and NOTHING WRITES IT. A "last seen"
 * or "healthy" field derived from it would be an invented fact, and the
 * reassuring version is the dangerous one. These pin its absence so a later
 * well-meaning addition has to confront the missing write first.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    kioskCapabilityLabel,
    listKioskDevicesForOrg,
} from "@/lib/childcareOperational/attendance/kiosk/kioskDeviceAdministration";

const ORG = "org-1";

function deviceRow(over: Record<string, unknown> = {}) {
    return {
        id: "dev-1",
        label: "Front desk tablet",
        site_location_id: "site-1",
        status: "active",
        capabilities: ["attendance.record"],
        credential_last_four: "9xQ2",
        created_at: "2026-09-01T00:00:00.000Z",
        rotated_at: null,
        revoked_at: null,
        ...over,
    };
}

/** Captures the select list each table was queried with. */
function supa(devices: unknown[], sites: unknown[] = []) {
    const selects: Record<string, string> = {};

    function table(name: string, data: unknown[]) {
        const result = { data, error: null };
        // Every builder step returns the same object, and the object is awaitable.
        // `attendance_kiosk_devices` ends on `.order()`; `locations` ends on
        // `.in()` and is awaited directly, so both shapes must resolve.
        const api = {
            select(cols: string) {
                selects[name] = cols;
                return api;
            },
            eq: () => api,
            in: () => api,
            order: () => api,
            then(resolve: (v: typeof result) => unknown) {
                return Promise.resolve(result).then(resolve);
            },
        };
        return api;
    }

    const client = {
        from: vi.fn((name: string) => table(name, name === "locations" ? sites : devices)),
    } as unknown as SupabaseClient;
    return { client, selects };
}

describe("listKioskDevicesForOrg — the inventory never carries a secret", () => {
    it("does not select the credential hash", async () => {
        const { client, selects } = supa([deviceRow()]);
        await listKioskDevicesForOrg(client, ORG);
        expect(selects.attendance_kiosk_devices).not.toContain("credential_hash");
        expect(selects.attendance_kiosk_devices).not.toContain("*");
    });

    it("returns no credential field at all, only the identifying last four", async () => {
        const { client } = supa([deviceRow()]);
        const [row] = await listKioskDevicesForOrg(client, ORG);
        expect(row.credentialLastFour).toBe("9xQ2");
        expect(Object.keys(row)).not.toContain("credentialHash");
        expect(JSON.stringify(row)).not.toContain("credential_hash");
    });
});

describe("listKioskDevicesForOrg — no fabricated health", () => {
    it("never selects last_seen_at, because nothing writes it", async () => {
        const { client, selects } = supa([deviceRow()]);
        await listKioskDevicesForOrg(client, ORG);
        expect(selects.attendance_kiosk_devices).not.toContain("last_seen_at");
    });

    it("exposes no health, online or last-seen field on the projection", async () => {
        const { client } = supa([deviceRow()]);
        const [row] = await listKioskDevicesForOrg(client, ORG);
        const keys = Object.keys(row).map((k) => k.toLowerCase());
        for (const forbidden of ["lastseen", "lastseenat", "health", "online", "stale"]) {
            expect(keys).not.toContain(forbidden);
        }
    });
});

describe("listKioskDevicesForOrg — an unrecognised status is not a working device", () => {
    it("treats any non-active status as revoked", async () => {
        const { client } = supa([deviceRow({ status: "suspended" })]);
        const [row] = await listKioskDevicesForOrg(client, ORG);
        expect(row.status).toBe("revoked");
    });

    it("treats a null status as revoked rather than defaulting to active", async () => {
        const { client } = supa([deviceRow({ status: null })]);
        const [row] = await listKioskDevicesForOrg(client, ORG);
        expect(row.status).toBe("revoked");
    });
});

describe("listKioskDevicesForOrg — presentation", () => {
    it("resolves the site name for display", async () => {
        const { client } = supa([deviceRow()], [{ id: "site-1", label: "Riverside" }]);
        const [row] = await listKioskDevicesForOrg(client, ORG);
        expect(row.siteName).toBe("Riverside");
    });

    it("reports a null site name rather than inventing one", async () => {
        const { client } = supa([deviceRow()], []);
        const [row] = await listKioskDevicesForOrg(client, ORG);
        expect(row.siteName).toBeNull();
    });

    it("never renders an empty device name", async () => {
        const { client } = supa([deviceRow({ label: "   " })]);
        const [row] = await listKioskDevicesForOrg(client, ORG);
        expect(row.label).toBe("Untitled device");
    });
});

describe("kioskCapabilityLabel — capability keys are not operator language", () => {
    it("translates the keys the product knows", () => {
        expect(kioskCapabilityLabel("attendance.record")).toBe("Record attendance");
        expect(kioskCapabilityLabel("attendance.read")).toBe("View attendance");
    });

    it("falls back to the raw key rather than hiding an unknown capability", () => {
        // Showing the key is ugly; silently dropping a capability the device
        // actually holds would misrepresent its authority.
        expect(kioskCapabilityLabel("attendance.future")).toBe("attendance.future");
    });
});
