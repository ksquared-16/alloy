import { describe, expect, it } from "vitest";

import { resolveIdentityFieldRows } from "@/lib/adminV2/runtime/focusPanel/identity/resolveIdentityFieldRows";
import type { IdentityFieldPlacement } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

function placement(over: Partial<IdentityFieldPlacement> & { fieldRef: string }): IdentityFieldPlacement {
    return {
        fieldRef: over.fieldRef,
        tier: over.tier ?? "summary",
        row: over.row ?? 1,
        column: over.column ?? 1,
        width: over.width ?? "full",
        labelMode: over.labelMode,
        hideWhenEmpty: over.hideWhenEmpty,
        policy: over.policy,
    };
}

describe("resolveIdentityFieldRows", () => {
    it("keeps empty fields with hidden labels so placement shows —", () => {
        const rows = resolveIdentityFieldRows([
            {
                placement: placement({
                    fieldRef: "inquiry_child.location_id",
                    labelMode: "hidden",
                    row: 1,
                    column: 1,
                }),
                label: "Location",
                value: null,
                policy: "editable",
                editable: true,
            },
            {
                placement: placement({
                    fieldRef: "inquiry_child.program",
                    labelMode: "visible",
                    row: 2,
                    column: 1,
                }),
                label: "Program",
                value: "Toddler",
                policy: "editable",
                editable: true,
            },
        ]);

        expect(rows).toHaveLength(2);
        expect(rows[0]!.cells[0]!.fieldRef).toBe("inquiry_child.location_id");
        expect(rows[0]!.cells[0]!.value).toBeNull();
        expect(rows[1]!.cells[0]!.fieldRef).toBe("inquiry_child.program");
    });

    it("still drops empty fields when hideWhenEmpty is set", () => {
        const rows = resolveIdentityFieldRows([
            {
                placement: placement({
                    fieldRef: "inquiry_child.location_id",
                    labelMode: "hidden",
                    hideWhenEmpty: true,
                }),
                label: "Location",
                value: "   ",
                policy: "editable",
                editable: true,
            },
            {
                placement: placement({ fieldRef: "child.gender", row: 2 }),
                label: "Gender",
                value: "Female",
                policy: "read-only",
                editable: false,
            },
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0]!.cells[0]!.fieldRef).toBe("child.gender");
    });
});
