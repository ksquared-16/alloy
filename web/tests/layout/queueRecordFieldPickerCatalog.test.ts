import { describe, expect, it } from "vitest";

import {
    buildLeadLayoutPickerGroups,
    catalogGroupsForEntityType,
    CURATED_FIELDS,
    GLOBAL_WIDGET_CATALOG,
    LAYOUT_ENTITY_GROUPS,
} from "@/lib/layout/fieldCatalog";
import {
    buildQueueRecordFieldPickerGroups,
    buildQueueRecordPickerFieldsFromAllowList,
    queueRecordPickerVisibleRefKeys,
} from "@/lib/layout/queueRecordFieldPickerCatalog";
import {
    filterCatalogWidgetsForQueueRecord,
    isAllowedQueueRecordPickerWidgetKey,
    isAllowedQueueRecordWidgetKey,
    QUEUE_RECORD_PICKER_WIDGET_KEYS,
    QUEUE_RECORD_PIPELINE_WIDGET_KEYS,
} from "@/lib/layout/queueRecordLayoutAllowList";
import { defaultLeadQueueLayoutV3, createFieldGroupBlock, createWidgetBlock } from "@/lib/layout/queueRecordLayoutV3";
import { normalizeQueueRecordLayoutConfig } from "@/lib/layout/runtime/normalizeQueueRecordLayoutConfig";
import { validateQueueRecordLayoutConfig } from "@/lib/layout/runtime/validateQueueRecordLayoutConfig";
import {
    isValidatorAllowedQueueRecordFieldRefKey,
    validatorAllowedQueueRecordFieldRefKeys,
} from "@/lib/layout/queueRecordValidatorAllowList";

function leadOpportunitiesCatalogGroups() {
    const raw = LAYOUT_ENTITY_GROUPS.map((g) => ({
        entityKey: g.entityKey,
        entityLabel: g.entityLabel,
        fields: CURATED_FIELDS[g.entityKey] ?? [],
    }));
    return buildLeadLayoutPickerGroups(raw, "opportunities");
}

function buildQueuePicker(isWaitlist: boolean) {
    return buildQueueRecordFieldPickerGroups(leadOpportunitiesCatalogGroups(), isWaitlist);
}

function pickerRefKeys(isWaitlist: boolean): string[] {
    return queueRecordPickerVisibleRefKeys(leadOpportunitiesCatalogGroups(), isWaitlist).sort();
}

function pickerGroupLabels(isWaitlist: boolean): string[] {
    return buildQueuePicker(isWaitlist).map((g) => g.entityLabel);
}

describe("queue record field picker catalog", () => {
    it("waitlist Add Field picker includes Lead, Child, Contact, Status, Waitlist, and Work contexts", () => {
        const labels = pickerGroupLabels(true);
        expect(labels).toEqual(
            expect.arrayContaining([
                "Lead / Enrollment",
                "Candidate / Child",
                "Primary Contact",
                "Status / Lifecycle",
                "Waitlist / Placement",
                "Activity / Work",
            ]),
        );

        const refs = pickerRefKeys(true);
        expect(refs).toEqual(
            expect.arrayContaining([
                "customer.display_name",
                "child.name",
                "person.primary_contact_name",
                "opportunity.status_label",
                "waitlist.positionLabel",
                "waitlist.tierLabel",
                "queue_row.work_summary",
            ]),
        );
    });

    it("pipeline Add Field picker includes Lead, Child, Contact, Status, Work but excludes waitlist-only refs", () => {
        const labels = pickerGroupLabels(false);
        expect(labels).toEqual(
            expect.arrayContaining([
                "Lead / Enrollment",
                "Candidate / Child",
                "Primary Contact",
                "Status / Lifecycle",
                "Activity / Work",
            ]),
        );
        expect(labels).not.toContain("Waitlist / Placement");

        const refs = pickerRefKeys(false);
        expect(refs.some((k) => k.startsWith("waitlist."))).toBe(false);
        expect(refs.some((k) => k.startsWith("overrides."))).toBe(false);
        expect(refs).toEqual(
            expect.arrayContaining(["child.name", "person.phone", "opportunity.status_key", "queue_row.work_summary"]),
        );
    });

    it("picker-visible refs are generated from validator allow-list (full parity)", () => {
        for (const isWaitlist of [false, true] as const) {
            const allowed = validatorAllowedQueueRecordFieldRefKeys(isWaitlist);
            const visible = pickerRefKeys(isWaitlist);
            for (const refKey of visible) {
                expect(isValidatorAllowedQueueRecordFieldRefKey(refKey, isWaitlist)).toBe(true);
            }
            for (const refKey of allowed) {
                const contextClassifiable =
                    refKey.startsWith("waitlist.") || refKey.startsWith("overrides.")
                        ? isWaitlist
                        : true;
                if (contextClassifiable) {
                    expect(visible).toContain(refKey);
                }
            }
            expect(visible.length).toBe(
                allowed.filter((refKey) =>
                    refKey.startsWith("waitlist.") || refKey.startsWith("overrides.") ? isWaitlist : true,
                ).length,
            );
        }
    });

    it("legacy placement_candidate catalog fields are not in v3 picker unless validator-allowed", () => {
        const legacyWaitlist = catalogGroupsForEntityType("placement_candidate") ?? [];
        const legacyRefs = legacyWaitlist.flatMap((g) => g.fields.map((f) => f.refKey));
        const pipelineVisible = new Set(pickerRefKeys(false));
        const waitlistVisible = new Set(pickerRefKeys(true));

        expect(legacyRefs).toContain("household.phone");
        expect(pipelineVisible.has("household.phone")).toBe(false);
        expect(waitlistVisible.has("household.phone")).toBe(false);
    });

    it("picker groups are independent of column row context", () => {
        const catalog = leadOpportunitiesCatalogGroups();
        const pipelineA = buildQueueRecordFieldPickerGroups(catalog, false);
        const pipelineB = buildQueueRecordFieldPickerGroups(catalog, false);
        expect(pipelineA.map((g) => g.entityKey)).toEqual(pipelineB.map((g) => g.entityKey));
    });

    it("mixed-context fields in one column validate on pipeline rows", () => {
        const config = normalizeQueueRecordLayoutConfig(defaultLeadQueueLayoutV3());
        const householdCol = config.columns[0]!;
        const block = householdCol.blocks[0];
        if (!block || block.type === "widget") throw new Error("expected field group");

        const mixed = {
            ...config,
            columns: config.columns.map((c) =>
                c.id === householdCol.id ?
                    {
                        ...c,
                        blocks: c.blocks.map((b) =>
                            b.id === block.id && b.type !== "widget" ?
                                {
                                    ...b,
                                    fields: [
                                        ...b.fields,
                                        {
                                            id: "mixed-child",
                                            fieldKey: "child.name",
                                            display: "text" as const,
                                        },
                                    ],
                                }
                            :   b,
                        ),
                    }
                :   c,
            ),
        };

        const result = validateQueueRecordLayoutConfig(mixed, { isWaitlist: false });
        expect(result.ok).toBe(true);
    });

    it("widget picker includes Current Work, Attention, Activity Timeline but not Tasks (legacy)", () => {
        const pickerWidgets = filterCatalogWidgetsForQueueRecord(GLOBAL_WIDGET_CATALOG, false);
        const keys = pickerWidgets.map((w) => w.widgetKey);
        const labels = pickerWidgets.map((w) => w.label);
        expect(keys).toContain("current_work");
        expect(keys).toContain("activity_timeline");
        expect(keys).toContain("attention");
        expect(keys).not.toContain("tasks");
        expect(labels.some((l) => /legacy/i.test(l))).toBe(false);
        expect(QUEUE_RECORD_PICKER_WIDGET_KEYS).not.toContain("tasks");
        expect(isAllowedQueueRecordPickerWidgetKey("tasks")).toBe(false);
        expect(isAllowedQueueRecordWidgetKey("tasks", false)).toBe(true);
    });

    it("existing layout with tasks widget still validates and pipeline validator keeps tasks", () => {
        expect(QUEUE_RECORD_PIPELINE_WIDGET_KEYS).toContain("tasks");
        const config = normalizeQueueRecordLayoutConfig(defaultLeadQueueLayoutV3());
        const col = config.columns[3]!;
        const withTasks = {
            ...config,
            columns: config.columns.map((c) =>
                c.id === col.id ?
                    { ...c, blocks: [...c.blocks, createWidgetBlock("tasks", "Follow-ups")] }
                :   c,
            ),
        };
        const result = validateQueueRecordLayoutConfig(withTasks, { isWaitlist: false });
        expect(result.ok).toBe(true);
    });

    it("repeated_record_block still restricts fields to child scope at validation time", () => {
        const config = normalizeQueueRecordLayoutConfig(defaultLeadQueueLayoutV3());
        const childCol = config.columns.find((c) => c.scope.type === "repeated_related");
        if (!childCol) throw new Error("missing child column");

        const bad = {
            ...config,
            columns: config.columns.map((c) =>
                c.id === childCol.id ?
                    {
                        ...c,
                        blocks: c.blocks.map((b) =>
                            b.type === "repeated_record_block" ?
                                {
                                    ...b,
                                    fields: [
                                        ...b.fields,
                                        {
                                            id: "bad-opp",
                                            fieldKey: "opportunity.status_key",
                                            display: "text" as const,
                                        },
                                    ],
                                }
                            :   b,
                        ),
                    }
                :   c,
            ),
        };

        const result = validateQueueRecordLayoutConfig(bad, { isWaitlist: false });
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.message.includes("opportunity.status_key"))).toBe(true);
    });

    it("field_group blocks accept child fields on main_record row context column", () => {
        const base = normalizeQueueRecordLayoutConfig(defaultLeadQueueLayoutV3());
        const col = base.columns[0]!;
        const next = {
            ...base,
            columns: base.columns.map((c) =>
                c.id === col.id ?
                    {
                        ...c,
                        scope: { type: "main_record" as const },
                        blocks: [createFieldGroupBlock("Mixed"), ...c.blocks.slice(1)],
                    }
                :   c,
            ),
        };
        const mixedBlock = next.columns[0]!.blocks[0];
        if (mixedBlock.type !== "field_group") throw new Error("expected field group");
        mixedBlock.fields = [
            { id: "h", fieldKey: "customer.display_name", display: "text" as const },
            { id: "c", fieldKey: "child.name", display: "text" as const },
            { id: "p", fieldKey: "person.phone", display: "phone" as const },
            { id: "s", fieldKey: "opportunity.status_label", display: "badge" as const },
        ];

        const result = validateQueueRecordLayoutConfig(next, { isWaitlist: false });
        expect(result.ok).toBe(true);
    });

    it("buildQueueRecordPickerFieldsFromAllowList never exceeds validator allow-list", () => {
        const fields = buildQueueRecordPickerFieldsFromAllowList(leadOpportunitiesCatalogGroups(), false);
        const allowed = new Set(validatorAllowedQueueRecordFieldRefKeys(false));
        for (const field of fields) {
            expect(allowed.has(field.refKey)).toBe(true);
        }
    });
});

describe("queue record validator allow-list", () => {
    it("pipeline rejects waitlist-only refs", () => {
        expect(isValidatorAllowedQueueRecordFieldRefKey("waitlist.tierLabel", false)).toBe(false);
        expect(isValidatorAllowedQueueRecordFieldRefKey("waitlist.tierLabel", true)).toBe(true);
    });
});
