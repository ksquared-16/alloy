import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle required info queue scroll polish", () => {
    it("removes conditional rules copy from Required Information UI", () => {
        const editor = read("components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx");
        expect(editor).not.toContain("lifecycle-conditional-rules-note");
        expect(editor).not.toContain("Email or Phone");
        expect(editor).not.toContain("DOB or Age Group");
        expect(read("lib/lifecycle/lifecycleConfiguration.ts")).not.toContain(
            "LIFECYCLE_CONDITIONAL_RULES_NOTE"
        );
    });

    it("uses entity dropdown instead of tabs", () => {
        const editor = read("components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx");
        expect(editor).toContain("lifecycle-field-entity-select");
        expect(editor).not.toContain("lifecycle-field-entity-tabs");
        expect(editor).not.toContain("lifecycle-field-entity-tab-person");
    });

    it("child field source audit doc exists", () => {
        const doc = readFileSync(
            resolve(root, "../docs/sprints/06_2026/lifecycle_required_info_child_fields_audit.md"),
            "utf8"
        );
        expect(doc).toContain("inquiry_child");
        expect(doc).toContain("opportunity_customer_members");
        expect(doc).toContain("Do not blindly merge");
        expect(read("lib/lifecycle/lifecycleFieldPaletteMerge.ts")).toContain(
            "lifecycle_required_info_child_fields_audit"
        );
    });

    it("Work Unit Queue has single save in guided mode via card footer", () => {
        const card = read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx");
        expect(card).toContain("guidedMode");
        expect(card).toContain("lifecycle-work-unit-save-name");
        expect(card).toContain("!guidedMode");
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).toContain("workUnitRef");
        expect(guided).toContain('primaryLabel="Save Work Unit Queue"');
        expect(guided).not.toContain("lifecycle-guided-queue-scroll");
    });

    it("guided card bodies use overscroll containment and fixed footer", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).toContain("GUIDED_CARD_BODY_CLASS");
        expect(guided).toContain("overscroll-contain");
        expect(guided).toContain("[overscroll-behavior:contain]");
        expect(guided).toContain("lifecycle-guided-save-${stepId}");
        expect(guided).toContain("shrink-0 border-t");
    });

    it("guided required card keeps minimal summary copy", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).toContain("Fields needed before work can move forward.");
    });
});
