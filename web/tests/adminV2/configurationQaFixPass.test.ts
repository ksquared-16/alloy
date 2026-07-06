import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    countUnitsForSubject,
    defaultSubjectTypeForStage,
    statusEntityTypeForStage,
} from "@/lib/lifecycle/stageStatusRollup";
import { filterCatalogGroupsForScope } from "@/lib/layout/queueRecordScopeCatalog";
import type { LayoutCatalogField, LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import {
    buildLeadLayoutPickerGroups,
    CURATED_FIELDS,
    LAYOUT_ENTITY_GROUPS,
} from "@/lib/layout/fieldCatalog";
import {
    isChildcareLegacyOrSystemField,
    isChildcareOperatorPickerVisible,
} from "@/lib/fields/childcareFieldCatalogDoctrine";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

function leadPickerFromCuratedFallback() {
    const raw = LAYOUT_ENTITY_GROUPS.map((g) => ({
        entityKey: g.entityKey,
        entityLabel: g.entityLabel,
        fields: CURATED_FIELDS[g.entityKey] ?? [],
    }));
    return buildLeadLayoutPickerGroups(raw, "opportunities");
}

describe("Configuration QA fix pass", () => {
    it("hides child placement fields from Lead default fields", () => {
        for (const key of ["program_type", "schedule_type"]) {
            expect(isChildcareLegacyOrSystemField("opportunity", key)).toBe(true);
        }
    });

    it("hides legacy/system location fields by default", () => {
        for (const key of [
            "access_method",
            "access_method_id",
            "access_notes",
            "external_source",
            "external_id",
            "customer_id",
            "vendor_id",
            "lat",
            "lng",
            "parent_location_id",
        ]) {
            expect(isChildcareLegacyOrSystemField("location", key)).toBe(true);
        }
    });

    it("hides notes as a normal configurable field", () => {
        expect(isChildcareLegacyOrSystemField("opportunity", "notes")).toBe(true);
        expect(isChildcareLegacyOrSystemField("inquiry_child", "notes")).toBe(true);
        expect(isChildcareOperatorPickerVisible("inquiry_child", "notes", { is_system: true })).toBe(false);
    });

    it("lead queue field_group picker includes lead, person, and child context fields", () => {
        const lead = leadPickerFromCuratedFallback();
        // filterCatalogGroupsForLeadQueueFieldGroup removed — child context uses repeated_related scope.
        const mainScoped = filterCatalogGroupsForScope(lead, { type: "main_record" });
        const personScoped = filterCatalogGroupsForScope(lead, {
            type: "primary_related",
            relationshipKey: "primary_contact",
        });
        const childScoped = filterCatalogGroupsForScope(lead, {
            type: "repeated_related",
            relationshipKey: "children",
        });
        const groups: LayoutCatalogGroup[] = [...mainScoped, ...personScoped, ...childScoped];
        const refKeys = groups.flatMap((g) => g.fields.map((f: LayoutCatalogField) => f.refKey));
        expect(refKeys.some((k) => k.startsWith("opportunity."))).toBe(true);
        expect(refKeys.some((k) => k.startsWith("customer."))).toBe(true);
        expect(refKeys.some((k) => k.startsWith("person."))).toBe(true);
        expect(refKeys.some((k) => k.startsWith("child.") || k.startsWith("inquiry_child."))).toBe(true);
    });

    it("main_record scope includes person entity group", () => {
        const lead = leadPickerFromCuratedFallback();
        const main = filterCatalogGroupsForScope(lead, { type: "main_record" });
        expect(main.some((g) => g.entityKey === "person")).toBe(true);
    });

    it("dedupes rows counted by options per subject", () => {
        expect(countUnitsForSubject("case")).toEqual(["cases"]);
        expect(countUnitsForSubject("child")).toEqual(["enrollment_tracks"]);
        expect(countUnitsForSubject("candidate")).toEqual(["candidates"]);
    });

    it("defaults family track to case and child track to child subject", () => {
        expect(defaultSubjectTypeForStage("lead", "family_track")).toBe("case");
        expect(defaultSubjectTypeForStage("waitlist", "child_track")).toBe("child");
        expect(statusEntityTypeForStage("lead", "family_track")).toBe("opportunities");
        expect(statusEntityTypeForStage("enrolled", "child_track")).toBe("opportunity_customer_members");
    });

    it("status picker shows labels not keys in lifecycle statuses card", () => {
        const card = read("components/adminV2/settings/lifecycle/LifecycleStatusesCard.tsx");
        expect(card).toContain("{row.status_label}");
        expect(card).not.toMatch(/>\s*\{optionKey\}\s*</);
    });

    it("statuses table hides keys by default", () => {
        const statuses = read("app/legacy-admin/system/statuses/StatusesClient.tsx");
        expect(statuses).toContain("showStatusKeys");
        expect(statuses).toContain("statuses-show-keys-toggle");
        expect(statuses).toContain('{showStatusKeys ?');
    });

    it("location programs panel hides operator-facing keys", () => {
        const panel = read("components/adminV2/settings/LocationProgramCategoriesSettingsPanel.tsx");
        expect(panel).not.toContain("Key (optional)");
        expect(panel).not.toContain("{c.key}");
    });

    it("location site workspace removed schedules card", () => {
        const workspace = read("components/adminV2/settings/LocationSiteConfigurationWorkspace.tsx");
        expect(workspace).not.toContain("location-site-schedules");
        expect(workspace).toContain("location-site-programs");
        expect(workspace).toContain("location-site-rooms");
    });

    it("configuration hub explains fields to runtime flow", () => {
        const guide = read("components/adminV2/settings/ConfigurationJourneyGuide.tsx");
        expect(guide).toContain("configuration-journey-flow");
        expect(guide).toContain("Business Processes");
        expect(guide).toContain("Runtime");
    });

    it("settings nav supports collapsed sidebar", () => {
        const nav = read("components/adminV2/settings/SettingsWorkspaceNav.tsx");
        expect(nav).toContain("configuration-workspace-nav-toggle");
        expect(nav).toContain("data-collapsed");
    });

    it("stage status rollup persists child entity assignments", () => {
        expect(read("lib/lifecycle/persistEnrollmentStageStatusAssignments.ts")).toContain(
            "persistStageStatusAssignments"
        );
        expect(read("lib/lifecycle/persistEnrollmentStageStatusAssignments.ts")).toContain(
            "opportunity_customer_members"
        );
    });

    it("F1 registry trust paths remain wired", () => {
        expect(read("lib/fields/formFieldRegistryPicker.ts")).toContain("field_definitions");
        expect(read("lib/lifecycle/lifecycleFieldPaletteMerge.ts")).toContain(
            "mergeLifecycleFieldPaletteRegistryFirst"
        );
    });
});
