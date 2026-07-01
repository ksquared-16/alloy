import { describe, expect, it } from "vitest";
import { migrateToQueueRecordLayoutV3 } from "@/lib/layout/queueRecordLayoutMigration";
import { defaultLeadQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";

describe("queueRecordLayoutMigration", () => {
    it("passes through v3 configs unchanged", () => {
        const v3 = defaultLeadQueueLayoutV3();
        const migrated = migrateToQueueRecordLayoutV3(v3, false);
        expect(migrated.version).toBe(3);
        expect(migrated.columns).toHaveLength(v3.columns.length);
    });

    it("migrates v2 role columns to scoped v3 columns", () => {
        const v2 = {
            variant: "operational-row",
            version: 2,
            fixedControls: { actionsMenu: true, workWithBos: true },
            columns: [
                {
                    id: "identity",
                    label: "Household",
                    width: "large",
                    role: "identity",
                    fields: [
                        {
                            id: "f1",
                            catalogId: "ref:customer.display_name",
                            refKey: "customer.display_name",
                            label: "Household",
                            type: "field",
                        },
                    ],
                },
                {
                    id: "related",
                    label: "Children",
                    width: "medium",
                    role: "related",
                    fields: [
                        {
                            id: "f2",
                            catalogId: "ref:child.name",
                            refKey: "child.name",
                            label: "Child",
                            type: "field",
                        },
                    ],
                },
            ],
        };
        const migrated = migrateToQueueRecordLayoutV3(v2, false);
        expect(migrated.version).toBe(3);
        expect(migrated.columns[0]?.scope.type).toBe("main_record");
        expect(migrated.columns[1]?.scope.type).toBe("repeated_related");
        expect(migrated.columns[1]?.blocks[0]?.type).toBe("repeated_record_block");
    });
});
