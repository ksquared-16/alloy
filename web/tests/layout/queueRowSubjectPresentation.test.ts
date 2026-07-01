import { describe, expect, it } from "vitest";
import {
    isQueueRowSubjectFieldVisible,
    normalizeQueueRowLabelForCompare,
    readQueueRowCaseDisplayLabel,
    shouldSuppressDuplicateCaseSubjectLabel,
    suppressDuplicateQueueRowSubjectOnRecord,
} from "@/lib/layout/runtime/queueRowSubjectPresentation";
import { resolveQueueRecordField } from "@/lib/layout/runtime/queueRecordScopedResolve";
import type { QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";

describe("queueRowSubjectPresentation", () => {
    it("normalizes labels for duplicate comparison", () => {
        expect(normalizeQueueRowLabelForCompare("  Smith   Household ")).toBe("smith household");
    });

    it("suppresses subject when it matches case display name", () => {
        expect(shouldSuppressDuplicateCaseSubjectLabel("Smith Household", "Smith Household")).toBe(true);
        expect(shouldSuppressDuplicateCaseSubjectLabel("Smith Household", "Riley Smith")).toBe(false);
    });

    it("removes empty queue_row.subject_label keys from doc-driven records", () => {
        const record = suppressDuplicateQueueRowSubjectOnRecord({
            "customer.display_name": "Smith Household",
            "queue_row.subject_label": "",
        });
        expect(record["queue_row.subject_label"]).toBeUndefined();
    });

    it("removes duplicate queue_row.subject_label from record overlay", () => {
        const record = suppressDuplicateQueueRowSubjectOnRecord({
            "customer.display_name": "Smith Household",
            "queue_row.subject_label": "Smith Household",
        });
        expect(record["queue_row.subject_label"]).toBeUndefined();
    });

    it("keeps distinct subject labels on record", () => {
        const record = suppressDuplicateQueueRowSubjectOnRecord({
            "customer.display_name": "Smith Household",
            "queue_row.subject_label": "Riley Smith",
        });
        expect(record["queue_row.subject_label"]).toBe("Riley Smith");
    });

    it("reads case label from household fields", () => {
        expect(readQueueRowCaseDisplayLabel({ name: "Legacy Family" })).toBe("Legacy Family");
        expect(
            readQueueRowCaseDisplayLabel({
                "customer.display_name": "Johnson Family",
                name: "Ignored",
            }),
        ).toBe("Johnson Family");
    });

    it("hides queue_row.subject_label field resolution when duplicate", () => {
        const field: QueueRecordFieldConfig = {
            id: "queue-row-subject-label",
            fieldKey: "queue_row.subject_label",
            display: "text",
        };
        const resolved = resolveQueueRecordField(field, {
            "customer.display_name": "Smith Household",
            "queue_row.subject_label": "Smith Household",
        });
        expect(resolved.visible).toBe(false);
    });

    it("isQueueRowSubjectFieldVisible returns false for duplicate labels", () => {
        expect(
            isQueueRowSubjectFieldVisible({
                "customer.display_name": "Smith Household",
                "queue_row.subject_label": "Smith Household",
            }, "queue_row.subject_label"),
        ).toBe(false);
        expect(
            isQueueRowSubjectFieldVisible({
                "customer.display_name": "Smith Household",
                "queue_row.subject_label": "Riley Smith",
            }, "queue_row.subject_label"),
        ).toBe(true);
    });
});
