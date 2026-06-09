import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    DEFAULT_LEAD_ENROLLMENT_GRID_CELL_ROLES,
    ENROLLMENT_GRID_CELL_ROLES_METADATA_KEY,
    enrollmentGridColumnIsEditable,
    enrollmentRosterReadFirstActive,
    readEnrollmentGridCellRole,
} from "@/lib/layout/runtime/enrollmentGridPresentation";

describe("enrollmentGridPresentation", () => {
    it("reads cell roles from layout item metadata", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const section = doc.sections.find((s) => s.key === "children_enrollment");
        const item = section!.rows[0]!.columns[0]!.items[0]!;
        expect(item.metadata?.[ENROLLMENT_GRID_CELL_ROLES_METADATA_KEY]).toEqual(
            DEFAULT_LEAD_ENROLLMENT_GRID_CELL_ROLES,
        );
        const nameCol = (item as { columns: { refKey: string; renderHint?: string; adornment?: unknown }[] }).columns.find(
            (c) => c.refKey === "child.name",
        )!;
        expect(readEnrollmentGridCellRole(item, nameCol)).toBe("primary_link");
    });

    it("treats aliased enrollment columns as editable when save adapter exists", () => {
        expect(enrollmentGridColumnIsEditable({ refKey: "child.program", label: "Program" })).toBe(true);
        expect(enrollmentGridColumnIsEditable({ refKey: "child.desired_start_date", label: "Start" })).toBe(true);
    });

    it("defaults roster to read-first under composition hint", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const item = doc.sections.find((s) => s.key === "children_enrollment")!.rows[0]!.columns[0]!.items[0]!;
        expect(enrollmentRosterReadFirstActive(item, true)).toBe(true);
        expect(enrollmentRosterReadFirstActive(item, false)).toBe(false);
    });
});
