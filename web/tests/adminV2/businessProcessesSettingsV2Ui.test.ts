import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    QUEUE_MEMBERSHIP_COUNT_UNIT_FIELD_LABEL,
    QUEUE_MEMBERSHIP_SUBJECT_FIELD_LABEL,
    QUEUE_MEMBERSHIP_SUBJECT_LABELS,
    STAGE_MEMBERSHIP_INCLUDED_STATUSES_LABEL,
} from "@/lib/lifecycle/queueMembershipUiLabels";
import {
    BUSINESS_PROCESS_PROCESS_ACTIONS_TITLE,
    BUSINESS_PROCESS_SECTION_MEMBERSHIP,
    BUSINESS_PROCESS_SECTION_OPERATING_PLAN,
    BUSINESS_PROCESS_SECTION_READY,
    BUSINESS_PROCESS_SECTION_REQUIRED,
} from "@/lib/lifecycle/businessProcessUiLabels";
import { ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Business Processes Settings V2 — operator UI", () => {
    it("settings index links Business Processes to canonical route", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain("CONFIGURATION_WORKSPACE_DOMAINS");
        const domains = read("lib/adminV2/configurationWorkspaceDomains.ts");
        expect(domains).toContain("/admin/settings/business-processes");
        expect(page).not.toContain('href="/admin/settings/lifecycle"');
    });

    it("business-processes page renders Business Processes title", () => {
        const page = read("app/adminV2/settings/business-processes/page.tsx");
        expect(page).toContain("BUSINESS_PROCESS_SETTINGS_PAGE_TITLE");
        expect(page).toContain('data-testid="settings-business-processes-page"');
    });

    it("legacy lifecycle route redirects to business-processes", () => {
        const page = read("app/adminV2/settings/lifecycle/page.tsx");
        expect(page).toContain("redirect");
        expect(page).toContain(ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH);
        expect(page).not.toContain("LifecycleSettingsShell");
    });

    it("breadcrumb maps business-processes and legacy lifecycle to Business Processes", () => {
        const breadcrumb = read("app/adminV2/settings/SettingsHierarchyBreadcrumb.tsx");
        expect(breadcrumb).toContain('"/business-processes"');
        expect(breadcrumb).toContain('label: "Business Processes"');
        expect(breadcrumb).toContain('"/lifecycle"');
    });

    it("does not expose legacy membership vocabulary in stage editor", () => {
        const editor = read("components/adminV2/settings/lifecycle/LifecycleStageQueueMembershipEditor.tsx");
        expect(editor).toContain("QUEUE_MEMBERSHIP_SUBJECT_FIELD_LABEL");
        expect(editor).toContain("QUEUE_MEMBERSHIP_COUNT_UNIT_FIELD_LABEL");
        expect(editor).not.toContain("Record type");
        expect(editor).not.toContain("Counts as");
        expect(editor).not.toContain("Case status");
        expect(editor).not.toContain("Family case");
        expect(editor).not.toContain("queue-membership-status-list");
    });

    it("stage workspace has single included statuses area without CRM copy", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("STAGE_MEMBERSHIP_INCLUDED_STATUSES_LABEL");
        expect(workspace).not.toContain("CRM statuses");
        expect(workspace).not.toContain("Status rollups");
        expect(workspace).toContain("BUSINESS_PROCESS_SECTION_REQUIRED");
    });

    it("renames lifecycle actions to process commands", () => {
        const matrix = read("components/adminV2/settings/lifecycle/LifecycleActionsMatrix.tsx");
        expect(matrix).toContain("Process Commands");
        expect(matrix).not.toContain("Lifecycle Actions");
        expect(matrix).not.toContain("Save lifecycle actions");
        const actionsWorkspace = read(
            "components/adminV2/settings/businessProcess/BusinessProcessActionsQueueWorkspace.tsx",
        );
        expect(actionsWorkspace).toContain("BUSINESS_PROCESS_PROCESS_ACTIONS_TITLE");
        expect(actionsWorkspace).toContain("business-process-actions-list-column");
        const labels = read("lib/lifecycle/businessProcessUiLabels.ts");
        expect(labels).toContain('BUSINESS_PROCESS_PROCESS_ACTIONS_TITLE = "Process Commands"');
        expect(labels).toContain('BUSINESS_PROCESS_NAV_ACTIONS = "Commands"');
    });

    it("renders Family Track and Child Track explainer for enrollment", () => {
        const explainer = read("components/adminV2/settings/lifecycle/BusinessProcessTrackExplainer.tsx");
        expect(explainer).toContain("business-process-track-explainer");
        expect(explainer).toContain("Family Track");
        expect(explainer).toContain("Child Track");
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("BusinessProcessTrackExplainer");
        expect(board).toContain("At Decision, choose a path for each child");
    });

    it("settings index reduces editable prefix repetition", () => {
        const modes = read("lib/adminV2/settingsSurfaceModes.ts");
        expect(modes).toContain('if (mode === "editable") return ""');
    });

    it("stage requirements helper documents separate field source", () => {
        const editor = read("components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx");
        expect(editor).toContain("stage-requirements-helper");
        expect(editor).toContain("BUSINESS_PROCESS_STAGE_REQUIREMENTS_HELPER");
    });

    it("live stage workspace uses V3 section structure only", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        const configuration = read("components/adminV2/settings/lifecycle/LifecycleStageConfiguration.tsx");
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");

        expect(configuration).toContain("LifecycleStageWorkspace");
        expect(board).toContain("LifecycleStageConfiguration");

        expect(workspace).toContain("BUSINESS_PROCESS_SECTION_MEMBERSHIP");
        expect(workspace).toContain("BUSINESS_PROCESS_SECTION_REQUIRED");
        expect(workspace).toContain("BUSINESS_PROCESS_SECTION_OPERATING_PLAN");
        expect(workspace).toContain("BUSINESS_PROCESS_SECTION_READY");
        expect(workspace).toContain('id="operating_plan"');
        expect(workspace).toContain("lifecycle-stage-section-${id}");
        expect(read("components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx")).toContain(
            "LifecycleStageAttentionRulesEditor",
        );

        expect(workspace).not.toContain("BUSINESS_PROCESS_SECTION_ACTIONS");
        expect(workspace).not.toContain("BUSINESS_PROCESS_SECTION_QUEUE_ADVANCED");
        expect(workspace).not.toContain("lifecycle-stage-section-queue-advanced");
        expect(workspace).not.toContain("LifecycleStageWorkUnitCard");
        expect(workspace).not.toContain("Actions in this stage");
        expect(workspace).not.toContain("Queue presentation");

        expect(board).not.toContain("actionsSection=");
    });

    it("included statuses use category rollup picker with labels only", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        const bootstrap = read("lib/lifecycle/buildLifecycleStageBootstrap.ts");
        const rollupEditor = read(
            "components/adminV2/settings/lifecycle/LifecycleStageStatusRollupEditor.tsx"
        );

        expect(workspace).toContain("LifecycleStageStatusRollupEditor");
        expect(workspace).toContain("status_category_catalog");
        expect(workspace).toContain("status_rollup_v1");
        expect(workspace).toContain("statusesSettingsHrefForEntity");
        expect(bootstrap).toContain("loadBusinessProcessStatusCategoryCatalog");
        expect(bootstrap).toContain("status_rollup_v1");
        expect(rollupEditor).toContain("lifecycle-status-category-selector");
        expect(rollupEditor).toContain("{row.status_label}");
        expect(rollupEditor).not.toMatch(/>\s*\{optionKey\}\s*</);
        expect(rollupEditor).toContain("STAGE_MEMBERSHIP_INCLUDED_STATUSES_EMPTY");
        expect(read("lib/lifecycle/statusRollupV1.ts")).toContain("status_rollup_v1");
    });

    it("status persistence routes by entity type for child vs lead tracks", () => {
        const persist = read("lib/lifecycle/persistEnrollmentStageStatusAssignments.ts");
        const save = read("lib/lifecycle/saveLifecycleStageRuntimeConfig.ts");

        expect(persist).toContain("persistStageStatusAssignments");
        expect(persist).toContain("StageStatusEntityType");
        expect(save).toContain("statusEntityTypeForSubject");
        expect(save).toContain("persistStageStatusAssignments");
    });
});

describe("queueMembershipUiLabels — operator copy", () => {
    it("uses friendly subject labels", () => {
        expect(QUEUE_MEMBERSHIP_SUBJECT_LABELS.case).toBe("Families / leads");
        expect(QUEUE_MEMBERSHIP_SUBJECT_LABELS.child).toBe("Children in enrollment");
        expect(QUEUE_MEMBERSHIP_SUBJECT_LABELS.candidate).toBe("Waitlist candidates");
    });
});
