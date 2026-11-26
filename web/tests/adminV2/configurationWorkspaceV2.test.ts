import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    ENROLLMENT_PROGRAM_MODEL,
    LOCATION_OWNERSHIP_MODEL,
    enrollmentPlacementOperatorLabel,
} from "@/lib/fields/enrollmentPlacementDoctrine";
import {
    CHILDCARE_FIELDS_HUB_HIDDEN_ENTITIES,
    CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES,
    isChildcareLegacyOrSystemField,
} from "@/lib/fields/childcareFieldCatalogDoctrine";
import { CONFIGURATION_WORKSPACE_ADVANCED_ITEMS } from "@/lib/adminV2/configurationWorkspaceDomains";
import { resolveInquiryChildLocationMismatch } from "@/lib/admin/location/inquiryChildLocationMismatch";
import { applyInquiryChildPlacementFieldChange } from "@/lib/admin/location/inquiryChildPlacementFieldKeys";
import { clearProgramValueIfNotOffered } from "@/lib/admin/location/inquiryChildLocationMismatch";
import { resolveProgramSelectOptionsForSite } from "@/lib/admin/location/inquiryChildPlacementOptions";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const CATEGORIES: LocationProgramCategoryRow[] = [
    {
        id: "cat-north",
        org_id: "org-1",
        location_id: "site-north",
        key: "infant",
        label: "Infant",
        sort_order: 1,
        is_active: true,
    },
    {
        id: "cat-south",
        org_id: "org-1",
        location_id: "site-south",
        key: "preschool",
        label: "Preschool",
        sort_order: 1,
        is_active: true,
    },
];

describe("Configuration Workspace V2 — workflow QA readiness", () => {
    it("documents location-owned programs, rooms, interim schedules", () => {
        expect(LOCATION_OWNERSHIP_MODEL.programs.settings_path).toBe("/admin/settings/locations");
        expect(LOCATION_OWNERSHIP_MODEL.schedules.storage_interim).toContain("childcare_schedule_type");
        expect(LOCATION_OWNERSHIP_MODEL.rooms.required_at).toBe("enrollment_placement");
    });

    it("operator Program model uses category storage as the sole program field", () => {
        expect(ENROLLMENT_PROGRAM_MODEL.operator_label).toBe("Program");
        expect(ENROLLMENT_PROGRAM_MODEL.storage_field_key).toBe("program_category_id");
        expect(enrollmentPlacementOperatorLabel("program_category_id", "Desired program")).toBe("Program");
        // Canonical program storage stays operator-configurable, not hidden as legacy/system.
        expect(isChildcareLegacyOrSystemField("inquiry_child", "program_category_id")).toBe(false);
    });

    it("hides unfinished entities from operator Fields hub", () => {
        for (const hidden of ["vendor", "schedule", "job", "customer_member", "enrollment"]) {
            expect(CHILDCARE_FIELDS_HUB_HIDDEN_ENTITIES).toContain(hidden);
        }
        expect(CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES).toEqual([
            "person",
            "customer",
            "opportunity",
            "inquiry_child",
            "location",
        ]);
    });

    it("E2 location inheritance and mismatch remain protected", () => {
        const inherited = resolveInquiryChildLocationMismatch({
            leadLocationId: "site-north",
            childLocationId: "site-north",
        });
        expect(inherited.mismatched).toBe(false);

        const override = resolveInquiryChildLocationMismatch({
            leadLocationId: "site-north",
            childLocationId: "site-south",
        });
        expect(override.mismatched).toBe(true);
        expect(override.notice).toContain("different location");

        const addChild = read("components/admin/opportunity/actions/AddInquiryChildModal.tsx");
        expect(addChild).toContain("defaultLocationId");
        expect(addChild).toContain("inheritedLocationId");
    });

    it("program cascade clears invalid selection on location change", () => {
        const southOptions = resolveProgramSelectOptionsForSite(
            [{ id: "site-south", location_type: "site", is_active: true }],
            "site-south",
            [],
            CATEGORIES,
            "category_id"
        );
        expect(clearProgramValueIfNotOffered("cat-north", southOptions)).toBe("");

        const next = applyInquiryChildPlacementFieldChange("location_id", "site-south", {
            location_id: "site-north",
            program_category_id: "cat-north",
        });
        expect(next.program_category_id).toBe("");
    });

    it("statuses page does not own stage assignment", () => {
        const client = read("app/legacy-admin/system/statuses/StatusesClient.tsx");
        expect(client).not.toContain("Enrollment Stage");
        expect(client).toContain("Business Processes");
    });

    it("Business Processes stage workspace uses Operating Plan section", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain('id="operating_plan"');
        expect(workspace).toContain("BUSINESS_PROCESS_SECTION_OPERATING_PLAN");
        expect(read("components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx")).toContain(
            "LifecycleStageAttentionRulesEditor",
        );
        expect(workspace).not.toContain('id="work_plan"');
        expect(workspace).not.toContain('id="attention"');
    });

    it("work units are not primary operator configuration", () => {
        const ops = read("lib/adminV2/configurationWorkspaceDomains.ts");
        const primaryOps = ops.match(/id: "operations"[\s\S]*?items: \[[\s\S]*?\]/);
        expect(primaryOps?.[0] ?? "").not.toContain("work-units");
        expect(CONFIGURATION_WORKSPACE_ADVANCED_ITEMS.map((i) => i.href)).toContain(
            "/admin/settings/work-units"
        );
    });

    it("F1 convergence paths remain wired", () => {
        expect(read("lib/lifecycle/lifecycleFieldPaletteMerge.ts")).toContain("mergeLifecycleFieldPaletteRegistryFirst");
        expect(read("lib/fields/formFieldRegistryPicker.ts")).toContain("field_definitions");
        expect(read("app/adminV2/settings/fields/page.tsx")).toContain("FIELDS_HUB_REGISTRY_TRUST_NOTE");
    });

    it("locations page communicates ownership without internal field keys", () => {
        const loc = read("components/adminV2/settings/LocationsHierarchySettingsClient.tsx");
        expect(loc).toContain("LocationSiteConfigurationWorkspace");
        expect(loc).not.toContain("program_category_id");
    });

    it("settings surfaces use hero headers and left nav", () => {
        expect(read("app/adminV2/settings/fields/page.tsx")).toContain("data-model-workspace-page");
        expect(read("app/adminV2/settings/business-processes/page.tsx")).toContain('variant="hero"');
        expect(read("components/adminV2/settings/SettingsWorkspaceNav.tsx")).toContain(
            "configuration-workspace-nav"
        );
    });

    it("operator path avoids lifecycle product naming in work units crosslink", () => {
        const cross = read("components/adminV2/settings/WorkUnitsLifecycleCrossLink.tsx");
        expect(cross).toContain("Business Processes");
        expect(cross).not.toMatch(/>Lifecycle</);
    });

    it("enrollment workflow QA doc exists", () => {
        const doc = readFileSync(
            resolve(root, "../docs/sprints/archive/06_2026/enrollment_workflow_qa_ready_path.md"),
            "utf8"
        );
        expect(doc).toContain("Create Lead");
        expect(doc).toContain("Add Child");
        expect(doc).toContain("North Campus");
    });
});
