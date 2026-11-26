/**
 * Layout V2 — current-presentation seed tests.
 *
 * Verifies the fallback contract (non-opportunity → null so the caller uses the
 * registry) and the queue conversion from a work-unit queue_definition.
 */

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seedLayoutDocFromCurrent } from "@/lib/layout/seedFromCurrentPresentation";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";

/** Minimal awaitable query stub: every chained method returns the same thenable. */
function stubSupabase(tableData: Record<string, unknown[]>): SupabaseClient {
    const make = (table: string) => {
        const result = Promise.resolve({ data: tableData[table] ?? [], error: null });
        const builder: Record<string, unknown> = {};
        for (const m of ["select", "eq", "is", "order", "limit"]) builder[m] = () => builder;
        // make the builder awaitable
        (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            result.then(res, rej);
        (builder as { maybeSingle: unknown }).maybeSingle = () => Promise.resolve({ data: null, error: null });
        return builder;
    };
    return { from: (table: string) => make(table) } as unknown as SupabaseClient;
}

describe("seedLayoutDocFromCurrent", () => {
    it("returns null for non-opportunity entities (→ registry fallback)", async () => {
        const sb = stubSupabase({});
        expect(await seedLayoutDocFromCurrent(sb, "org-1", "customers", "drawer")).toBeNull();
        expect(await seedLayoutDocFromCurrent(sb, "org-1", "jobs", "queue")).toBeNull();
    });

    it("returns null when the org has no opportunity field definitions (drawer)", async () => {
        const sb = stubSupabase({ field_definitions: [] });
        expect(await seedLayoutDocFromCurrent(sb, "org-1", "opportunities", "drawer")).toBeNull();
    });

    it("seeds a valid queue doc from a work-unit queue_definition row_preview", async () => {
        const sb = stubSupabase({
            work_units: [
                {
                    id: "wu-1",
                    name: "Leads",
                    queue_definition: {
                        version: 1,
                        entity_type: "opportunity",
                        queues: [{ key: "all", label: "All", filters: [] }],
                        ui: {
                            layout: "single_section",
                            row_preview: {
                                variant: "crm_compact",
                                fields: ["title", "status", "primary_contact", "phone", "start_date"],
                                actions: ["open", "call"],
                            },
                        },
                    },
                },
            ],
        });
        const doc = await seedLayoutDocFromCurrent(sb, "org-1", "opportunities", "queue");
        expect(doc).not.toBeNull();
        const res = parseLayoutDoc(doc);
        expect(res.ok, res.errors.join("; ")).toBe(true);
        const items = doc!.sections[0].rows[0].columns[0].items;
        // ordered fields preserved + actions appended as a widget placeholder
        expect(items.slice(0, 5).map((i) => i.refKey)).toEqual([
            "title",
            "status",
            "primary_contact",
            "phone",
            "start_date",
        ]);
        expect(items.find((i) => i.kind === "widget_placeholder")?.refKey).toBe("row_actions");
        expect(items.find((i) => i.refKey === "status")?.renderHint).toBe("status");
        expect(doc!.metadata?.seededFrom).toBe("current_presentation");
    });

    it("returns null queue when no opportunity work-unit queue exists", async () => {
        const sb = stubSupabase({ work_units: [] });
        expect(await seedLayoutDocFromCurrent(sb, "org-1", "opportunities", "queue")).toBeNull();
    });
});
