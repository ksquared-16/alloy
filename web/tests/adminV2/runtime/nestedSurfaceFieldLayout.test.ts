import { describe, expect, it } from "vitest";

import {
    defaultNestedSurfaceConfig,
    fieldLayoutWidthForNestedGroup,
    reconcileNestedSurfaceConfig,
    setFieldLayoutWidthInNestedGroup,
    CHILDREN_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { chunkNestedSurfaceFieldsForHalfRowLayout } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import { childrenFocusRowsFromNestedConfig } from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";

describe("nestedSurfaceFieldLayout", () => {
    it("pairs consecutive half-width fields on one row", () => {
        const keys = ["child.first_name", "child.last_name", "inquiry_child.program"];
        const layout = (key: string) =>
            key === "child.first_name" || key === "child.last_name" ? "half" as const : "full" as const;

        expect(chunkNestedSurfaceFieldsForHalfRowLayout(keys, layout)).toEqual([
            ["child.first_name", "child.last_name"],
            ["inquiry_child.program"],
        ]);
    });

    it("pairs DOB + age on the same row", () => {
        const keys = ["child.date_of_birth", "child.dob_age", "child.room"];
        const layout = (key: string) =>
            key === "child.date_of_birth" || key === "child.dob_age" ? "half" as const : "full" as const;

        expect(chunkNestedSurfaceFieldsForHalfRowLayout(keys, layout)).toEqual([
            ["child.date_of_birth", "child.dob_age"],
            ["child.room"],
        ]);
    });

    it("keeps schedule blocks on full rows even when marked half", () => {
        const keys = ["inquiry_child.schedule_type", "child.start_date"];
        const layout = () => "half" as const;

        expect(chunkNestedSurfaceFieldsForHalfRowLayout(keys, layout)).toEqual([
            ["inquiry_child.schedule_type"],
            ["child.start_date"],
        ]);
    });

    it("persists field layout widths through reconcile", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.first_name", "half");
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.last_name", "half");

        const reconciled = reconcileNestedSurfaceConfig(CHILDREN_SURFACE_ID, config);
        expect(fieldLayoutWidthForNestedGroup(reconciled, "identity", "child.first_name")).toBe("half");
        expect(fieldLayoutWidthForNestedGroup(reconciled, "identity", "child.last_name")).toBe("half");
    });

    it("surfaces layout width on children focus rows after publish-shaped config", () => {
        let config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.first_name", "half");
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.last_name", "half");
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.date_of_birth", "half");
        config = setFieldLayoutWidthInNestedGroup(config, "identity", "child.dob_age", "half");

        const rows = childrenFocusRowsFromNestedConfig(reconcileNestedSurfaceConfig(CHILDREN_SURFACE_ID, config));
        const first = rows.find((row) => row.fieldKey === "child.first_name");
        const last = rows.find((row) => row.fieldKey === "child.last_name");
        const dob = rows.find((row) => row.fieldKey === "child.date_of_birth");
        const age = rows.find((row) => row.fieldKey === "child.dob_age");

        expect(first?.layoutWidth).toBe("half");
        expect(last?.layoutWidth).toBe("half");
        expect(dob?.layoutWidth).toBe("half");
        expect(age?.layoutWidth).toBe("half");
    });
});
