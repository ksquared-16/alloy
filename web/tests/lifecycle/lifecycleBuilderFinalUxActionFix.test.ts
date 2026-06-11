import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    lifecycleActivationBaseActionByKey,
    lifecycleActivationBaseActions,
} from "@/lib/lifecycle/lifecycleStageBaseActions";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle builder final UX and action save", () => {
    it("compressed page header with short subtitle only", () => {
        const page = read("app/adminV2/settings/business-processes/page.tsx");
        expect(page).toContain('data-testid="business-processes-page-header"');
        expect(page).toContain("BUSINESS_PROCESS_SETTINGS_PAGE_SUBTITLE");
        expect(page).not.toContain("Advanced Configuration for additional");
        expect(page).toContain("SETTINGS_PAGE_SHELL_COMPACT_CLASS");
    });

    it("shell has no duplicate configure lifecycle paragraph in primary view", () => {
        const shell = read("components/adminV2/settings/LifecycleSettingsShell.tsx");
        expect(shell).not.toContain("Configure a Lifecycle and validate");
        expect(shell).not.toContain("Lifecycle Builder");
        expect(shell).toContain("Advanced configuration");
        expect(shell).toContain("LifecycleActivationClient");
    });

    it("Create Process uses standard secondary button not dashed oversized", () => {
        const cards = read("components/adminV2/settings/lifecycle/LifecycleProcessCatalogCards.tsx");
        expect(cards).toContain("BUSINESS_PROCESS_CATALOG_CREATE");
        expect(cards).not.toContain("+ New Lifecycle");
        expect(cards).toContain("lifecycle-catalog-create-new");
    });

    it("activation board removes prominent header chrome and repair from primary row", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).not.toContain("lifecycle-activation-header");
        expect(board).not.toContain("Configuring:");
        expect(board).toContain("lifecycle-stage-nav-row");
        expect(board).toContain("lifecycle-board-more-menu");
        expect(board).toContain("lifecycle-activation-repair-workspace");
    });

    it("guided board has short card copy without wordy intro", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).not.toContain("Configure this stage in place");
        expect(guided).toContain("Fields needed before work can move forward.");
        expect(guided).toContain("Statuses included in this stage.");
        expect(guided).toContain("Queue records by selected statuses.");
        expect(guided).not.toContain('stepId="forms"');
        expect(guided).not.toContain("EnrollmentProcessFormsCoverageCard");
    });

    it("every activation base action resolves via activation registry", () => {
        for (const opt of lifecycleActivationBaseActions("Lead")) {
            expect(lifecycleActivationBaseActionByKey(opt.key, "Lead")?.definition_key).toBe(
                opt.definition_key
            );
        }
    });

    it("ensure and route use activation resolver and saveable filter", () => {
        const ensure = read("lib/lifecycle/ensureOrgLifecycleActionDefinition.ts");
        expect(ensure).toContain("lifecycleActivationBaseActionByKey");
        const route = read("app/api/admin/enrollment-process/stage-actions/route.ts");
        expect(route).toContain("filterSaveableLifecycleBaseActions");
        expect(route).toContain("lifecycleActivationBaseActionByKey");
        expect(route).toContain("department_id");
        expect(read("lib/lifecycle/buildLifecycleStageBootstrap.ts")).toContain(
            "filterSaveableLifecycleBaseActions"
        );
    });

    it("stage workspace uses unified Save stage pattern", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("BUSINESS_PROCESS_SAVE_STAGE");
        expect(workspace).toContain("lifecycle-stage-save");
        const card = read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx");
        expect(card).not.toContain("lifecycle-add-action-submit");
        expect(card).toContain("lifecycle-action-save-success");
        const activation = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(activation).toContain("department_id: runtimeDepartmentId");
    });
});
