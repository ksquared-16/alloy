/**
 * The adoption check's "records in this process" counts journeys a person can see. A journey whose child
 * no longer exists appears in no lane before or after adoption, so it neither blocks adoption with its
 * stage nor inflates the count — it is reported separately.
 */
import { describe, expect, it } from "vitest";

import { observedProcessInstanceStages } from "@/lib/businessProcesses/configuration/observedProcessInstanceStages";

type Row = Record<string, unknown>;
function db(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            let rows = [...(tables[table] ?? [])];
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return api; },
                is: (c: string, v: unknown) => { rows = rows.filter((r) => (r[c] ?? null) === v); return api; },
                in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return api; },
                order: () => api,
                range: () => api,
                then: (res: (v: unknown) => void) => res({ data: rows, error: null }),
            };
            return api;
        },
    } as never;
}

const pi = (id: string, child: string, stage: string | null, over: Row = {}) => ({
    id, org_id: "org", process_key: "enrollment", subject_type: "child", subject_id: child, stage_key: stage, close_reason_key: null, ...over,
});

describe("observedProcessInstanceStages", () => {
    it("counts live journeys, and reports orphaned ones apart without their stages", async () => {
        const result = await observedProcessInstanceStages(
            db({
                process_instances: [
                    pi("a", "kid-1", "waitlist"),
                    pi("b", "kid-2", null),
                    pi("c", "gone-1", "legacy_stage"),
                    pi("d", "gone-2", null),
                    pi("e", "kid-1", "enrolled", { close_reason_key: "lost" }),
                    pi("f", "house-1", "lead", { subject_type: "household" }),
                ],
                customer_members: [
                    { id: "kid-1", org_id: "org" },
                    { id: "kid-2", org_id: "org" },
                ],
            }),
            { orgId: "org", processKey: "enrollment" },
        );
        expect(result).toEqual({ stage_keys: ["lead", "waitlist"], instance_count: 3, orphaned_instance_count: 2 });
    });
});
