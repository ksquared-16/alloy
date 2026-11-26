import { describe, expect, it } from "vitest";
import { defaultLeadQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import { normalizeQueueRecordLayoutConfig } from "@/lib/layout/runtime/normalizeQueueRecordLayoutConfig";
import { resolveQueueRecordField } from "@/lib/layout/runtime/queueRecordScopedResolve";

describe("normalizeQueueRecordLayoutConfig", () => {
    it("defaults fixedControls when missing from saved metadata", () => {
        const base = defaultLeadQueueLayoutV3();
        const withoutFixed = { ...base, fixedControls: undefined as unknown as typeof base.fixedControls };
        const normalized = normalizeQueueRecordLayoutConfig(withoutFixed);
        expect(normalized.fixedControls).toEqual({
            actionsMenu: true,
            workWithBos: true,
            actionRailStyle: "stacked",
        });
    });

    it("preserves explicit fixedControls opt-out", () => {
        const base = defaultLeadQueueLayoutV3();
        const withOptOut = {
            ...base,
            fixedControls: { actionsMenu: false, workWithBos: true, actionRailStyle: "compact" as const },
        };
        const normalized = normalizeQueueRecordLayoutConfig(withOptOut);
        expect(normalized.fixedControls).toEqual({
            actionsMenu: false,
            workWithBos: true,
            actionRailStyle: "compact",
        });
    });

    it("strips reserved variant rule conditions on normalize", () => {
        const base = defaultLeadQueueLayoutV3();
        const withReservedConditions = {
            ...base,
            variants: [
                {
                    id: "waitlist",
                    label: "Waitlist",
                    priority: 10,
                    appliesWhen: {
                        stage_key: ["waitlist"],
                        conditions: [{ type: "exists" as const, path: "sibling.names" }],
                    },
                    columns: base.columns,
                },
            ],
        };
        const normalized = normalizeQueueRecordLayoutConfig(withReservedConditions);
        expect(normalized.variants?.[0]?.appliesWhen).toEqual({ stage_key: ["waitlist"] });
    });

    it("defaults repeated block maxItems to 5 when missing", () => {
        const base = defaultLeadQueueLayoutV3();
        const childCol = base.columns.find((c) => c.scope.type === "repeated_related");
        expect(childCol).toBeTruthy();
        const repeat = childCol!.blocks[0];
        if (repeat?.type !== "repeated_record_block") throw new Error("expected repeat block");
        const withoutMax = {
            ...base,
            columns: base.columns.map((col) =>
                col.id === childCol!.id ?
                    {
                        ...col,
                        blocks: col.blocks.map((b) =>
                            b.type === "repeated_record_block" ? { ...b, maxItems: undefined } : b,
                        ),
                    }
                :   col,
            ),
        };
        const normalized = normalizeQueueRecordLayoutConfig(withoutMax);
        const normalizedRepeat = normalized.columns.find((c) => c.id === childCol!.id)!.blocks[0];
        expect(normalizedRepeat?.type === "repeated_record_block" ? normalizedRepeat.maxItems : null).toBe(5);
    });

    it("preserves explicit text display for status fields", () => {
        const base = defaultLeadQueueLayoutV3();
        const statusCol = base.columns.find((c) =>
            c.blocks.some(
                (b) => b.type === "field_group" && b.fields.some((f) => f.fieldKey === "opportunity.status_label"),
            ),
        );
        expect(statusCol).toBeTruthy();
        const withTextDisplay = {
            ...base,
            columns: base.columns.map((col) =>
                col.id === statusCol!.id ?
                    {
                        ...col,
                        blocks: col.blocks.map((b) =>
                            b.type === "field_group" ?
                                {
                                    ...b,
                                    fields: b.fields.map((f) =>
                                        f.fieldKey === "opportunity.status_label" ?
                                            { ...f, display: "text" as const }
                                        :   f,
                                    ),
                                }
                            :   b,
                        ),
                    }
                :   col,
            ),
        };
        const normalized = normalizeQueueRecordLayoutConfig(withTextDisplay);
        const block = normalized.columns.find((c) => c.id === statusCol!.id)!.blocks[0];
        if (block?.type !== "field_group") throw new Error("expected field group");
        expect(block.fields.find((f) => f.fieldKey === "opportunity.status_label")?.display).toBe("text");
    });

    it("preserves explicit badge display for status fields", () => {
        const base = defaultLeadQueueLayoutV3();
        const statusCol = base.columns.find((c) =>
            c.blocks.some(
                (b) => b.type === "field_group" && b.fields.some((f) => f.fieldKey === "opportunity.status_label"),
            ),
        );
        expect(statusCol).toBeTruthy();
        const withBadgeDisplay = {
            ...base,
            columns: base.columns.map((col) =>
                col.id === statusCol!.id ?
                    {
                        ...col,
                        blocks: col.blocks.map((b) =>
                            b.type === "field_group" ?
                                {
                                    ...b,
                                    fields: b.fields.map((f) =>
                                        f.fieldKey === "opportunity.status_label" ?
                                            { ...f, display: "badge" as const }
                                        :   f,
                                    ),
                                }
                            :   b,
                        ),
                    }
                :   col,
            ),
        };
        const normalized = normalizeQueueRecordLayoutConfig(withBadgeDisplay);
        const block = normalized.columns.find((c) => c.id === statusCol!.id)!.blocks[0];
        if (block?.type !== "field_group") throw new Error("expected field group");
        expect(block.fields.find((f) => f.fieldKey === "opportunity.status_label")?.display).toBe("badge");
    });

    it("preserves explicit repeated block maxItems when set", () => {
        const base = defaultLeadQueueLayoutV3();
        const childCol = base.columns.find((c) => c.scope.type === "repeated_related");
        const withThree = {
            ...base,
            columns: base.columns.map((col) =>
                col.id === childCol!.id ?
                    {
                        ...col,
                        blocks: col.blocks.map((b) =>
                            b.type === "repeated_record_block" ? { ...b, maxItems: 3 } : b,
                        ),
                    }
                :   col,
            ),
        };
        const normalized = normalizeQueueRecordLayoutConfig(withThree);
        const repeat = normalized.columns.find((c) => c.id === childCol!.id)!.blocks[0];
        expect(repeat?.type === "repeated_record_block" ? repeat.maxItems : null).toBe(3);
    });

    it("infers pill display for status fields missing display in saved JSON", () => {
        const base = defaultLeadQueueLayoutV3();
        const statusCol = base.columns.find((c) =>
            c.blocks.some(
                (b) => b.type === "field_group" && b.fields.some((f) => f.fieldKey === "opportunity.status_label"),
            ),
        );
        expect(statusCol).toBeTruthy();
        const block = statusCol!.blocks[0];
        if (block?.type !== "field_group") throw new Error("expected field group");
        const statusField = block.fields.find((f) => f.fieldKey === "opportunity.status_label");
        expect(statusField).toBeTruthy();
        const stripped = {
            ...base,
            columns: base.columns.map((col) =>
                col.id === statusCol!.id ?
                    {
                        ...col,
                        blocks: col.blocks.map((b) =>
                            b.type === "field_group" ?
                                {
                                    ...b,
                                    fields: b.fields.map((f) =>
                                        f.fieldKey === "opportunity.status_label" ?
                                            { ...f, display: undefined as unknown as typeof f.display }
                                        :   f,
                                    ),
                                }
                            :   b,
                        ),
                    }
                :   col,
            ),
        };
        const normalized = normalizeQueueRecordLayoutConfig(stripped as typeof base);
        const normalizedStatus = normalized.columns
            .find((c) => c.id === statusCol!.id)!
            .blocks[0];
        if (normalizedStatus?.type !== "field_group") throw new Error("expected field group");
        const field = normalizedStatus.fields.find((f) => f.fieldKey === "opportunity.status_label");
        expect(field?.display).toBe("pill");
    });
});

describe("queue record date field formatting", () => {
    it("formats child.date_of_birth as numeric DOB + age even when display is muted", () => {
        const field = {
            id: "dob",
            fieldKey: "child.date_of_birth",
            display: "muted" as const,
            inlineWithPrevious: true,
        };
        const resolved = resolveQueueRecordField(field, {
            "child.date_of_birth": "2024-03-15",
        } as never);
        expect(resolved.display).toMatch(/^3\/15\/2024 \(/);
        expect(resolved.display).not.toBe("2024-03-15");
        expect(resolved.display).not.toContain("Mar ");
    });

    it("formats child.date_of_birth with year even when date is in the current year", () => {
        const field = {
            id: "dob",
            fieldKey: "child.date_of_birth",
            display: "muted" as const,
            inlineWithPrevious: true,
        };
        const resolved = resolveQueueRecordField(field, {
            "child.date_of_birth": "2026-01-01",
        } as never);
        expect(resolved.display).toMatch(/^1\/1\/2026 \(/);
        expect(resolved.display).not.toBe("Jan 1");
        expect(resolved.display).not.toBe("2026-01-01");
    });
});
