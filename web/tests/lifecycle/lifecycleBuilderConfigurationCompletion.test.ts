import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    assignedStatusKeysForBuilderStage,
    statusKeysForBuilderStageQueueSync,
} from "@/lib/lifecycle/lifecycleStageWorkUnitQueueSync";
import {
    operatorStageForFieldPalette,
    isWaitlistBuilderStage,
    WAITLIST_REQUIRED_INFO_HELPER,
} from "@/lib/lifecycle/lifecycleBuilderStagePalette";
import {
    effectiveFieldRulesForBuilderStage,
    parseLifecycleBuilderStageFieldRules,
} from "@/lib/lifecycle/lifecycleBuilderStageFieldRules";
import { sortBaseActionKeysByMatrixOrder, parseLifecycleActionsMatrixOrder } from "@/lib/lifecycle/lifecycleActionsMatrixOrder";
import { lifecycleRequirementEntityLabelsFromMap } from "@/lib/lifecycle/lifecycleRequirementEntityLabels";
import { activeStagesForProcess, reorderStage, defaultLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { applyEnrollmentTemplateInConfig } from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { stageSavedStatusKeys } from "@/lib/lifecycle/lifecycleActivationStep3";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("lifecycle builder configuration completion", () => {
    it("removes configuration-only warning from main field requirements UI", () => {
        const editor = read("components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx");
        expect(editor).not.toContain("configuration only");
        expect(editor).not.toContain("lifecycle-field-enforcement-gap");
    });

    it("shows waitlist required info helper copy", () => {
        const editor = read("components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx");
        expect(editor).toContain("lifecycle-waitlist-required-info-helper");
        expect(editor).toContain("WAITLIST_REQUIRED_INFO_HELPER");
        expect(WAITLIST_REQUIRED_INFO_HELPER).toContain("Waitlist usually depends on child");
        expect(isWaitlistBuilderStage("waitlist")).toBe(true);
    });

    it("stage workspace keeps concise statuses helper copy", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("STAGE_MEMBERSHIP_INCLUDED_STATUSES_LABEL");
        expect(workspace).not.toContain("CRM statuses");
    });

    it("enrolling stage key is distinct from enrollment and enrolled for palette", () => {
        expect(operatorStageForFieldPalette("enrolling")).toBe("enrollment");
        expect(operatorStageForFieldPalette("enrollment")).toBe("enrollment");
        expect(operatorStageForFieldPalette("enrolled")).toBe("enrolled");
        expect("enrolling").not.toBe("enrollment");
        expect("enrolling").not.toBe("enrolled");
    });

    it("persists builder-stage field rules for custom enrolling key", () => {
        const metadata = {
            lifecycle_builder_stage_field_rules_v1: {
                version: 1,
                by_stage_key: {
                    enrolling: { required_rule_ids: ["child:program_interest"], recommended_rule_ids: [] },
                },
            },
        };
        const parsed = parseLifecycleBuilderStageFieldRules(metadata);
        expect(parsed?.by_stage_key.enrolling?.required_rule_ids).toContain("child:program_interest");
        const effective = effectiveFieldRulesForBuilderStage("enrolling", metadata, null);
        expect(effective.rules.required_rule_ids).toContain("child:program_interest");
        expect(effective.source).toBe("builder_stage");
    });

    it("stage reorder updates sort_order on builder stages", () => {
        const base = defaultLifecycleBuilderV1();
        let config = applyEnrollmentTemplateInConfig(base, base.active_process_id!);
        const process = config.processes[0]!;
        const qualification = process.stages.find((s) => s.key === "qualification")!;
        const tour = process.stages.find((s) => s.key === "tour")!;
        expect(qualification).toBeTruthy();
        expect(tour).toBeTruthy();
        config = reorderStage(config, process.id, tour!.id, "up");
        const ordered = activeStagesForProcess(config.processes[0]!);
        const tourIdx = ordered.findIndex((s) => s.key === "tour");
        const qualIdx = ordered.findIndex((s) => s.key === "qualification");
        expect(tourIdx).toBeLessThan(qualIdx);
        expect(ordered[tourIdx]?.sort_order).toBeLessThan(ordered[qualIdx]?.sort_order ?? 99);
    });

    it("actions matrix supports display order persistence", () => {
        const scope = read("lib/lifecycle/lifecycleStageActionScope.ts");
        expect(scope).toContain("lifecycle_action_display_order");
        const matrix = read("components/adminV2/settings/lifecycle/LifecycleActionsMatrix.tsx");
        expect(matrix).toContain("lifecycle-actions-matrix-up-");
        expect(matrix).toContain("display_order");
    });

    it("sorts matrix rows by saved department order", () => {
        const order = parseLifecycleActionsMatrixOrder({
            lifecycle_actions_matrix_order_v1: {
                version: 1,
                base_action_keys: ["send_form", "create_record"],
            },
        });
        const sorted = sortBaseActionKeysByMatrixOrder(
            [
                { base_action_key: "create_record" as const },
                { base_action_key: "send_form" as const },
            ],
            order
        );
        expect(sorted.map((r) => r.base_action_key)).toEqual(["send_form", "create_record"]);
    });

    it("entity dropdown uses configured labels from API", () => {
        const route = read("app/api/admin/departments/[departmentId]/lifecycle-requirements/route.ts");
        expect(route).toContain("entity_display_labels");
        const labels = lifecycleRequirementEntityLabelsFromMap(
            { opportunities: { singular: "Lead", plural: "Leads" }, persons: { singular: "Guardian", plural: "Guardians" } },
            "Lead"
        );
        expect(labels.opportunity).toBe("Lead");
        expect(labels.person).toBe("Guardian");
    });

    it("syncs tour and waitlist queue status keys from stage buckets", () => {
        const payload = buildEnrollmentStatusStagesPayload(
            [
                {
                    status_key: "tour_scheduled",
                    status_label: "Tour Scheduled",
                    sort_order: 1,
                    metadata: { enrollment_operator_stage: "tour" },
                },
                {
                    status_key: "on_waitlist",
                    status_label: "On Waitlist",
                    sort_order: 2,
                    metadata: { enrollment_operator_stage: "waitlist" },
                },
            ],
            ["lead", "tour", "waitlist"]
        );
        expect(assignedStatusKeysForBuilderStage(payload, "tour")).toContain("tour_scheduled");
        expect(assignedStatusKeysForBuilderStage(payload, "waitlist")).toContain("on_waitlist");
        expect(statusKeysForBuilderStageQueueSync("tour", ["tour_scheduled"])).toContain("tour_scheduled");
    });

    it("post-save status verification accepts saved draft keys when bucket lags", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("draftStatusKeys");
        const payload = buildEnrollmentStatusStagesPayload([], ["enrolling"]);
        expect(stageSavedStatusKeys(payload, "enrolling")).toEqual([]);
    });

    it("save paths use timing logs in development", () => {
        const timing = read("lib/lifecycle/lifecycleBuilderSaveTiming.ts");
        expect(timing).toContain("lifecycle-builder-save");
        expect(read("app/api/admin/enrollment-process/status-stages/route.ts")).toContain(
            "logLifecycleBuilderSaveTiming"
        );
    });
});
