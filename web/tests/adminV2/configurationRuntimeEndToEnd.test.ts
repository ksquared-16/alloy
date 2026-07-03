import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES,
    CONFIGURATION_WORKSPACE_DOMAINS,
} from "@/lib/adminV2/configurationWorkspaceDomains";
import { adminSettingsSubpathHref, isPublicMarketingChromeSuppressedPath } from "@/lib/admin/canonicalAdminRoutes";
import { ADMIN_V2_SETTINGS_PROCESSES_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";
import { buildOperationalViewPreviewRuntimeHref } from "@/lib/adminV2/runtime/perspective/mergeOperationalViewMetadata";
import { filterQueueRowsByWorkViewFilters } from "@/lib/lifecycle/evaluateWorkViewFiltersV1";
import { resolveActiveWorkViewRuntimeContext } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Runtime end-to-end vertical slice", () => {
    it("/settings/processes route renders Configuration Mode Processes surface", () => {
        const page = read("app/adminV2/settings/processes/page.tsx");
        expect(page).toContain("ProcessesConfigurationPage");
        expect(page).not.toContain("LifecycleSettingsShell");
        const surface = read("components/adminV2/settings/businessProcess/ProcessesConfigurationPage.tsx");
        expect(surface).toContain('data-testid="settings-processes-page"');
    });

    it("/settings/business-processes redirects to /settings/processes", () => {
        const page = read("app/adminV2/settings/business-processes/page.tsx");
        expect(page).toContain("redirect(");
        expect(page).toContain("ADMIN_V2_SETTINGS_PROCESSES_PATH");
        expect(ADMIN_V2_SETTINGS_PROCESSES_PATH).toBe("/settings/processes");
    });

    it("settings hub links to Processes and Layouts", () => {
        const hrefs = CONFIGURATION_WORKSPACE_DOMAINS.flatMap((d) => d.items.map((i) => ({ href: i.href, label: i.label })));
        expect(hrefs).toContainEqual({ href: "/settings/processes", label: "Processes" });
        expect(hrefs).toContainEqual({ href: "/settings/surfaces", label: "Surfaces" });
        expect(hrefs.some((i) => i.label === "Business Processes")).toBe(false);
    });

    it("Work Views workspace supports save and editor controls", () => {
        const workspace = read("components/adminV2/settings/businessProcess/BusinessProcessWorkViewsSetupWorkspace.tsx");
        expect(workspace).toContain('data-testid="business-process-save-work-views"');
        expect(workspace).toContain("WorkViewProcessEditorCard");
        expect(read("components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx")).toContain(
            "WorkViewConditionEditor",
        );
    });

    it("filters_v1 evaluate at runtime without crashing on unsupported fields", () => {
        const rows = filterQueueRowsByWorkViewFilters(
            [{ id: "1", status_key: "new_inquiry" }, { id: "2", status_key: "enrolled" }],
            [{ field_key: "status", operator: "equals", value: "new_inquiry" }],
        );
        expect(rows).toHaveLength(1);
        const unsupported = filterQueueRowsByWorkViewFilters(
            [{ id: "1", status_key: "new_inquiry" }],
            [{ field_key: "assigned_staff", operator: "equals", value: "user-1" }],
        );
        expect(unsupported).toHaveLength(1);
    });

    it("layout ids resolve with work_view_pinned priority", () => {
        const ctx = resolveActiveWorkViewRuntimeContext({
            departmentMetadata: {
                lifecycle_builder_v1: {
                    version: 1,
                    active_process_id: "p1",
                    processes: [
                        {
                            id: "p1",
                            key: "enrollment",
                            name: "Enrollment",
                            primary_entity: "opportunity",
                            sort_order: 0,
                            is_active: true,
                            stages: [],
                            work_views_v1: [
                                {
                                    id: "hot_leads",
                                    label: "Hot Leads",
                                    compat_queue_key: "new_inquiry",
                                    queue_layout_id: "ql-1",
                                    focus_panel_layout_id: "fp-1",
                                },
                            ],
                        },
                    ],
                },
            },
            workViewId: "hot_leads",
        });
        expect(ctx.queueLayoutId).toBe("ql-1");
        expect(ctx.focusPanelLayoutId).toBe("fp-1");
    });

    it("preview runtime URL uses work_view without requiring queue param", () => {
        const href = buildOperationalViewPreviewRuntimeHref({
            workUnitKey: "enrollment_pipeline",
            workViewId: "hot_leads",
        });
        expect(href).toContain("work_view=hot_leads");
        expect(href).toContain("/workspace/work-unit/enrollment-pipeline");
    });

    it("Lead Summary blueprint editor is linked from layouts gallery", () => {
        const layouts = read("app/adminV2/settings/layouts/LayoutsSettingsPageClient.tsx");
        expect(layouts).toContain("layout-blueprint-lead-summary");
        expect(layouts).toContain("LeadSummaryCardBlueprintEditor");
    });

    it("suppresses marketing chrome on settings routes", () => {
        expect(isPublicMarketingChromeSuppressedPath("/settings")).toBe(true);
        expect(isPublicMarketingChromeSuppressedPath("/settings/processes")).toBe(true);
        expect(isPublicMarketingChromeSuppressedPath("/settings/layouts")).toBe(true);
    });

    it("forbids Queue Builder and Focus Panel Builder settings routes", () => {
        expect(CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES).toContain("/settings/queue-builder");
        expect(CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES).toContain("/settings/focus-panel-builder");
        const navHrefs = CONFIGURATION_WORKSPACE_DOMAINS.flatMap((d) => d.items.map((i) => i.href));
        expect(navHrefs.some((h) => h.includes("queue-builder"))).toBe(false);
        expect(navHrefs.some((h) => h.includes("focus-panel-builder"))).toBe(false);
    });

    it("canonical settings subpath for processes", () => {
        expect(adminSettingsSubpathHref("processes")).toBe("/settings/processes");
    });
});
