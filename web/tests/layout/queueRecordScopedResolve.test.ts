import { describe, expect, it } from "vitest";
import {
    assertChildScopedFieldKey,
    groupResolvedFieldsInline,
    resolveQueueRecordField,
    resolveQueueRecordFieldDisplay,
    resolveQueueRecordFieldsForRecord,
    resolveRepeatedRelatedRows,
    scopeAllowsFieldKey,
} from "@/lib/layout/runtime/queueRecordScopedResolve";
import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";

const childRowA: Record<string, unknown> = {
    id: "child-1",
    "child.id": "child-1",
    "child.name": "Alex Kelly",
    "child.age_band": "(6m)",
    "inquiry_child.status": "Active",
    "inquiry_child.program": "Toddler",
    "opportunity.status_key": "SHOULD_NOT_USE",
};

const childRowB: Record<string, unknown> = {
    id: "child-2",
    "child.id": "child-2",
    "child.name": "Liam Mitchell",
    "child.age_band": "(2y)",
    "inquiry_child.status": "Waitlist",
    "inquiry_child.program": "Preschool",
};

const mainRecord: Record<string, unknown> = {
    id: "opp-1",
    "opportunity.status_key": "Contact Attempted",
    _inquiry_children: [childRowA, childRowB],
};

function field(id: string, fieldKey: string, extra?: Partial<QueueRecordFieldConfig>): QueueRecordFieldConfig {
    return {
        id,
        fieldKey,
        display: "text",
        ...extra,
    };
}

describe("queueRecordScopedResolve", () => {
    it("resolves household name from fallback keys when configured key is empty", () => {
        const record = {
            name: "Mitchell household",
            "customer.display_name": "",
        };
        const resolved = resolveQueueRecordFieldDisplay(record as never, {
            id: "household",
            fieldKey: "customer.display_name",
            display: "link",
        });
        expect(resolved.display).toBe("Mitchell household");
        expect(resolved.isPlaceholder).toBe(false);
    });

    it("resolves customer.name config against customer.display_name on record", () => {
        const record = {
            "customer.display_name": "Lee Family",
        };
        const resolved = resolveQueueRecordFieldDisplay(record as never, {
            id: "household",
            fieldKey: "customer.name",
            display: "link",
        });
        expect(resolved.display).toBe("Lee Family");
    });

    it("resolves repeated children as separate scoped rows", () => {
        const rows = resolveRepeatedRelatedRows("children", mainRecord);
        expect(rows).toHaveLength(2);
        expect(rows[0]!["child.name"]).toBe("Alex Kelly");
        expect(rows[1]!["child.name"]).toBe("Liam Mitchell");
    });

    it("aligns child status and program to the same child row", () => {
        const fields = [
            field("name", "child.name", { display: "link" }),
            field("age", "child.age_band", { inlineWithPrevious: true }),
            field("status", "inquiry_child.status", { display: "pill" }),
            field("program", "inquiry_child.program"),
        ];
        const rowA = resolveQueueRecordFieldsForRecord(fields, childRowA as never);
        const rowB = resolveQueueRecordFieldsForRecord(fields, childRowB as never);
        expect(rowA.map((r) => r.display)).toEqual(["Alex Kelly", "(6m)", "Active", "Toddler"]);
        expect(rowB.map((r) => r.display)).toEqual(["Liam Mitchell", "(2y)", "Waitlist", "Preschool"]);
    });

    it("does not use opportunity status when resolving child-scoped status field", () => {
        const resolved = resolveQueueRecordField(field("status", "inquiry_child.status"), childRowA as never);
        expect(resolved.display).toBe("Active");
        expect(resolved.display).not.toBe("Contact Attempted");
    });

    it("groups inline fields on one row segment", () => {
        const fields = [
            field("name", "child.name"),
            field("age", "child.age_band", { inlineWithPrevious: true }),
        ];
        const resolved = resolveQueueRecordFieldsForRecord(fields, childRowA as never);
        const groups = groupResolvedFieldsInline(resolved);
        expect(groups).toHaveLength(1);
        expect(groups[0]).toHaveLength(2);
    });

    it("enforces child-scoped field keys in repeated related scope", () => {
        expect(assertChildScopedFieldKey("child.name", "children")).toBe(true);
        expect(assertChildScopedFieldKey("inquiry_child.program", "children")).toBe(true);
        expect(assertChildScopedFieldKey("opportunity.status_key", "children")).toBe(false);
        expect(scopeAllowsFieldKey({ type: "repeated_related", relationshipKey: "children" }, "child.name")).toBe(
            true,
        );
        expect(
            scopeAllowsFieldKey({ type: "repeated_related", relationshipKey: "children" }, "opportunity.status_key"),
        ).toBe(false);
    });
});
