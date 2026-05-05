import { describe, expect, it } from "vitest";
import {
    buildCrmCompactWorkUnitFactGroups,
    buildWorkUnitQueueCrmCompactRowSlice,
} from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import type { QueueUiRowPreviewField } from "@/lib/ui-v2/queueUiConfig";

const allFields: QueueUiRowPreviewField[] = [
    "title",
    "status",
    "primary_contact",
    "phone",
    "email",
    "child_name",
    "program",
    "desired_start_date",
    "tour_date",
];

function wantAll(f: QueueUiRowPreviewField): boolean {
    return allFields.includes(f);
}

function wantChildNoProgram(f: QueueUiRowPreviewField): boolean {
    return f !== "program" && allFields.includes(f);
}

describe("buildCrmCompactWorkUnitFactGroups (child columns)", () => {
    it("uses structured childrenLines for a single child so primary is not lost", () => {
        const groups = buildCrmCompactWorkUnitFactGroups({
            row: {},
            want: wantAll,
            childrenLines: [{ primary: "Case Stale (2y)", programInline: "Young Toddler — 18–24 months" }],
            childNameSingle: null,
            programSingle: null,
        });

        const ch = groups.find((g) => g.kind === "children_programs");
        expect(ch?.columnGrid?.headers).toEqual(["Child", "Program"]);
        expect(ch?.columnGrid?.rows).toEqual([["Case Stale (2y)", "Young Toddler — 18–24 months"]]);
    });

    it("renders every child row with aligned programs", () => {
        const groups = buildCrmCompactWorkUnitFactGroups({
            row: {},
            want: wantAll,
            childrenLines: [
                { primary: "Liam Patel (4y 3mo)", programInline: "Preschool — 3–4 years" },
                { primary: "Mia Patel (3y 3mo)", programInline: "Toddler — 2–3 years" },
            ],
            childNameSingle: null,
            programSingle: null,
        });

        const ch = groups.find((g) => g.kind === "children_programs");
        expect(ch?.columnGrid?.rows).toEqual([
            ["Liam Patel (4y 3mo)", "Preschool — 3–4 years"],
            ["Mia Patel (3y 3mo)", "Toddler — 2–3 years"],
        ]);
    });

    it("shows program column — when child row lacks program", () => {
        const groups = buildCrmCompactWorkUnitFactGroups({
            row: {},
            want: wantAll,
            childrenLines: [{ primary: "Alex (5y)", programInline: null }],
            childNameSingle: null,
            programSingle: null,
        });
        const ch = groups.find((g) => g.kind === "children_programs");
        expect(ch?.columnGrid?.rows?.[0]).toEqual(["Alex (5y)", "—"]);
    });

    it("child grid does not depend on program field gate — only Child column when program not in preview", () => {
        const groups = buildCrmCompactWorkUnitFactGroups({
            row: {},
            want: wantChildNoProgram,
            childrenLines: [
                { primary: "Liam", programInline: "Infant" },
                { primary: "Mia", programInline: "Infant" },
            ],
            childNameSingle: null,
            programSingle: null,
        });
        const ch = groups.find((g) => g.kind === "children_programs");
        expect(ch?.columnGrid?.headers).toEqual(["Child"]);
        expect(ch?.columnGrid?.rows).toEqual([["Liam"], ["Mia"]]);
    });

    it("falls back to childNameSingle when no structured lines", () => {
        const groups = buildCrmCompactWorkUnitFactGroups({
            row: {},
            want: wantAll,
            childrenLines: null,
            childNameSingle: "Solo Child",
            programSingle: "Program A",
        });
        const ch = groups.find((g) => g.kind === "children_programs");
        expect(ch?.columnGrid?.rows).toEqual([["Solo Child", "Program A"]]);
    });

    it("shows — for missing single child when gated but empty", () => {
        const groups = buildCrmCompactWorkUnitFactGroups({
            row: {},
            want: wantAll,
            childrenLines: null,
            childNameSingle: "",
            programSingle: "",
        });
        const ch = groups.find((g) => g.kind === "children_programs");
        expect(ch?.columnGrid?.rows).toEqual([["—", "—"]]);
    });
});

describe("buildWorkUnitQueueCrmCompactRowSlice (work-unit page path)", () => {
    it("uses _crm_compact_children from enrichment (customer_members–backed) when present", () => {
        const slice = buildWorkUnitQueueCrmCompactRowSlice(
            {
                id: "wu-row-1",
                _requested_program: "Young Toddler — 18–24 months",
                _child_display_name: "Case Stale (2y)",
                _crm_compact_children: [
                    { primary: "Case Stale (2y)", secondary: "Young Toddler — 18–24 months" },
                ],
            },
            wantAll,
            null
        );
        const ch = slice.crmFactGroups.find((g) => g.kind === "children_programs");
        expect(ch?.columnGrid?.columnKeys).toEqual(["child_name", "program"]);
        expect(ch?.columnGrid?.rows?.[0]?.[0]).toBe("Case Stale (2y)");
        expect(slice.childrenLinesForVm?.[0]?.primary).toBe("Case Stale (2y)");
    });

    it("fills Child from _child_display_name when _crm_compact_children is empty", () => {
        const slice = buildWorkUnitQueueCrmCompactRowSlice(
            {
                id: "wu-row-2",
                _child_display_name: "Alex Chen (5y)",
                _requested_program: "Pre-K · Ages 4–5",
                _crm_compact_children: [],
            },
            wantAll,
            null
        );
        const ch = slice.crmFactGroups.find((g) => g.kind === "children_programs");
        expect(ch?.columnGrid?.rows?.[0]?.[0]).toBe("Alex Chen (5y)");
    });

    it("exposes contact column keys for CSS width rules", () => {
        const slice = buildWorkUnitQueueCrmCompactRowSlice(
            {
                id: "wu-row-3",
                _primary_contact_line: "Sam Nguyen",
                _primary_phone: "+15551234567",
                _primary_email: "long.contact.name@parentschooldemo.org",
            },
            wantAll,
            null
        );
        const contact = slice.crmFactGroups.find((g) => g.kind === "contact");
        expect(contact?.columnGrid?.columnKeys).toEqual(["primary_contact", "phone", "email"]);
    });
});
