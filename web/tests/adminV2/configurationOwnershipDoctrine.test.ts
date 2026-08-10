import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("configuration ownership doctrine — drift prevention", () => {
    it("statuses page does not own stage assignment", () => {
        const client = read("app/legacy-admin/system/statuses/StatusesClient.tsx");
        expect(client).not.toContain("Enrollment Stage");
        expect(client).not.toContain("enrollmentProcessStageSelectOptions");
        expect(client).not.toContain("mergeEnrollmentOperatorStageMetadata");
        expect(client).not.toContain("editEnrollmentStage");
        expect(client).toContain("ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH");
        expect(client).toContain("Open Business Processes");
    });

    it("queue membership editor does not own status assignment", () => {
        const editor = read("components/adminV2/settings/lifecycle/LifecycleStageQueueMembershipEditor.tsx");
        expect(editor).not.toContain("queue-membership-status-list");
        expect(editor).not.toContain("includedStatusFieldLabel");
        expect(read("lib/lifecycle/queueMembershipEditorModel.ts")).toContain(
            "queueMembershipWithSyncedStatusKeys"
        );
    });

    it("stage workspace has single status rollup surface and no duplicate sections", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("stage-membership-included-statuses");
        expect(workspace).toContain("STAGE_MEMBERSHIP_INCLUDED_STATUSES_LABEL");
        expect(workspace).toContain('id="operating_plan"');
        expect(workspace).toContain('id="operating_plan"');
        expect(read("components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx")).toContain(
            "LifecycleStageAttentionRulesEditor",
        );
        expect(workspace).not.toContain('id="actions"');
        expect(workspace).not.toContain("lifecycle-stage-section-queue-advanced");
        expect(workspace).not.toContain("BUSINESS_PROCESS_SECTION_ACTIONS");
        expect(workspace).not.toContain("BUSINESS_PROCESS_SECTION_QUEUE_ADVANCED");
    });

    it("process actions live only in process-level section not stage config", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("BusinessProcessActionsListColumn");
        const actionsWorkspace = read("components/adminV2/settings/businessProcess/BusinessProcessActionsQueueWorkspace.tsx");
        expect(actionsWorkspace).toContain("business-process-actions-list-column");
        expect(actionsWorkspace).toContain("BUSINESS_PROCESS_PROCESS_ACTIONS_TITLE");
        expect(board).not.toContain("actionsSection");
        const config = read("components/adminV2/settings/lifecycle/LifecycleStageConfiguration.tsx");
        expect(config).not.toContain("actionsSection");
        expect(config).not.toContain("enabledActionsCount");
    });

    it("stage requirements documents honest field source without claiming layout parity", () => {
        const editor = read("components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx");
        expect(editor).toContain("stage-requirements-field-source-note");
        expect(editor).toContain("BUSINESS_PROCESS_STAGE_REQUIREMENTS_FIELD_SOURCE_NOTE");
        expect(read("lib/lifecycle/lifecycleFieldPaletteMerge.ts")).toContain("field_definitions");
        expect(read("lib/lifecycle/businessProcessUiLabels.ts")).toContain(
            "stored separately from Layout placement"
        );
    });

    it("visible UI avoids lifecycle product naming in operator copy", () => {
        const matrix = read("components/adminV2/settings/lifecycle/LifecycleActionsMatrix.tsx");
        expect(matrix).toContain("Process Commands");
        expect(matrix).not.toContain("Lifecycle Actions");
        const strip = read(
            "components/adminV2/settings/businessProcess/BusinessProcessProcessSelectorStrip.tsx",
        );
        expect(strip).toContain("BUSINESS_PROCESS_SETTINGS_PAGE_TITLE");
        expect(strip).not.toContain(">Lifecycle<");
        const page = read("app/adminV2/settings/processes/page.tsx");
        expect(page).not.toContain(">Lifecycle<");
    });

    it("ownership doctrine doc exists and defines canonical owners", () => {
        const doc = readFileSync(resolve(root, "../docs/system/configuration-ownership-doctrine.md"), "utf8");
        expect(doc).toContain("Frozen ownership model");
        expect(doc).toContain("Processes");
        expect(doc).toContain("Surfaces");
        expect(doc).toContain("Frozen ownership model");
        expect(doc).toContain("Action definitions");
    });
});
