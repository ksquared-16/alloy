import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    ENROLLMENT_PLACEMENT_PHASE_REQUIREMENTS,
    placementRequiredForPhase,
} from "@/lib/fields/enrollmentPlacementPhaseRequirements";
import { enrollmentPlacementOperatorLabel } from "@/lib/fields/enrollmentPlacementDoctrine";
import { isChildcareLegacyOrSystemField } from "@/lib/fields/childcareFieldCatalogDoctrine";
import { CONFIGURATION_WORKSPACE_ADVANCED_ITEMS } from "@/lib/adminV2/configurationWorkspaceDomains";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

function readDoc(rel: string): string {
    return readFileSync(resolve(root, "../docs", rel), "utf8");
}

describe("Configuration Workspace V3 — enrollment workflow readiness", () => {
    it("locks placement doctrine by phase", () => {
        const lead = ENROLLMENT_PLACEMENT_PHASE_REQUIREMENTS.find((r) => r.phase === "lead");
        expect(lead?.required).toEqual(["location"]);
        expect(lead?.not_required).toEqual(["program", "room", "schedule"]);

        expect(placementRequiredForPhase("qualification", "program")).toBe(true);
        expect(placementRequiredForPhase("qualification", "room")).toBe(false);
        expect(placementRequiredForPhase("placement_enrolling", "room")).toBe(true);
        expect(placementRequiredForPhase("enrolled", "schedule")).toBe(true);
    });

    it("documents enrollment placement doctrine", () => {
        const doc = readDoc("system/enrollment-placement-doctrine.md");
        expect(doc).toContain("Location → Program → Room → Schedule");
        expect(doc).toContain("### Lead");
        expect(doc).toContain("### Placement / Enrolling");
    });

    it("location workspace renders site-centric ownership cards", () => {
        const loc = read("components/adminV2/settings/LocationsHierarchySettingsClient.tsx");
        expect(loc).toContain("location-site-workspace-shell");
        expect(loc).toContain("LocationSiteConfigurationWorkspace");
        expect(loc).not.toContain("Programs (per site)");

        const panel = read("components/adminV2/settings/LocationSiteConfigurationWorkspace.tsx");
        expect(panel).toContain('data-testid="location-site-programs"');
        expect(panel).toContain('data-testid="location-site-rooms"');
        expect(panel).not.toContain('data-testid="location-site-schedules"');
    });

    it("business process track explainer shows family/child stages and decision split", () => {
        const explainer = read("components/adminV2/settings/lifecycle/BusinessProcessTrackExplainer.tsx");
        expect(explainer).toContain("business-process-track-explainer-family-stages");
        expect(explainer).toContain("business-process-track-explainer-child-stages");
        expect(explainer).toContain("business-process-track-explainer-split");
        expect(explainer).toContain("Decision split");
        expect(explainer).toContain("ENROLLMENT_FAMILY_STAGE_SPECS");
        expect(explainer).toContain("ENROLLMENT_CHILD_STAGE_SPECS");
    });

    it("operating plan section renders in stage workspace", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain('id="operating_plan"');
        expect(workspace).toContain("LifecycleStageOperatingPlanEditor");
        expect(read("components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx")).toContain(
            "LifecycleStageAttentionRulesEditor",
        );
        expect(workspace).toContain("defaultOpen");
    });

    it("program label visible and canonical program storage in operator paths", () => {
        expect(enrollmentPlacementOperatorLabel("program_category_id", "Desired program")).toBe("Program");
        // Canonical program storage stays operator-configurable, not hidden as legacy/system.
        expect(isChildcareLegacyOrSystemField("inquiry_child", "program_category_id")).toBe(false);
        const addChild = read("components/admin/opportunity/actions/AddInquiryChildModal.tsx");
        expect(addChild).toContain("program_category_id");
    });

    it("status ownership remains clean — statuses vocabulary only", () => {
        const client = read("app/legacy-admin/system/statuses/StatusesClient.tsx");
        expect(client).not.toContain("Enrollment Stage");
        expect(client).toContain("Business Processes");
    });

    it("F1 field trust — new fields propagate without catalog edits", () => {
        expect(read("lib/lifecycle/lifecycleFieldPaletteMerge.ts")).toContain("mergeLifecycleFieldPaletteRegistryFirst");
        expect(read("lib/fields/formFieldRegistryPicker.ts")).toContain("field_definitions");
        expect(read("app/adminV2/settings/fields/page.tsx")).toContain("FIELDS_HUB_REGISTRY_TRUST_NOTE");
        expect(read("app/adminV2/settings/layouts/page.tsx")).toContain("LAYOUTS_HUB_REGISTRY_TRUST_NOTE");
    });

    it("hidden entities remain hidden from Fields hub", () => {
        const hub = read("lib/fields/childcareFieldCatalogDoctrine.ts");
        for (const hidden of ["vendor", "schedule", "job", "customer_member", "enrollment"]) {
            expect(hub).toContain(hidden);
        }
    });

    it("work units not promoted to primary operator configuration", () => {
        expect(CONFIGURATION_WORKSPACE_ADVANCED_ITEMS.map((i) => i.href)).toContain("/admin/settings/work-units");
        const ops = read("lib/adminV2/configurationWorkspaceDomains.ts");
        const primaryOps = ops.match(/id: "operations"[\s\S]*?items: \[[\s\S]*?\]/);
        expect(primaryOps?.[0] ?? "").not.toContain("work-units");
    });

    it("configuration pages share workspace shell patterns", () => {
        expect(read("app/adminV2/settings/fields/page.tsx")).toContain("data-model-workspace-page");
        expect(read("app/adminV2/settings/business-processes/page.tsx")).toContain('variant="hero"');
        expect(read("components/adminV2/settings/LayoutsSettingsPageShell.tsx")).toContain('variant="hero"');
        expect(read("components/adminV2/settings/LocationsHierarchySettingsClient.tsx")).toContain('variant="hero"');
        expect(read("components/adminV2/settings/SettingsWorkspaceNav.tsx")).toContain("configuration-workspace-nav");
    });

    it("layouts audit — gallery primary with legacy builder fallback", () => {
        const layouts = read("app/adminV2/settings/layouts/page.tsx");
        expect(layouts).toContain("LayoutsSettingsPageShell");
        expect(read("components/adminV2/settings/LayoutsSettingsPageShell.tsx")).toContain("LAYOUTS_HUB_REGISTRY_TRUST_NOTE");
        expect(layouts).not.toContain("<LayoutConfigClient");
        const shell = read("app/adminV2/settings/layouts/LayoutsSettingsPageClient.tsx");
        expect(shell).toContain("LayoutGalleryClient");
        expect(shell).toContain("legacy builder");
    });

    it("experience builder studio shell does not mount AdminEntityDrawer without drawer provider", () => {
        const providers = read("app/adminV2/settings/AdminV2SettingsClientProviders.tsx");
        expect(providers).not.toContain(
            'data-experience-builder-studio="true"\n                    >\n                        {children}\n                    </div>\n                    <AdminEntityDrawer />',
        );
        expect(read("app/adminV2/components/AdminV2Shell.tsx")).toMatch(
            /experienceBuilderStudio[\s\S]*AdminV2ShellDrawerScope/,
        );
    });

    it("enrollment QA doc includes configuration verification section", () => {
        const doc = readDoc("sprints/archive/06_2026/enrollment_workflow_qa_ready_path.md");
        expect(doc).toContain("Configuration verification");
        expect(doc).toContain("Create Lead");
        expect(doc).toContain("Enrolled");
    });
});
