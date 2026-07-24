/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    diagnoseIneffectiveQueueRowFieldKeys,
    QUEUE_ROW_PUBLISH_INEFFECTIVE_FIELD_MESSAGE,
    validateQueueRecordLayoutConfig,
} from "@/lib/layout/runtime/validateQueueRecordLayoutConfig";
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
                width: "auto",
                builderSlot: "primary",
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
});
