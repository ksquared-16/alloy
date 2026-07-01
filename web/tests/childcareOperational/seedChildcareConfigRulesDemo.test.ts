import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seedChildcareConfigRulesDemo } from "@/lib/dev/seedChildcareConfigRulesDemo";

type Result = { data: unknown; error: { message: string } | null };

/** Chainable Supabase mock; per-table results may be a queue consumed per terminal call. */
function makeSupabase(
    resultsByTable: Record<string, Result | Result[]>,
    inserts: Record<string, unknown[]>
): SupabaseClient {
    const next = (table: string): Result => {
        const entry = resultsByTable[table];
        if (Array.isArray(entry)) return entry.shift() ?? { data: null, error: null };
        return entry ?? { data: [], error: null };
    };
    const from = (table: string) => {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "contains", "order", "in"]) b[m] = () => b;
        b.insert = (payload: unknown) => {
            inserts[table] = inserts[table] ?? [];
            inserts[table].push(payload);
            return b;
        };
        b.maybeSingle = () => Promise.resolve(next(table));
        b.single = () => Promise.resolve(next(table));
        b.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(next(table)).then(resolve, reject);
        return b;
    };
    return { from: vi.fn(from) } as unknown as SupabaseClient;
}

describe("seedChildcareConfigRulesDemo", () => {
    it("is idempotent — skips when a demo ratio rule already exists", async () => {
        const supabase = makeSupabase(
            { childcare_ratio_rules: { data: { id: "existing" }, error: null } },
            {}
        );
        const result = await seedChildcareConfigRulesDemo(supabase, "org-1", "site-1");
        expect(result).toEqual({ ok: true, skipped: true });
    });

    it("seeds ratio (with tiers), operating windows, capacity, and schedule rules", async () => {
        const inserts: Record<string, unknown[]> = {};
        const supabase = makeSupabase(
            {
                childcare_ratio_rules: [
                    { data: null, error: null }, // idempotency check
                    { data: { id: "ratio-1" }, error: null }, // insert ... select single
                ],
                childcare_ratio_rule_tiers: { data: null, error: null },
                childcare_operating_windows: { data: null, error: null },
                childcare_capacity_rules: { data: null, error: null },
                childcare_schedule_rules: { data: null, error: null },
            },
            inserts
        );

        const result = await seedChildcareConfigRulesDemo(supabase, "org-1", "site-1");
        expect(result).toEqual({
            ok: true,
            skipped: false,
            summary: { ratioRules: 1, ratioTiers: 3, capacityRules: 1, operatingWindows: 5, scheduleRules: 1 },
        });

        const tierPayload = inserts.childcare_ratio_rule_tiers[0] as Array<Record<string, unknown>>;
        expect(tierPayload.map((t) => [t.max_children, t.required_staff])).toEqual([
            [5, 1],
            [11, 2],
            [16, 3],
        ]);
        const windowPayload = inserts.childcare_operating_windows[0] as Array<Record<string, unknown>>;
        expect(windowPayload.map((w) => w.weekday)).toEqual([1, 2, 3, 4, 5]);
    });

    it("returns an error result without throwing when an insert fails", async () => {
        const supabase = makeSupabase(
            {
                childcare_ratio_rules: [
                    { data: null, error: null },
                    { data: null, error: { message: "boom" } },
                ],
            },
            {}
        );
        const result = await seedChildcareConfigRulesDemo(supabase, "org-1", "site-1");
        expect(result).toEqual({ ok: false, error: "boom" });
    });
});
