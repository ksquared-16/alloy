/** Layout refKey migration tests (Phase 6) */

import { describe, expect, it } from "vitest";
import { migrateLayoutConfigRefKeys } from "@/lib/layout/migrateStoredLayoutRefKeys";

describe("migrateStoredLayoutRefKeys", () => {
    it("rewrites deprecated child_inquiry refKeys in layout JSON", () => {
        const config = {
            sections: [
                {
                    items: [
                        { id: "1", kind: "field", refKey: "child_inquiry.desired_start_date", label: "Start" },
                        { id: "2", kind: "field", refKey: "child.first_name", label: "Name" },
                    ],
                },
            ],
        };
        const result = migrateLayoutConfigRefKeys(config);
        expect(result.changed).toBe(true);
        expect(config.sections[0].items[0].refKey).toBe("inquiry_child.desired_start_date");
        expect(config.sections[0].items[1].refKey).toBe("child.first_name");
    });

    it("rewrites child enrollment aliases to inquiry_child namespace", () => {
        const config = {
            items: [{ refKey: "child.desired_start_date" }, { refKey: "child.status" }],
        };
        migrateLayoutConfigRefKeys(config);
        expect(config.items[0].refKey).toBe("inquiry_child.desired_start_date");
        expect(config.items[1].refKey).toBe("inquiry_child.outcome_status_key");
    });
});
