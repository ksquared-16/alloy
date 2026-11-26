import { describe, expect, it } from "vitest";

import { buildWorkItemBpLabelCatalogFromEntries } from "@/lib/workItems/workItemBpLabelCatalog";
import {
    isUuidLike,
    resolveWorkItemBpDisplayLabel,
    WORK_ITEM_BP_FALLBACK_PROCESS_LABEL,
} from "@/lib/workItems/workItemBpDisplayLabel";
import { resolveWorkItemProcessLabel } from "@/lib/workItems/workItemBpProvenance";

const DEPT_UUID = "3933ac47-077a-4de8-aaac-8aed48d80413";

describe("work item BP display labels", () => {
    it("detects uuid-like keys", () => {
        expect(isUuidLike(DEPT_UUID)).toBe(true);
        expect(isUuidLike("enrollment")).toBe(false);
    });

    it("uses lifecycle catalog labels when available", () => {
        const catalog = buildWorkItemBpLabelCatalogFromEntries([
            {
                id: "dept:enrollment:proc",
                config_source: "builder_owned",
                department_id: DEPT_UUID,
                department_key: "enrollment",
                department_name: "Enrollment Department",
                process_id: "proc-1",
                process_key: "enrollment",
                lifecycle_name: "Enrollment",
                source: "builder_owned",
                stage_count: 3,
                track_count: 1,
                work_unit_count: 1,
                workspace: { tile_name: "Enrollment" },
                validation: { status: "ok", detail: null },
            } as never,
        ]);
        expect(catalog.processLabels[DEPT_UUID]).toBe("Enrollment");
        expect(resolveWorkItemBpDisplayLabel(DEPT_UUID, catalog.processLabels)).toBe("Enrollment");
    });

    it("never renders a raw uuid as the visible process label", () => {
        expect(resolveWorkItemBpDisplayLabel(DEPT_UUID, {})).toBe(WORK_ITEM_BP_FALLBACK_PROCESS_LABEL);
        expect(resolveWorkItemProcessLabel({ department_id: DEPT_UUID }, { processLabels: {} })).toBe(
            WORK_ITEM_BP_FALLBACK_PROCESS_LABEL,
        );
        expect(resolveWorkItemBpDisplayLabel(DEPT_UUID, { [DEPT_UUID]: DEPT_UUID })).toBe(
            WORK_ITEM_BP_FALLBACK_PROCESS_LABEL,
        );
    });

    it("humanizes non-uuid keys when catalog is unavailable", () => {
        expect(resolveWorkItemBpDisplayLabel("enrollment_pipeline", {})).toBe("Enrollment Pipeline");
    });
});
