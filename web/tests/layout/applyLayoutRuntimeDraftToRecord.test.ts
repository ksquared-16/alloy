import { describe, expect, it } from "vitest";
import { applyLayoutRuntimeDraftToRecord } from "@/lib/layout/runtime/applyLayoutRuntimeDraftToRecord";

describe("applyLayoutRuntimeDraftToRecord", () => {
    it("merges person contact and child repeater draft onto record", () => {
        const record = {
            id: "opp-1",
            first_name: "Pat",
            last_name: "Lee",
            children: [
                {
                    customer_member_id: "cm-1",
                    "child.first_name": "Sam",
                    "child.last_name": "Lee",
                },
            ],
        };
        const baseline = {
            first_name: "Pat",
            last_name: "Lee",
            "row-0::child.first_name": "Sam",
            "row-0::child.last_name": "Lee",
        };
        const draft = {
            first_name: "Patricia",
            last_name: "Lee",
            "row-0::child.first_name": "Samuel",
            "row-0::child.last_name": "Lee",
        };

        const next = applyLayoutRuntimeDraftToRecord({
            record,
            baseline,
            draft,
            rowKeys: ["row-0"],
            rows: [record.children![0] as Record<string, unknown>],
        });

        expect(next.first_name).toBe("Patricia");
        expect((next.children as Record<string, unknown>[])[0]?.["child.first_name"]).toBe("Samuel");
        expect(next._primary_person_name).toContain("Patricia");
    });
});
