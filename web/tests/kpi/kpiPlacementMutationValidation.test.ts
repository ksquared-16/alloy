import { describe, expect, it } from "vitest";
import { PlacementValidationError, validatePlacementCreateBody, validatePlacementPatchBody } from "@/lib/kpi/placementMutationValidation";

describe("validatePlacementCreateBody", () => {
    it("accepts workspace org metric", () => {
        const r = validatePlacementCreateBody({
            surface: "workspace",
            metric_key: "org.structure.departments_count",
            display_order: 1,
        });
        expect(r.metric_key).toBe("org.structure.departments_count");
        expect(r.department_id).toBeNull();
        expect(r.work_unit_id).toBeNull();
    });

    it("rejects unknown metric_key", () => {
        expect(() =>
            validatePlacementCreateBody({
                surface: "workspace",
                metric_key: "custom.bad.metric",
            })
        ).toThrow(PlacementValidationError);
    });

    it("rejects metric on wrong surface", () => {
        expect(() =>
            validatePlacementCreateBody({
                surface: "workspace",
                metric_key: "dept.wu_queue.total_per_work_unit",
            })
        ).toThrow(PlacementValidationError);
    });

    it("requires department scope for department surface", () => {
        expect(() =>
            validatePlacementCreateBody({
                surface: "department",
                metric_key: "dept.wu_queue.total_per_work_unit",
            })
        ).toThrow(PlacementValidationError);
    });

    it("accepts work_unit surface with department and work unit ids", () => {
        const r = validatePlacementCreateBody({
            surface: "work_unit",
            metric_key: "ctx.wu.total_in_queue",
            department_id: "00000000-0000-0000-0000-0000000000de",
            work_unit_id: "00000000-0000-0000-0000-0000000000wu",
        });
        expect(r.surface).toBe("work_unit");
        expect(r.metric_key).toBe("ctx.wu.total_in_queue");
    });
});

describe("validatePlacementPatchBody", () => {
    it("requires at least one field", () => {
        expect(() => validatePlacementPatchBody({ id: "abc" })).toThrow(PlacementValidationError);
    });

    it("accepts visibility patch", () => {
        const r = validatePlacementPatchBody({ id: "  uuid  ", is_visible: false });
        expect(r.id).toBe("uuid");
        expect(r.is_visible).toBe(false);
    });
});
