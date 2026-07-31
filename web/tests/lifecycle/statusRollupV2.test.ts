import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import {
    assignKeysToCategories,
    buildBusinessProcessStatusCategoryCatalog,
    buildStatusCategoryCatalog,
    defaultCategoryKeysForEnrollmentStage,
    resolveStatusRollupForStage,
} from "@/lib/lifecycle/statusCategoryCatalog";
import {
    isEnrollmentProcessStatusRow,
    isLeadCaseContainerStatusRow,
    resolveStatusSettingsCategoryKey,
} from "@/lib/lifecycle/statusSettingsCategoryDoctrine";
import {
    flattenStatusRollupKeys,
    parseStatusRollupV1,
    toggleCategoryEnabled,
    toggleStatusInRollup,
    type StatusRollupV1,
} from "@/lib/lifecycle/statusRollupV1";

function catalogRow(
    entity_type: string,
    status_key: string,
    status_label: string,
    sort_order: number,
    metadata: Record<string, unknown> | null
): StatusDefinitionRow {
    return {
        id: status_key,
        org_id: "org",
        entity_type,
        status_key,
        status_label,
        sort_order,
        is_active: true,
        is_system: false,
        industry_key: null,
        metadata,
    };
}

const CONTAINER_ROWS = [
    catalogRow("opportunities", "open", "Open", 1, {
        alloy_layer: "case_status",
        status_settings_category: "lead_statuses",
    }),
    catalogRow("opportunities", "closed", "Closed", 2, {
        alloy_layer: "case_status",
        status_settings_category: "lead_statuses",
    }),
    catalogRow("opportunities", "inactive", "Inactive", 3, {
        alloy_layer: "case_status",
        status_settings_category: "lead_statuses",
    }),
    catalogRow("opportunities", "archived", "Archived", 4, {
        alloy_layer: "case_status",
        status_settings_category: "lead_statuses",
    }),
];

const FAMILY_PROCESS_ROWS = [
    catalogRow("opportunities", "new_inquiry", "New Lead", 5, {
        alloy_layer: "enrollment_process",
        status_settings_category: "enrollment_statuses",
    }),
    catalogRow("opportunities", "needs_qualification", "Contacting", 10, {
        alloy_layer: "enrollment_process",
        status_settings_category: "enrollment_statuses",
    }),
    catalogRow("opportunities", "qualified", "Qualified", 15, {
        alloy_layer: "enrollment_process",
        status_settings_category: "enrollment_statuses",
    }),
    catalogRow("opportunities", "tour_requested", "Tour Requested", 20, {
        alloy_layer: "enrollment_process",
        status_settings_category: "enrollment_statuses",
    }),
    catalogRow("opportunities", "tour_scheduled", "Tour Scheduled", 25, {
        alloy_layer: "enrollment_process",
        status_settings_category: "enrollment_statuses",
    }),
    catalogRow("opportunities", "tour_completed", "Tour Completed", 30, {
        alloy_layer: "enrollment_process",
        status_settings_category: "enrollment_statuses",
    }),
    catalogRow("opportunities", "decision_pending", "Decision Pending", 35, {
        alloy_layer: "enrollment_process",
        status_settings_category: "enrollment_statuses",
    }),
];

const CHILD_PROCESS_ROWS = [
    catalogRow("opportunity_customer_members", "waitlisted", "Waitlisted", 20, {
        alloy_layer: "enrollment_disposition",
        status_settings_category: "enrollment_statuses",
    }),
    catalogRow("opportunity_customer_members", "offer_pending", "Offer Pending", 22, {
        alloy_layer: "enrollment_disposition",
        status_settings_category: "enrollment_statuses",
    }),
    catalogRow("opportunity_customer_members", "waitlist_paused", "Waitlist Paused", 24, {
        alloy_layer: "enrollment_disposition",
        status_settings_category: "enrollment_statuses",
    }),
    catalogRow("opportunity_customer_members", "enrolling", "Enrolling", 30, {
        alloy_layer: "enrollment_disposition",
        status_settings_category: "enrollment_statuses",
    }),
    catalogRow("opportunity_customer_members", "enrolled", "Enrolled", 40, {
        alloy_layer: "enrollment_disposition",
        status_settings_category: "enrollment_statuses",
    }),
];

const PEOPLE_ROWS = [
    catalogRow("persons", "pre_enrolled", "Pre-Enrolled", 5, {
        status_settings_category: "person_statuses",
        applies_to_profiles: ["person_generic"],
    }),
    catalogRow("persons", "active", "Active", 10, {
        status_settings_category: "person_statuses",
        applies_to_profiles: ["person_generic"],
    }),
    catalogRow("persons", "inactive", "Inactive", 20, {
        status_settings_category: "person_statuses",
        applies_to_profiles: ["person_generic"],
    }),
    catalogRow("persons", "archived", "Archived", 30, {
        status_settings_category: "person_statuses",
        applies_to_profiles: ["person_generic"],
    }),
];

const SYSTEM_ROW = catalogRow("opportunities", "legacy_debug", "Legacy Debug", 200, {
    status_settings_category: "system_statuses",
    bp_picker_hidden: true,
});

const CATALOG_ROWS = [
    ...CONTAINER_ROWS,
    ...FAMILY_PROCESS_ROWS,
    ...CHILD_PROCESS_ROWS,
    ...PEOPLE_ROWS,
    SYSTEM_ROW,
];

describe("status settings category doctrine", () => {
    const catalog = buildStatusCategoryCatalog(CATALOG_ROWS);
    const bpCatalog = buildBusinessProcessStatusCategoryCatalog(CATALOG_ROWS);

    it("Enrollment Statuses contains process vocabulary from family and child tracks", () => {
        const enrollment = catalog.find((g) => g.category_key === "enrollment_statuses");
        expect(enrollment?.statuses.map((s) => s.status_label)).toEqual([
            "New Lead",
            "Contacting",
            "Qualified",
            "Tour Requested",
            "Tour Scheduled",
            "Tour Completed",
            "Decision Pending",
            "Waitlisted",
            "Offer Pending",
            "Waitlist Paused",
            "Enrolling",
            "Enrolled",
        ]);
    });

    it("Lead / Case Statuses contains only container state", () => {
        const leadCase = catalog.find((g) => g.category_key === "lead_statuses");
        expect(leadCase?.statuses.map((s) => s.status_key)).toEqual([
            "open",
            "closed",
            "inactive",
            "archived",
        ]);
    });

    it("Lead / Case Statuses does not contain process movement statuses", () => {
        const leadCase = catalog.find((g) => g.category_key === "lead_statuses");
        const keys = leadCase?.statuses.map((s) => s.status_key) ?? [];
        expect(keys).not.toContain("tour_requested");
        expect(keys).not.toContain("enrolling");
        expect(keys).not.toContain("waitlisted");
        expect(keys).not.toContain("new_inquiry");
    });

    it("Enrollment Statuses does not contain generic container statuses", () => {
        const enrollment = catalog.find((g) => g.category_key === "enrollment_statuses");
        const keys = enrollment?.statuses.map((s) => s.status_key) ?? [];
        expect(keys).not.toContain("open");
        expect(keys).not.toContain("closed");
        expect(keys).not.toContain("inactive");
        expect(keys).not.toContain("archived");
    });

    it("People Statuses contains profile vocabulary", () => {
        const people = catalog.find((g) => g.category_key === "person_statuses");
        expect(people?.statuses.map((s) => s.status_label)).toEqual([
            "Pre-Enrolled",
            "Active",
            "Inactive",
            "Archived",
        ]);
    });

    it("classifies legacy lead_pipeline metadata as enrollment process", () => {
        const legacy = catalogRow("opportunities", "new_inquiry", "New Lead", 5, {
            alloy_layer: "lead_pipeline",
            process_stage_key: "lead",
        });
        expect(isEnrollmentProcessStatusRow(legacy)).toBe(true);
        expect(isLeadCaseContainerStatusRow(legacy)).toBe(false);
        expect(resolveStatusSettingsCategoryKey(legacy)).toBe("enrollment_statuses");
    });

    it("BP picker omits Advanced/system statuses", () => {
        expect(bpCatalog.some((g) => g.category_key === "system_statuses")).toBe(false);
        expect(bpCatalog.map((g) => g.category_key)).toEqual([
            "enrollment_statuses",
            "lead_statuses",
            "person_statuses",
        ]);
    });

    it("all enrollment stages default to Enrollment Statuses", () => {
        expect(defaultCategoryKeysForEnrollmentStage("lead", "family_track")).toEqual([
            "enrollment_statuses",
        ]);
        expect(defaultCategoryKeysForEnrollmentStage("waitlist", "child_track")).toEqual([
            "enrollment_statuses",
        ]);
    });

    it("converts legacy flat keys into enrollment category rollup on read", () => {
        const rollup = resolveStatusRollupForStage({
            savedRollup: null,
            stageKey: "lead",
            trackKey: "family_track",
            catalog: bpCatalog,
            legacySelectedKeys: ["new_inquiry", "needs_qualification"],
        });
        expect(rollup.categories[0]?.category_key).toBe("enrollment_statuses");
        expect(rollup.categories[0]?.selected_status_keys.sort()).toEqual(
            ["new_inquiry", "needs_qualification"].sort()
        );
    });

    it("migrates legacy lead_statuses selections with process keys to enrollment", () => {
        const rollup = resolveStatusRollupForStage({
            savedRollup: {
                version: 1,
                categories: [
                    {
                        category_key: "lead_statuses",
                        entity_type: "opportunities",
                        label: "Lead statuses",
                        selected_status_keys: ["new_inquiry", "open"],
                    },
                ],
            },
            stageKey: "lead",
            trackKey: "family_track",
            catalog: bpCatalog,
        });
        const enrollment = rollup.categories.find((c) => c.category_key === "enrollment_statuses");
        const leadCase = rollup.categories.find((c) => c.category_key === "lead_statuses");
        expect(enrollment?.selected_status_keys).toEqual(["new_inquiry"]);
        expect(leadCase?.selected_status_keys).toEqual(["open"]);
    });

    it("flattens selected keys across categories for runtime sync", () => {
        const rollup: StatusRollupV1 = {
            version: 1,
            categories: [
                {
                    category_key: "enrollment_statuses",
                    entity_type: "enrollment_mixed",
                    label: "Enrollment Statuses",
                    selected_status_keys: ["new_inquiry", "waitlisted"],
                },
                {
                    category_key: "lead_statuses",
                    entity_type: "opportunities",
                    label: "Lead / Case Statuses",
                    selected_status_keys: ["open"],
                },
            ],
        };
        expect(flattenStatusRollupKeys(rollup).sort()).toEqual(
            ["new_inquiry", "open", "waitlisted"].sort()
        );
    });

    it("parses persisted status_rollup_v1 shape", () => {
        const parsed = parseStatusRollupV1({
            version: 1,
            categories: [
                {
                    category_key: "enrollment_statuses",
                    entity_type: "enrollment_mixed",
                    label: "Enrollment Statuses",
                    selected_status_keys: ["new_inquiry"],
                },
            ],
        });
        expect(parsed?.categories[0]?.selected_status_keys).toEqual(["new_inquiry"]);
    });

    it("BP picker UI renders collapsed category sections", () => {
        const editor = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/lifecycle/LifecycleStageStatusRollupEditor.tsx"),
            "utf8"
        );
        const statuses = readFileSync(
            resolve(__dirname, "../../app/legacy-admin/system/statuses/StatusesClient.tsx"),
            "utf8"
        );
        expect(editor).toContain("expandedCategories");
        expect(editor).toContain("ChevronDown");
        expect(editor).toContain("lifecycle-status-category-panel-");
        expect(editor).not.toMatch(/>\s*\{optionKey\}\s*</);
        expect(statuses).toContain("statusCategorySections");
        expect(statuses).toContain("data-status-settings-category=");
    });

    it("save path persists status_rollup_v1", () => {
        const save = readFileSync(
            resolve(__dirname, "../../lib/lifecycle/saveLifecycleStageRuntimeConfig.ts"),
            "utf8"
        );
        const route = readFileSync(
            resolve(
                __dirname,
                "../../app/api/admin/enrollment-process/stage-runtime-config/route.ts"
            ),
            "utf8"
        );
        expect(save).toContain("applyStatusRollupDraft");
        expect(route).toContain("status_rollup_v1");
    });

    it("toggle status within category updates rollup draft", () => {
        let rollup: StatusRollupV1 = assignKeysToCategories(bpCatalog, ["enrollment_statuses"], []);
        rollup = toggleStatusInRollup(rollup, "enrollment_statuses", "new_inquiry", true);
        expect(rollup.categories[0]?.selected_status_keys).toEqual(["new_inquiry"]);
    });

    it("category repair migration reclassifies container vs process metadata", () => {
        const sql = readFileSync(
            resolve(
                __dirname,
                "../../../supabase/migrations/20260613120000_status_settings_category_repair.sql"
            ),
            "utf8"
        );
        expect(sql).toContain("'status_settings_category', 'lead_statuses'");
        expect(sql).toContain("'status_settings_category', 'enrollment_statuses'");
        expect(sql).toContain("'alloy_layer', 'enrollment_process'");
        expect(sql.toLowerCase()).not.toContain("delete from");
    });

    it("supports multiple enabled categories", () => {
        const base: StatusRollupV1 = {
            version: 1,
            categories: [
                {
                    category_key: "enrollment_statuses",
                    entity_type: "enrollment_mixed",
                    label: "Enrollment Statuses",
                    selected_status_keys: [],
                },
            ],
        };
        const leadGroup = bpCatalog.find((g) => g.category_key === "lead_statuses")!;
        const next = toggleCategoryEnabled(base, leadGroup, true);
        expect(next.categories.map((c) => c.category_key)).toEqual([
            "enrollment_statuses",
            "lead_statuses",
        ]);
    });
});
