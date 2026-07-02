import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CONFIGURATION_WORKSPACE_ADVANCED_ITEMS,
    CONFIGURATION_WORKSPACE_DOMAINS,
    configurationWorkspaceDomainForPath,
} from "@/lib/adminV2/configurationWorkspaceDomains";
import {
    CHILDCARE_FIELDS_HUB_HIDDEN_ENTITIES,
    CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES,
    isChildcareFieldsHubVisibleEntity,
} from "@/lib/fields/childcareFieldCatalogDoctrine";
import { LAYOUT_SETTINGS_ENTITY_ORDER } from "@/lib/adminV2/layoutsSettingsEntities";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Workspace V1", () => {
    it("defines four ownership domains with primary navigation items", () => {
        const ids = CONFIGURATION_WORKSPACE_DOMAINS.map((d) => d.id);
        expect(ids).toEqual(["organization", "data_model", "operations", "experience"]);
        const primaryHrefs = CONFIGURATION_WORKSPACE_DOMAINS.flatMap((d) =>
            d.items.filter((i) => !i.advanced).map((i) => i.href)
        );
        expect(primaryHrefs).toContain("/admin/settings/fields");
        expect(primaryHrefs).toContain("/admin/settings/business-processes");
        expect(primaryHrefs).toContain("/admin/settings/layouts");
        expect(primaryHrefs).toContain("/admin/settings/locations");
    });

    it("renders configuration workspace left navigation", () => {
        const nav = read("components/adminV2/settings/SettingsWorkspaceNav.tsx");
        const providers = read("app/adminV2/settings/AdminV2SettingsClientProviders.tsx");
        expect(nav).toContain('data-testid="configuration-workspace-nav"');
        expect(providers).toContain("SettingsWorkspaceNav");
    });

    it("hub shows configuration journey guidance", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain("ConfigurationJourneyGuide");
        expect(page).toContain("CONFIGURATION_WORKSPACE_HUB_TITLE");
        const guide = read("components/adminV2/settings/ConfigurationJourneyGuide.tsx");
        expect(guide).toContain('data-testid="configuration-journey-guide"');
    });

    it("hides unfinished entities from Fields hub primary paths", () => {
        for (const hidden of ["vendor", "schedule", "job", "customer_member"]) {
            expect(CHILDCARE_FIELDS_HUB_HIDDEN_ENTITIES).toContain(hidden);
            expect(isChildcareFieldsHubVisibleEntity(hidden)).toBe(false);
        }
        expect(CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES).toEqual([
            "person",
            "customer",
            "opportunity",
            "inquiry_child",
            "location",
        ]);
        const hub = read("app/adminV2/settings/fields/SettingsFieldsHubClient.tsx");
        expect(hub).not.toContain("vendor");
        expect(hub).not.toContain("schedule");
    });

    it("demotes Attention and Work Units from primary operations nav", () => {
        const ops = CONFIGURATION_WORKSPACE_DOMAINS.find((d) => d.id === "operations")!;
        const primaryLabels = ops.items.filter((i) => !i.advanced).map((i) => i.label);
        expect(primaryLabels).not.toContain("Attention & SLA");
        expect(primaryLabels).not.toContain("Work Units & Queues");
        const advancedHrefs = CONFIGURATION_WORKSPACE_ADVANCED_ITEMS.map((i) => i.href);
        expect(advancedHrefs).toContain("/admin/settings/attention-sla-rules");
        expect(advancedHrefs).toContain("/admin/settings/work-units");
    });

    it("Business Processes stage workspace owns Operating Plan with attention", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(read("components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx")).toContain(
            "LifecycleStageAttentionRulesEditor",
        );
        expect(workspace).toContain('id="operating_plan"');
        expect(workspace).toContain("BUSINESS_PROCESS_SECTION_OPERATING_PLAN");
    });

    it("operator UI avoids lifecycle product naming in key surfaces", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).not.toContain("Loading Lifecycle");
        expect(board).not.toContain("Rename lifecycle");
        const crossLink = read("components/adminV2/settings/WorkUnitsLifecycleCrossLink.tsx");
        expect(crossLink).toContain("Business Processes");
        expect(crossLink).not.toMatch(/>Lifecycle</);
    });

    it("F1 field registry convergence paths remain wired", () => {
        expect(read("lib/fields/formFieldRegistryPicker.ts")).toContain("field_definitions");
        expect(read("lib/lifecycle/lifecycleFieldPaletteMerge.ts")).toContain("field_definitions");
        expect(read("lib/fields/fieldRegistryReferenceMatrix.ts")).toContain("program_category_id");
    });

    it("layout settings entity order excludes unfinished entities", () => {
        expect(LAYOUT_SETTINGS_ENTITY_ORDER).not.toContain("job");
        expect(LAYOUT_SETTINGS_ENTITY_ORDER).not.toContain("schedule");
        expect(LAYOUT_SETTINGS_ENTITY_ORDER).toContain("opportunity");
        expect(LAYOUT_SETTINGS_ENTITY_ORDER).toContain("person");
    });

    it("maps settings paths to configuration domains", () => {
        expect(configurationWorkspaceDomainForPath("/admin/settings/fields")).toBe("data_model");
        expect(configurationWorkspaceDomainForPath("/admin/settings/business-processes")).toBe("operations");
        expect(configurationWorkspaceDomainForPath("/admin/settings/layouts")).toBe("experience");
        expect(configurationWorkspaceDomainForPath("/admin/settings/locations")).toBe("organization");
    });
});
