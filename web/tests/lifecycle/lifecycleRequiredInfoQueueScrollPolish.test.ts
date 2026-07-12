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
            resolve(root, "../docs/sprints/archive/06_2026/lifecycle_required_info_child_fields_audit.md"),
            "utf8"
        );
        expect(doc).toContain("inquiry_child");
        expect(doc).toContain("opportunity_customer_members");
        expect(doc).toContain("Do not blindly merge");
        expect(read("lib/lifecycle/lifecycleFieldPaletteMerge.ts")).toContain(
            "lifecycle_required_info_child_fields_audit"
        );
    });

    it("queue view uses unified save in workspace mode", () => {
        const card = read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx");
        expect(card).toContain("workspaceMode");
        expect(card).toContain("onDraftNameDirtyChange");
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("workUnitRef");
        expect(workspace).toContain("Save stage");
        expect(workspace).not.toContain("lifecycle-guided-queue-scroll");
    });

    it("stage workspace uses accordion sections with summary headers", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("StageSection");
        expect(workspace).toContain("lifecycle-stage-section-");
        expect(workspace).toContain("BUSINESS_PROCESS_SECTION_REQUIRED_SUMMARY");
    });
});
