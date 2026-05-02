import { describe, expect, it } from "vitest";
import { buildCrmCompactWorkUnitFactGroups } from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
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
            childrenLines: [{ primary: "Case Stale (2y)", programInline: "Young Toddler (12–24 mo)" }],
            childNameSingle: null,
            programSingle: null,
        });

        const ch = groups.find((g) => g.kind === "children_programs");
        expect(ch?.columnGrid?.headers).toEqual(["Child", "Program"]);
        expect(ch?.columnGrid?.rows).toEqual([["Case Stale (2y)", "Young Toddler (12–24 mo)"]]);
    });

    it("renders every child row with aligned programs", () => {
        const groups = buildCrmCompactWorkUnitFactGroups({
            row: {},
            want: wantAll,
            childrenLines: [
                { primary: "Liam Patel (4y 3mo)", programInline: "Infant (6–12 mo)" },
                { primary: "Mia Patel (3y 3mo)", programInline: "Infant (6–12 mo)" },
            ],
            childNameSingle: null,
            programSingle: null,
        });

        const ch = groups.find((g) => g.kind === "children_programs");
        expect(ch?.columnGrid?.rows).toEqual([
            ["Liam Patel (4y 3mo)", "Infant (6–12 mo)"],
            ["Mia Patel (3y 3mo)", "Infant (6–12 mo)"],
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
