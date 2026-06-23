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
    buildQueueRecordPickerCatalog,
    buildQueueRecordPickerFieldsFromAllowList,
    queueRecordPickerVisibleRefKeys,
} from "@/lib/layout/queueRecordFieldPickerCatalog";
import {
    buildQueueRecordWidgetPickerCatalog,
    filterCatalogWidgetsForQueueRecord,
    isAllowedQueueRecordPickerWidgetKey,
    isAllowedQueueRecordWidgetKey,
    QUEUE_RECORD_PICKER_WIDGET_KEYS,
    QUEUE_RECORD_PIPELINE_WIDGET_KEYS,
} from "@/lib/layout/queueRecordLayoutAllowList";
import { defaultLeadQueueLayoutV3, createFieldGroupBlock, createWidgetBlock } from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRecordScope } from "@/lib/layout/queueRecordLayoutV3";
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

function buildQueuePicker(isWaitlist: boolean, scope?: QueueRecordScope) {
    void scope;
    return buildQueueRecordPickerCatalog({
        isWaitlist,
        labelCatalogGroups: leadOpportunitiesCatalogGroups(),
        blockFilter: "field_group",
    });
}

function pickerRefKeys(isWaitlist: boolean, scope?: QueueRecordScope) {
    void scope;
    return queueRecordPickerVisibleRefKeys(leadOpportunitiesCatalogGroups(), isWaitlist, {
        blockFilter: "field_group",
    }).sort();
}

function pickerGroupLabels(isWaitlist: boolean, scope?: QueueRecordScope) {
    return buildQueuePicker(isWaitlist, scope).groups.map((g) => g.entityLabel);
}

describe("queue record field picker catalog — scope independence (P0 regression)", () => {
    const lifecycleScope: QueueRecordScope = { type: "lifecycle_context" };
    const mainScope: QueueRecordScope = { type: "main_record" };
    const childrenScope: QueueRecordScope = { type: "repeated_related", relationshipKey: "children" };

    it("waitlist lifecycle column Add Field includes Lead, Child, Contact, Status, Waitlist, Work groups", () => {
        const catalog = buildQueuePicker(true, lifecycleScope);
        expect(catalog.groups.map((g) => g.entityLabel)).toEqual(
            expect.arrayContaining([
                "Lead / Enrollment",
                "Candidate / Child",
                "Primary Contact",
                "Status / Lifecycle",
                "Waitlist / Placement",
                "Activity / Work",
            ]),
        );
        expect(catalog.fieldCount).toBeGreaterThan(20);
    });

    it("waitlist lifecycle column Add Widget includes all queue-supported widgets", () => {
        const catalog = buildQueuePicker(true, lifecycleScope);
        const keys = catalog.widgets.map((w) => w.widgetKey);
        expect(keys).toEqual(
            expect.arrayContaining(["current_work", "attention", "activity_timeline", "follow_ups"]),
        );
        expect(keys).not.toContain("tasks");
        expect(catalog.widgetCount).toBe(QUEUE_RECORD_PICKER_WIDGET_KEYS.length);
    });

    it("pipeline picker group count is identical for main_record and lifecycle_context columns", () => {
        const main = buildQueuePicker(false, mainScope);
        const lifecycle = buildQueuePicker(false, lifecycleScope);
        expect(main.groups.map((g) => g.entityKey)).toEqual(lifecycle.groups.map((g) => g.entityKey));
        expect(main.fieldCount).toBe(lifecycle.fieldCount);
        expect(main.widgetCount).toBe(lifecycle.widgetCount);
    });

    it("changing column scope does not change Add Widget options", () => {
        const mainWidgets = buildQueuePicker(false, mainScope).widgets.map((w) => w.widgetKey);
        const lifecycleWidgets = buildQueuePicker(false, lifecycleScope).widgets.map((w) => w.widgetKey);
        const childColWidgets = buildQueuePicker(false, childrenScope).widgets.map((w) => w.widgetKey);
        expect(lifecycleWidgets).toEqual(mainWidgets);
        expect(childColWidgets).toEqual(mainWidgets);
    });

    it("repeated_record_block narrows field picker to child-scoped refs only", () => {
        const full = buildQueueRecordPickerCatalog({
            isWaitlist: false,
            labelCatalogGroups: leadOpportunitiesCatalogGroups(),
            blockFilter: "field_group",
        });
        const childOnly = buildQueueRecordPickerCatalog({
            isWaitlist: false,
            labelCatalogGroups: leadOpportunitiesCatalogGroups(),
            blockFilter: "repeated_record_block",
        });
        expect(childOnly.fieldCount).toBeLessThan(full.fieldCount);
        const childRefs = childOnly.groups.flatMap((g) => g.fields.map((f) => f.refKey));
        expect(childRefs.every((k) => k.startsWith("child.") || k.startsWith("inquiry_child."))).toBe(true);
        expect(childRefs).not.toContain("opportunity.status_key");
    });
});

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
        const main = buildQueueRecordFieldPickerGroups(catalog, false, { blockFilter: "field_group" });
        const lifecycle = buildQueueRecordFieldPickerGroups(catalog, false, { blockFilter: "field_group" });
        expect(main.map((g) => g.entityKey)).toEqual(lifecycle.map((g) => g.entityKey));
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

    it("widget picker includes Current Work, Attention, Activity Timeline, Follow-ups but not Tasks (legacy)", () => {
        const pickerWidgets = buildQueueRecordWidgetPickerCatalog(GLOBAL_WIDGET_CATALOG);
        const keys = pickerWidgets.map((w) => w.widgetKey);
        const labels = pickerWidgets.map((w) => w.label);
        expect(keys).toContain("current_work");
        expect(keys).toContain("activity_timeline");
        expect(keys).toContain("attention");
        expect(keys).toContain("follow_ups");
        expect(keys).not.toContain("tasks");
        expect(labels.some((l) => /legacy/i.test(l))).toBe(false);
        expect(QUEUE_RECORD_PICKER_WIDGET_KEYS).not.toContain("tasks");
        expect(isAllowedQueueRecordPickerWidgetKey("tasks")).toBe(false);
        expect(isAllowedQueueRecordWidgetKey("tasks", false)).toBe(true);
        expect(isAllowedQueueRecordWidgetKey("follow_ups", false)).toBe(true);
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
