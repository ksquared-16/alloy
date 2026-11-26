import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    composeCommercialExport,
    readCadences,
    readOfferings,
    readPricing,
    readPrograms,
    readProducts,
    readRevenueCategories,
    readVariants,
    validateCommercialExport,
    type ExportReadContext,
} from "@/lib/commercial/execution/export";

/**
 * Phase 3 — Commercial Export readers. Pure tests over a fake Supabase client:
 * projection correctness, relationship resolution, effective dating, missing
 * references, and canonical construction. No evaluation, no DB.
 */

type Rows = Record<string, Record<string, unknown>[]>;

/** Minimal fake matching the reader chain: .select().eq().order().maybeSingle() + awaitable. */
function fakeSupabase(rows: Rows): SupabaseClient {
    const client = {
        from(table: string) {
            const data = rows[table] ?? [];
            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                order: () => builder,
                maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
                then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
                    Promise.resolve({ data, error: null }).then(resolve),
            };
            return builder;
        },
    };
    return client as unknown as SupabaseClient;
}

function ctxFor(rows: Rows): ExportReadContext {
    return { supabase: fakeSupabase(rows), orgId: "org-1", asOf: "2026-09-01" };
}

// ── A well-formed org: every reference resolves ──────────────────────────────
function wellFormedRows(): Rows {
    return {
        location_program_categories: [
            { id: "cat-a", key: "toddler", label: "Toddler", is_active: true },
            { id: "cat-b", key: "toddler", label: "Toddler (West)", is_active: false }, // same key, other location
            { id: "cat-c", key: "infant", label: "Infant", is_active: true },
        ],
        program_offerings: [
            {
                id: "off-1",
                program_key: "toddler",
                label: "Full Day",
                attendance_type: "full_day",
                status: "active",
                effective_start: "2026-01-01",
                effective_end: null,
                is_active: true,
            },
            {
                id: "off-2",
                program_key: "toddler",
                label: "Drop-In",
                attendance_type: "drop_in",
                status: "archived",
                effective_start: null,
                effective_end: null,
                is_active: true,
            },
        ],
        program_offering_variants: [
            { id: "var-1", offering_id: "off-1", label: "5 days/week", quantity_type: "days", quantity_value: 5, status: "active", is_active: true },
            { id: "var-2", offering_id: "off-2", label: "Default", quantity_type: null, quantity_value: null, status: "active", is_active: true },
        ],
        commercial_tuition_rates: [
            {
                id: "rate-1",
                location_id: null,
                variant_id: "var-1",
                cadence_key: "monthly",
                payer_type: "private_pay",
                rate_cents: 180000,
                not_offered: false,
                is_active: true,
                effective_start: "2026-01-01",
                effective_end: null,
                revenue_category_id: "rev-1",
            },
        ],
        commercial_products: [
            {
                id: "prod-1",
                location_id: null,
                program_key: "toddler",
                name: "Registration",
                commercial_type: "fee",
                amount_cents: 15000,
                cadence_key: null,
                revenue_category_id: "rev-1",
                behavior: { required: true },
                effective_start: null,
                effective_end: null,
                is_active: true,
            },
        ],
        option_sets: [{ id: "set-1" }],
        option_set_items: [
            { item_key: "monthly", label: "Monthly", sort_order: 1 },
            { item_key: "weekly", label: "Weekly", sort_order: 2 },
        ],
        commercial_revenue_categories: [
            { id: "rev-1", label: "Tuition Revenue", mapped_gl_account_id: "gl-1", is_active: true },
        ],
        gl_accounts: [{ id: "gl-1" }],
    };
}

describe("Commercial Export readers — projection", () => {
    it("dedupes Programs by program_key; active if any location is active", async () => {
        const programs = await readPrograms(ctxFor(wellFormedRows()));
        expect(programs).toHaveLength(2);
        const toddler = programs.find((p) => p.programKey === "toddler");
        expect(toddler).toBeTruthy();
        expect(toddler?.isActive).toBe(true); // cat-a active even though cat-b is not
        expect(toddler?.label).toBe("Toddler");
    });

    it("carries offering effective window; treats archived status as inactive", async () => {
        const offerings = await readOfferings(ctxFor(wellFormedRows()));
        const full = offerings.find((o) => o.id === "off-1");
        const drop = offerings.find((o) => o.id === "off-2");
        expect(full?.effective).toEqual({ start: "2026-01-01", end: null });
        expect(full?.isActive).toBe(true);
        expect(drop?.isActive).toBe(false); // status = archived
    });

    it("projects variants incl. the transparent default (null quantity)", async () => {
        const variants = await readVariants(ctxFor(wellFormedRows()));
        const def = variants.find((v) => v.id === "var-2");
        expect(def?.quantityType).toBeNull();
        expect(def?.quantityValue).toBeNull();
    });

    it("reads pricing incl. revenue_category_id and normalizes payer_type", async () => {
        const rates = await readPricing(ctxFor(wellFormedRows()));
        expect(rates[0].revenueCategoryId).toBe("rev-1");
        expect(rates[0].payerType).toBe("private_pay");
        expect(rates[0].rateCents).toBe(180000);
    });

    it("projects products with scope, behavior, and one-time cadence (null)", async () => {
        const products = await readProducts(ctxFor(wellFormedRows()));
        expect(products[0].cadenceKey).toBeNull();
        expect(products[0].scope).toEqual({ programKey: "toddler", locationId: null });
        expect(products[0].behavior).toEqual({ required: true });
    });

    it("reads cadences via the option set (two-step)", async () => {
        const cadences = await readCadences(ctxFor(wellFormedRows()));
        expect(cadences.map((c) => c.cadenceKey)).toEqual(["monthly", "weekly"]);
    });

    it("returns empty cadences when the option set is not seeded", async () => {
        const rows = wellFormedRows();
        rows.option_sets = [];
        const cadences = await readCadences(ctxFor(rows));
        expect(cadences).toEqual([]);
    });

    it("maps revenue categories to GL accounts", async () => {
        const cats = await readRevenueCategories(ctxFor(wellFormedRows()));
        expect(cats[0].glAccountId).toBe("gl-1");
    });
});

describe("Commercial Export — composition & validation", () => {
    it("assembles a connected graph and validates clean for well-formed config", async () => {
        const { export: exp, validation } = await composeCommercialExport(ctxFor(wellFormedRows()));
        expect(exp.programs.length).toBe(2);
        expect(exp.offerings.length).toBe(2);
        expect(exp.policies).toEqual([]); // placeholder — no evaluation
        expect(exp.version.version).toMatch(/^[0-9a-f]+$/);
        expect(exp.version.effectiveOn).toBe("2026-09-01");
        expect(validation.ok).toBe(true);
        expect(validation.issues.every((i) => i.severity !== "error")).toBe(true);
    });

    it("produces a deterministic config version for identical config", async () => {
        const a = await composeCommercialExport(ctxFor(wellFormedRows()));
        const b = await composeCommercialExport(ctxFor(wellFormedRows()));
        expect(a.export.version.version).toBe(b.export.version.version);
    });

    it("flags a variant that references a missing offering (error)", async () => {
        const rows = wellFormedRows();
        rows.program_offering_variants = [
            { id: "var-x", offering_id: "off-missing", label: "Orphan", quantity_type: null, quantity_value: null, status: "active", is_active: true },
        ];
        const { validation } = await composeCommercialExport(ctxFor(rows));
        expect(validation.ok).toBe(false);
        expect(validation.issues.find((i) => i.code === "variant_unknown_offering")).toBeTruthy();
    });

    it("flags a rate referencing a missing variant and a missing revenue category (errors)", async () => {
        const rows = wellFormedRows();
        rows.commercial_tuition_rates = [
            {
                id: "rate-x",
                location_id: null,
                variant_id: "var-missing",
                cadence_key: "monthly",
                payer_type: "private_pay",
                rate_cents: 1000,
                not_offered: false,
                is_active: true,
                effective_start: null,
                effective_end: null,
                revenue_category_id: "rev-missing",
            },
        ];
        const { validation } = await composeCommercialExport(ctxFor(rows));
        const codes = validation.issues.map((i) => i.code);
        expect(codes).toContain("rate_unknown_variant");
        expect(codes).toContain("rate_unknown_revenue_category");
        expect(validation.ok).toBe(false);
    });

    it("warns on an unmapped revenue category (GL not set) without failing", async () => {
        const rows = wellFormedRows();
        rows.commercial_revenue_categories = [{ id: "rev-1", label: "Tuition Revenue", mapped_gl_account_id: null, is_active: true }];
        const { validation } = await composeCommercialExport(ctxFor(rows));
        expect(validation.issues.find((i) => i.code === "revenue_category_unmapped_gl")?.severity).toBe("warning");
        expect(validation.ok).toBe(true); // warnings do not fail the export
    });

    it("flags a revenue category mapped to a nonexistent GL account (error)", async () => {
        const rows = wellFormedRows();
        rows.gl_accounts = []; // gl-1 no longer exists
        const { validation } = await composeCommercialExport(ctxFor(rows));
        expect(validation.issues.find((i) => i.code === "revenue_category_unknown_gl")?.severity).toBe("error");
        expect(validation.ok).toBe(false);
    });
});
