import { describe, expect, it } from "vitest";
import {
    locationApplicabilityFromMetadata,
    readLocationPrices,
    resolveLocationPriceCents,
    writeLocationIdsMetadata,
    writeLocationPricesMetadata,
    SELECTED_LOCATION_IDS_META_KEY,
    POLICY_LOCATION_IDS_META_KEY,
    TUITION_LOCATION_IDS_META_KEY,
} from "@/lib/financials/applicability/locationApplicability";
import {
    activeGlCodeOptions,
    buildGlCodeOptions,
    formatGlCodeOptionLabel,
} from "@/lib/financials/gl/glCodeOptions";
import { summarizeLocationApplicability } from "@/components/adminV2/settings/configurationRuntime/LocationMultiSelect";
import { readTuitionLocationApplicability } from "@/lib/financials/tuitionPlans/tuitionPlanMetadata";

describe("location applicability metadata", () => {
    it("treats absent metadata as all locations", () => {
        expect(locationApplicabilityFromMetadata({})).toEqual({ mode: "all", locationIds: [] });
    });

    it("reads selected location ids", () => {
        const meta = writeLocationIdsMetadata({}, { mode: "selected", locationIds: ["a", "b"] });
        expect(meta[SELECTED_LOCATION_IDS_META_KEY]).toEqual(["a", "b"]);
        expect(locationApplicabilityFromMetadata(meta)).toEqual({
            mode: "selected",
            locationIds: ["a", "b"],
        });
    });

    it("falls back to legacy single location_id", () => {
        expect(locationApplicabilityFromMetadata({}, SELECTED_LOCATION_IDS_META_KEY, "loc-1")).toEqual({
            mode: "selected",
            locationIds: ["loc-1"],
        });
    });

    it("stores and resolves location price overrides without duplicating items", () => {
        const meta = writeLocationPricesMetadata(
            {},
            { "north": { amount_cents: 16500 }, "west": { amount_cents: 15000 } },
        );
        const prices = readLocationPrices(meta);
        expect(resolveLocationPriceCents({
            organizationAmountCents: 15000,
            locationId: "north",
            locationPrices: prices,
        })).toEqual({ amountCents: 16500, source: "location" });
        expect(resolveLocationPriceCents({
            organizationAmountCents: 15000,
            locationId: "downtown",
            locationPrices: prices,
        })).toEqual({ amountCents: 15000, source: "organization" });
    });

    it("uses distinct keys for tuition and policy metadata", () => {
        expect(TUITION_LOCATION_IDS_META_KEY).toBe("tuition_location_ids");
        expect(POLICY_LOCATION_IDS_META_KEY).toBe("location_ids");
    });
});

describe("GL code option resolver", () => {
    it("formats operator label as code — name", () => {
        expect(formatGlCodeOptionLabel("4000", "Tuition Revenue")).toBe("4000 — Tuition Revenue");
    });

    it("builds options from mapped revenue categories only", () => {
        const options = buildGlCodeOptions({
            accounts: [
                { id: "gl-1", code: "4000", name: "Tuition Revenue", type: "revenue", is_active: true },
                { id: "gl-2", code: "4100", name: "Fees", type: "revenue", is_active: true },
            ],
            revenueCategories: [
                { id: "rc-1", label: "Tuition", mapped_gl_account_id: "gl-1", is_active: true },
                { id: "rc-unmapped", label: "Orphan", mapped_gl_account_id: null, is_active: true },
            ],
        });
        expect(options).toHaveLength(1);
        expect(options[0]?.label).toBe("4000 — Tuition Revenue");
        expect(options[0]?.revenueCategoryId).toBe("rc-1");
        expect(activeGlCodeOptions(options)).toHaveLength(1);
    });

    it("documents that unmapped revenue GLs need ensureRevenueCategoriesForActiveRevenueAccounts", async () => {
        const { ensureRevenueCategoriesForActiveRevenueAccounts } = await import(
            "@/lib/financials/gl/glCodeOptions"
        );
        const created: Array<Record<string, unknown>> = [];
        const fetchImpl = (async (_url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                const body = JSON.parse(String(init.body ?? "{}")) as {
                    label?: string;
                    mapped_gl_account_id?: string;
                };
                const row = {
                    id: `rc-${created.length + 1}`,
                    label: body.label ?? "Tuition Revenue",
                    mapped_gl_account_id: body.mapped_gl_account_id ?? null,
                    is_active: true,
                };
                created.push(row);
                return {
                    ok: true,
                    json: async () => ({ revenue_category: row }),
                } as Response;
            }
            return { ok: true, json: async () => ({}) } as Response;
        }) as typeof fetch;

        const result = await ensureRevenueCategoriesForActiveRevenueAccounts({
            accounts: [
                { id: "gl-1", code: "4000", name: "Tuition Revenue", type: "revenue", is_active: true },
                { id: "gl-exp", code: "5000", name: "Expense", type: "expense", is_active: true },
            ],
            revenueCategories: [],
            fetchImpl,
        });
        expect(result.createdCount).toBe(1);
        expect(result.revenueCategories).toHaveLength(1);
        expect(result.revenueCategories[0]?.mapped_gl_account_id).toBe("gl-1");
        expect(created).toHaveLength(1);
    });

    it("keeps inactive mapped options when includeInactive is true", () => {
        const options = buildGlCodeOptions({
            accounts: [{ id: "gl-1", code: "4000", name: "Tuition Revenue", type: "revenue", is_active: false }],
            revenueCategories: [{ id: "rc-1", label: "Tuition", mapped_gl_account_id: "gl-1", is_active: true }],
            includeInactive: true,
        });
        expect(options).toHaveLength(1);
        expect(activeGlCodeOptions(options)).toHaveLength(0);
    });
});

describe("location summary presentation", () => {
    it("summarizes all and selected modes", () => {
        expect(summarizeLocationApplicability("all", [], [])).toBe("All locations");
        expect(
            summarizeLocationApplicability("selected", ["1", "2"], [
                { id: "1", name: "Downtown" },
                { id: "2", name: "North" },
            ]),
        ).toBe("2 selected locations");
    });
});

describe("tuition location applicability helper", () => {
    it("reads tuition_location_ids from offering metadata", () => {
        const applicability = readTuitionLocationApplicability({
            tuition_location_ids: ["loc-a", "loc-b"],
        });
        expect(applicability.mode).toBe("selected");
        expect(applicability.locationIds).toEqual(["loc-a", "loc-b"]);
    });
});

describe("tuition plan detail patch hygiene", () => {
    it("omits attendance_type from the patch body when care format is unchanged", async () => {
        const bodies: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
            bodies.push(JSON.parse(String(init?.body ?? "{}")));
            return {
                ok: true,
                json: async () => ({
                    offering: {
                        id: "off-1",
                        org_id: "org",
                        program_key: "infant",
                        label: "Full Day",
                        attendance_type: "full_time",
                        status: "active",
                        is_active: true,
                        metadata: {},
                    },
                }),
            } as Response;
        }) as typeof fetch;
        try {
            const { updateTuitionPlanDetails } = await import(
                "@/lib/financials/tuitionPlans/tuitionPlanClient"
            );
            await updateTuitionPlanDetails({
                offeringId: "off-1",
                name: "Full Day",
                careFormat: "full_time",
                previousCareFormat: "full_time",
                billingFrequencyKey: "weekly",
                revenueCategoryId: null,
                status: "active",
                metadata: {},
                locationMode: "selected",
                locationIds: ["loc-1"],
            });
            expect(bodies).toHaveLength(1);
            expect(bodies[0]).not.toHaveProperty("attendance_type");
            expect(bodies[0]).toMatchObject({
                label: "Full Day",
                metadata: expect.objectContaining({
                    tuition_location_ids: ["loc-1"],
                }),
            });
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
