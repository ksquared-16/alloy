/**
 * Thread 8, Slice C — the line between a fact and a mood.
 *
 * Producer administration is allowed to say "37 events could not be matched to a
 * child", because `attendance_integration_events.disposition` is written by the
 * ingest path on every inbound event. It is NOT allowed to say "last seen 4
 * minutes ago", because `last_seen_at` is a column nothing writes. Both would
 * look equally authoritative on screen, which is exactly why the difference is
 * pinned here rather than left to judgement.
 *
 * The third property is provider honesty: generic administration must never
 * imply that a named provider integration exists.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    listProducersForOrg,
    problemDispositionLabel,
    providerIntegrationNotice,
    PROBLEM_DISPOSITIONS,
} from "@/lib/childcareOperational/attendance/integration/producerAdministration";

const ORG = "org-1";

function producerRow(over: Record<string, unknown> = {}) {
    return {
        id: "prod-1",
        label: "Playground scanner",
        provider_key: "generic_v1",
        status: "active",
        capabilities: ["attendance.record"],
        credential_last_four: "a1b2",
        created_at: "2026-09-01T00:00:00.000Z",
        rotated_at: null,
        revoked_at: null,
        ...over,
    };
}

function supa(tables: Record<string, unknown[]>) {
    const selects: Record<string, string> = {};
    function table(name: string) {
        const result = { data: tables[name] ?? [], error: null };
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
    const client = { from: vi.fn((n: string) => table(n)) } as unknown as SupabaseClient;
    return { client, selects };
}

const BASE = {
    attendance_integration_producers: [producerRow()],
    attendance_integration_producer_sites: [{ producer_id: "prod-1", site_location_id: "site-1" }],
    locations: [{ id: "site-1", label: "Riverside" }],
    attendance_integration_mappings: [
        { producer_id: "prod-1", status: "active" },
        { producer_id: "prod-1", status: "disabled" },
    ],
    attendance_integration_events: [],
};

describe("listProducersForOrg — never leaks, never invents health", () => {
    it("does not select the credential hash", async () => {
        const { client, selects } = supa(BASE);
        await listProducersForOrg(client, ORG);
        expect(selects.attendance_integration_producers).not.toContain("credential_hash");
        expect(selects.attendance_integration_producers).not.toContain("*");
    });

    it("does not select last_seen_at, because nothing writes it", async () => {
        const { client, selects } = supa(BASE);
        await listProducersForOrg(client, ORG);
        expect(selects.attendance_integration_producers).not.toContain("last_seen_at");
    });

    it("exposes no health, online or last-seen field", async () => {
        const { client } = supa(BASE);
        const [row] = await listProducersForOrg(client, ORG);
        const keys = Object.keys(row).map((k) => k.toLowerCase());
        for (const forbidden of ["lastseen", "lastseenat", "health", "online", "syncedat"]) {
            expect(keys).not.toContain(forbidden);
        }
    });
});

describe("listProducersForOrg — problems are counted, not inferred", () => {
    it("reports nothing when the inbox holds no problem events", async () => {
        // Silence is not a problem, and must not be rendered as one.
        const { client } = supa(BASE);
        const [row] = await listProducersForOrg(client, ORG);
        expect(row.problems).toEqual([]);
    });

    it("counts each problem disposition that actually occurred", async () => {
        const { client } = supa({
            ...BASE,
            attendance_integration_events: [
                { producer_id: "prod-1", disposition: "unmapped" },
                { producer_id: "prod-1", disposition: "unmapped" },
                { producer_id: "prod-1", disposition: "rejected" },
                // Another producer's problem must not be attributed to this one.
                { producer_id: "prod-2", disposition: "unmapped" },
            ],
        });
        const [row] = await listProducersForOrg(client, ORG);
        expect(row.problems).toEqual([
            { disposition: "unmapped", count: 2 },
            { disposition: "rejected", count: 1 },
        ]);
    });

    it("counts mappings by state", async () => {
        const { client } = supa(BASE);
        const [row] = await listProducersForOrg(client, ORG);
        expect(row.activeMappingCount).toBe(1);
        expect(row.disabledMappingCount).toBe(1);
    });
});

describe("listProducersForOrg — an unrecognised status is not an allowed producer", () => {
    it("treats a non-active status as revoked", async () => {
        const { client } = supa({
            ...BASE,
            attendance_integration_producers: [producerRow({ status: "paused" })],
        });
        const [row] = await listProducersForOrg(client, ORG);
        expect(row.status).toBe("revoked");
    });
});

describe("site grants", () => {
    it("resolves grant site names for display", async () => {
        const { client } = supa(BASE);
        const [row] = await listProducersForOrg(client, ORG);
        expect(row.siteGrants).toEqual([{ siteLocationId: "site-1", siteName: "Riverside" }]);
    });

    it("reports an empty grant list rather than implying org-wide reach", async () => {
        // No grant means the producer can author nowhere; it must never read as
        // "everywhere" through an absent restriction.
        const { client } = supa({ ...BASE, attendance_integration_producer_sites: [] });
        const [row] = await listProducersForOrg(client, ORG);
        expect(row.siteGrants).toEqual([]);
    });
});

describe("provider honesty", () => {
    it("says Classroom Coach is not built, rather than letting a generic row imply it", () => {
        const notice = providerIntegrationNotice("classroom_coach");
        expect(notice).toBeTruthy();
        expect(notice).toContain("not built");
    });

    it("adds no notice to a generic producer", () => {
        expect(providerIntegrationNotice("generic_v1")).toBeNull();
    });
});

describe("operator language", () => {
    it("never shows a raw disposition key", () => {
        for (const d of PROBLEM_DISPOSITIONS) {
            const label = problemDispositionLabel(d);
            expect(label).not.toContain(d);
            expect(label[0]).toBe(label[0].toUpperCase());
        }
    });
});
