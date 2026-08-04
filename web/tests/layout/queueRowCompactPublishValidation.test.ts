/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    diagnoseIneffectiveQueueRowFieldKeys,
    diagnoseIneffectiveQueueRowFields,
    QUEUE_ROW_PUBLISH_INEFFECTIVE_FIELD_MESSAGE,
    validateQueueRecordLayoutConfig,
} from "@/lib/layout/runtime/validateQueueRecordLayoutConfig";
import { isCompactRowEffectiveFieldKey } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { emptyQueueRowLayoutV3 } from "@/lib/layout/queueRecordLayoutDefaults";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import { nextQueueRecordBlockId } from "@/lib/layout/queueRecordLayoutIds";

function layoutWithFields(fieldKeys: string[]): QueueRecordLayoutConfigV3 {
    const base = emptyQueueRowLayoutV3();
    return {
        ...base,
        columns: [
            {
                id: "col-1",
                label: "Primary",
                width: "small",
                scope: { type: "main_record" } as const,
                builderSlot: "identity",
                blocks: [
                    {
                        id: nextQueueRecordBlockId("fg"),
                        type: "field_group",
                        title: null,
                        fields: fieldKeys.map((fieldKey) => ({
                            id: nextQueueRecordBlockId("f"),
                            fieldKey,
                            label: fieldKey,
                        })),
                    },
                ],
            },
        ],
    };
}

describe("queue row compact publish validation", () => {
    it("rejects non-compact-effective fields when requireCompactRowEffectiveFields is set", () => {
        const result = validateQueueRecordLayoutConfig(layoutWithFields(["opportunity.location"]), {
            requireCompactRowEffectiveFields: true,
        });
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.message.includes(QUEUE_ROW_PUBLISH_INEFFECTIVE_FIELD_MESSAGE))).toBe(
            true,
        );
    });

    it("allows compact-effective contact/status fields on publish", () => {
        const result = validateQueueRecordLayoutConfig(
            layoutWithFields(["person.primary_contact_name", "opportunity.status_label"]),
            {
                requireCompactRowEffectiveFields: true,
            },
        );
        expect(result.ok).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it("warns (does not reject) non-compact fields without the publish flag", () => {
        const result = validateQueueRecordLayoutConfig(layoutWithFields(["opportunity.location"]));
        expect(result.ok).toBe(true);
        expect(result.warnings.some((w) => w.message.includes("opportunity.location"))).toBe(true);
    });

    it("diagnoseIneffectiveQueueRowFieldKeys lists non-compact keys", () => {
        expect(
            diagnoseIneffectiveQueueRowFieldKeys(
                layoutWithFields(["person.primary_contact_name", "opportunity.location"]),
            ),
        ).toEqual(["opportunity.location"]);
    });

    it("allows children summary vocabulary and program_category aliases on compact publish", () => {
        for (const key of [
            "children",
            "children.count",
            "children.names",
            "children.summary",
            "inquiry_child.program",
            "inquiry_child.program_category",
            "inquiry_child.program_category_id",
        ]) {
            expect(isCompactRowEffectiveFieldKey(key), key).toBe(true);
            expect(diagnoseIneffectiveQueueRowFieldKeys(layoutWithFields([key]))).toEqual([]);
        }
        // Contact + Children must publish under the compact flag (allow-list + effectiveness).
        const mixed = validateQueueRecordLayoutConfig(
            layoutWithFields(["person.primary_contact_name", "children.count", "inquiry_child.program_category"]),
            { requireCompactRowEffectiveFields: true },
        );
        expect(mixed.ok).toBe(true);
    });

    it("diagnoseIneffectiveQueueRowFields names the exact field and variant", () => {
        const base = layoutWithFields(["children"]);
        const layout = {
            ...base,
            variants: [
                {
                    id: "waitlist",
                    label: "Waitlist",
                    priority: 1,
                    columns: [
                        {
                            id: "col-v",
                            label: "Primary",
                            width: "small" as const,
                            scope: { type: "main_record" } as const,
                            builderSlot: "identity" as const,
                            blocks: [
                                {
                                    id: nextQueueRecordBlockId("fg"),
                                    type: "field_group" as const,
                                    title: null,
                                    fields: [
                                        {
                                            id: nextQueueRecordBlockId("f"),
                                            fieldKey: "opportunity.location",
                                            label: "Campus",
                                            display: "text",
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
                {
                    id: "tour",
                    label: "Tour",
                    priority: 2,
                    columns: [],
                },
            ],
        };
        const issues = diagnoseIneffectiveQueueRowFields(layout);
        expect(issues).toHaveLength(1);
        expect(issues[0]?.fieldKey).toBe("opportunity.location");
        expect(issues[0]?.fieldLabel).toBe("Campus");
        expect(issues[0]?.variantKey).toBe("waitlist");
        expect(issues[0]?.message).toContain("Campus");
        expect(issues[0]?.message).toContain("waitlist");
        expect(issues[0]?.message).not.toMatch(/for example Children/i);
    });
});
