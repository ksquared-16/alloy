import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import {
    assignKeysToCategories,
    buildStatusCategoryCatalog,
    defaultCategoryKeysForEnrollmentStage,
    resolveStatusCategoryKeyForRow,
    resolveStatusRollupForStage,
} from "@/lib/lifecycle/statusCategoryCatalog";
import {
    flattenStatusRollupKeys,
    parseStatusRollupV1,
    toggleCategoryEnabled,
    toggleStatusInRollup,
    type StatusCategoryGroup,
    type StatusRollupV1,
} from "@/lib/lifecycle/statusRollupV1";

function row(
    entity_type: string,
    status_key: string,
    status_label: string,
    metadata: Record<string, unknown> | null
): StatusDefinitionRow {
    return {
        id: status_key,
        org_id: "org",
        entity_type,
        status_key,
        status_label,
        sort_order: 10,
        is_active: true,
        is_system: false,
        industry_key: null,
        metadata,
    };
}

function catalogRow(
    entity_type: string,
    status_key: string,
    status_label: string,
    sort_order: number,
    metadata: Record<string, unknown> | null
): StatusDefinitionRow {
    return { ...row(entity_type, status_key, status_label, metadata), sort_order };
}

const CATALOG_ROWS = [
    catalogRow("opportunities", "new_inquiry", "New Lead", 5, { alloy_layer: "lead_pipeline" }),
    catalogRow("opportunities", "needs_qualification", "Contacting", 10, {
        alloy_layer: "lead_pipeline",
    }),
    catalogRow("opportunities", "qualified", "Qualified", 15, { alloy_layer: "lead_pipeline" }),
    catalogRow("opportunities", "tour_requested", "Tour Requested", 20, {
        alloy_layer: "lead_pipeline",
    }),
    catalogRow("opportunities", "tour_scheduled", "Tour Scheduled", 25, {
        alloy_layer: "lead_pipeline",
    }),
    catalogRow("opportunities", "tour_completed", "Tour Completed", 30, {
        alloy_layer: "lead_pipeline",
    }),
    catalogRow("opportunities", "decision_pending", "Decision Pending", 35, {
        alloy_layer: "lead_pipeline",
    }),
    catalogRow("opportunities", "open", "Open", 100, { alloy_layer: "case_status" }),
    catalogRow("opportunity_customer_members", "waitlisted", "Waitlisted", 20, {
        alloy_layer: "enrollment_disposition",
    }),
    catalogRow("opportunity_customer_members", "offer_pending", "Offer Pending", 22, {
        alloy_layer: "enrollment_disposition",
    }),
    catalogRow("opportunity_customer_members", "waitlist_paused", "Waitlist Paused", 24, {
        alloy_layer: "enrollment_disposition",
    }),
    catalogRow("opportunity_customer_members", "enrolling", "Enrolling", 30, {
        alloy_layer: "enrollment_disposition",
    }),
    catalogRow("opportunity_customer_members", "enrolled", "Enrolled", 40, {
        alloy_layer: "enrollment_disposition",
    }),
];

describe("status rollup V2 — category model", () => {
    const catalog = buildStatusCategoryCatalog(CATALOG_ROWS);

    it("derives categories from status_definitions metadata", () => {
        expect(resolveStatusCategoryKeyForRow(CATALOG_ROWS[0])).toBe("lead_statuses");
        expect(resolveStatusCategoryKeyForRow(CATALOG_ROWS[8])).toBe("enrollment_statuses");
        expect(resolveStatusCategoryKeyForRow(CATALOG_ROWS[7])).toBe("system_statuses");
    });

    it("lead statuses category includes pipeline vocabulary", () => {
        const lead = catalog.find((g) => g.category_key === "lead_statuses");
        expect(lead?.statuses.map((s) => s.status_label)).toEqual([
            "New Lead",
            "Contacting",
            "Qualified",
            "Tour Requested",
            "Tour Scheduled",
            "Tour Completed",
            "Decision Pending",
        ]);
    });

    it("enrollment statuses category includes child vocabulary", () => {
        const enrollment = catalog.find((g) => g.category_key === "enrollment_statuses");
        expect(enrollment?.statuses.map((s) => s.status_key)).toEqual([
            "waitlisted",
            "offer_pending",
            "waitlist_paused",
            "enrolling",
            "enrolled",
        ]);
    });

    it("lead stage defaults to Lead statuses", () => {
        expect(defaultCategoryKeysForEnrollmentStage("lead", "family_track")).toEqual(["lead_statuses"]);
    });

    it("waitlist stage defaults to Enrollment statuses", () => {
        expect(defaultCategoryKeysForEnrollmentStage("waitlist", "child_track")).toEqual([
            "enrollment_statuses",
        ]);
    });

    it("converts legacy keys into category rollup on read", () => {
        const rollup = resolveStatusRollupForStage({
            savedRollup: null,
            stageKey: "lead",
            trackKey: "family_track",
            catalog,
            legacySelectedKeys: ["new_inquiry", "needs_qualification"],
        });
        expect(rollup.categories[0]?.category_key).toBe("lead_statuses");
        expect(rollup.categories[0]?.selected_status_keys.sort()).toEqual(
            ["new_inquiry", "needs_qualification"].sort()
        );
    });

    it("supports multiple enabled categories", () => {
        const base: StatusRollupV1 = {
            version: 1,
            categories: [
                {
                    category_key: "lead_statuses",
                    entity_type: "opportunities",
                    label: "Lead statuses",
                    selected_status_keys: [],
                },
            ],
        };
        const enrollmentGroup = catalog.find((g) => g.category_key === "enrollment_statuses")!;
        const next = toggleCategoryEnabled(base, enrollmentGroup, true);
        expect(next.categories.map((c) => c.category_key)).toEqual([
            "lead_statuses",
            "enrollment_statuses",
        ]);
    });

    it("flattens selected keys across categories for runtime sync", () => {
        const rollup: StatusRollupV1 = {
            version: 1,
            categories: [
                {
                    category_key: "lead_statuses",
                    entity_type: "opportunities",
                    label: "Lead statuses",
                    selected_status_keys: ["new_inquiry"],
                },
                {
                    category_key: "enrollment_statuses",
                    entity_type: "opportunity_customer_members",
                    label: "Enrollment statuses",
                    selected_status_keys: ["waitlisted"],
                },
            ],
        };
        expect(flattenStatusRollupKeys(rollup).sort()).toEqual(["new_inquiry", "waitlisted"]);
    });

    it("parses persisted status_rollup_v1 shape", () => {
        const parsed = parseStatusRollupV1({
            version: 1,
            categories: [
                {
                    category_key: "lead_statuses",
                    entity_type: "opportunities",
                    label: "Lead statuses",
                    selected_status_keys: ["new_inquiry"],
                },
            ],
        });
        expect(parsed?.categories[0]?.selected_status_keys).toEqual(["new_inquiry"]);
    });

    it("stage membership UI renders category selector", () => {
        const editor = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/lifecycle/LifecycleStageStatusRollupEditor.tsx"),
            "utf8"
        );
        const workspace = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx"),
            "utf8"
        );
        expect(workspace).toContain("LifecycleStageStatusRollupEditor");
        expect(editor).toContain("lifecycle-status-category-selector");
        expect(editor).toContain("lifecycle-status-category-panel-");
        expect(editor).not.toMatch(/>\s*\{optionKey\}\s*</);
        expect(editor).toContain("{row.status_label}");
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
        expect(save).toContain("persistStatusRollupForLifecycleStageSave");
        expect(save).toContain("statusRollup");
        expect(route).toContain("status_rollup_v1");
    });

    it("generic Open/Closed only appear in system category", () => {
        const system = catalog.find((g) => g.category_key === "system_statuses");
        const lead = catalog.find((g) => g.category_key === "lead_statuses");
        expect(system?.statuses.some((s) => s.status_key === "open")).toBe(true);
        expect(lead?.statuses.some((s) => s.status_key === "open")).toBe(false);
    });

    it("toggle status within category updates rollup draft", () => {
        let rollup: StatusRollupV1 = assignKeysToCategories(catalog, ["lead_statuses"], []);
        rollup = toggleStatusInRollup(rollup, "lead_statuses", "new_inquiry", true);
        expect(rollup.categories[0]?.selected_status_keys).toEqual(["new_inquiry"]);
    });
});
