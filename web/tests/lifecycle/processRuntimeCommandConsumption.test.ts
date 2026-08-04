/**
 * P6.S2 — Process runtime Command consumption.
 */

import { describe, expect, it } from "vitest";

import {
    buildEnrollmentLeadProofProcess,
    enrollmentLeadProofActionCatalog,
} from "@/lib/lifecycle/enrollmentLeadProcessCommandAuthority";
import { emptyProcessCommandSetV1 } from "@/lib/lifecycle/processCommandSetV1";
import {
    buildProcessAwareActionAllowlist,
    filterStageCatalogToProcessSelection,
    projectProcessRuntimeCommands,
} from "@/lib/lifecycle/processRuntimeCommandProjection";
import { evaluateStageActionsForProcess } from "@/lib/lifecycle/evaluateStageActionsForProcess";
import { resolveBosProcessEffectiveCommandKeys } from "@/lib/bos/commandSession/slash/resolveBosProcessEffectiveCommandKeys";
import { queryBosSlashCatalog } from "@/lib/bos/commandSession/slash/queryBosSlashCatalog";
import { classifyRecordHeaderActionsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/classifyCurrentWorkActions";
import { resolveCurrentWorkTemplateFromPublishedPlan } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateFromPublishedPlan";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

// Mirrors the canonical construction used by the passing sibling suites (see
// tests/adminV2/runtime/filterRightRailActionsForCurrentWork.test.ts). The old literal carried
// `confirmation`, `requiresEntityId` and `placementId` - none of which are on
// ResolvedActionForClient. Confirmation is owned by the COMMAND runtime
// (CommandExecutionConfirmation / destructive confirmationPolicy), not by the action
// presentation contract, and this test asserts neither: it only classifies actions into
// Current Work buckets.
function registryAction(key: string, label: string): ResolvedActionForClient {
    return {
        key,
        label,
        description: null,
        action_type: "registry",
        icon: null,
        style: null,
        display_style: "outline",
        payload: {},
        workflow_id: null,
    };
}

describe("P6.S2 process runtime projection", () => {
    it("uses command_set_v1 when present and preserves process order", () => {
        const process = buildEnrollmentLeadProofProcess({ withCommandSet: true });
        const projection = projectProcessRuntimeCommands({
            process,
            stageKey: "lead",
        });
        expect(projection.authority).toBe("command_set_v1");
        expect(projection.commandSetPresent).toBe(true);
        expect(projection.enforceAllowlist).toBe(true);
        expect([...projection.selectedEnabledKeys]).toEqual(
            expect.arrayContaining(["quick_message", "schedule_tour"])
        );
        expect(projection.diagnostics.some((d) => d.code === "runtime_projection")).toBe(true);
    });

    it("explicit-empty V1 enforces empty allowlist with no legacy fallback", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: emptyProcessCommandSetV1(),
        });
        const projection = projectProcessRuntimeCommands({
            process,
            stageKey: "lead",
            stageActionCatalog: enrollmentLeadProofActionCatalog(),
        });
        expect(projection.authority).toBe("command_set_v1");
        expect(projection.selectedEnabledKeys.length).toBe(0);
        expect(projection.enforceAllowlist).toBe(true);

        const allowlist = buildProcessAwareActionAllowlist({
            projection,
            stageActionCatalog: enrollmentLeadProofActionCatalog(),
            explicitTemplateRefs: [],
        });
        expect(allowlist.enforce).toBe(true);
        expect(allowlist.keys.size).toBe(0);

        const classified = classifyRecordHeaderActionsForCurrentWork({
            recordHeaderSlots: {
                ...emptyResolvedActionsBySlot(),
                primary: [registryAction("schedule_tour", "Schedule tour")],
            },
            showOutcomeCompletion: false,
            primaryActionLabel: null,
            allowedActionKeys: allowlist.keys,
            enforceActionAllowlist: allowlist.enforce,
        });
        expect(classified.supporting).toHaveLength(0);
        expect(classified.communicationActions).toHaveLength(0);
    });

    it("does not promote stage orphans into selection", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "quick_message", enabled: true }],
            },
        });
        const catalog = enrollmentLeadProofActionCatalog();
        const projection = projectProcessRuntimeCommands({
            process,
            stageKey: "lead",
            stageActionCatalog: catalog,
        });
        const filtered = filterStageCatalogToProcessSelection(catalog, projection);
        expect(filtered?.candidate_actions.map((c) => c.action_key)).toEqual(["quick_message"]);
        expect(projection.stageOrphanKeys.length).toBeGreaterThan(0);
    });

    it("legacy fallback remains observable when V1 absent", () => {
        const process = buildEnrollmentLeadProofProcess();
        const projection = projectProcessRuntimeCommands({
            process,
            stageKey: "lead",
        });
        expect(projection.authority).toBe("legacy_compatibility");
        expect(projection.enforceAllowlist).toBe(false);
        expect(projection.diagnostics.some((d) => d.code === "legacy_runtime_consumer")).toBe(true);
    });
});

describe("P6.S2 stage evaluation", () => {
    it("evaluates selected Commands and diagnoses unselected keys", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [
                    { capability_key: "quick_message", enabled: true },
                    { capability_key: "schedule_tour", enabled: true },
                ],
            },
        });
        const result = evaluateStageActionsForProcess({
            process,
            stageKey: "lead",
            stageCatalog: enrollmentLeadProofActionCatalog(),
            resolvedActionKeys: ["quick_message", "schedule_tour", "close_lead"],
            subjectGrain: "opportunity",
        });
        expect(result.evaluated.map((e) => e.key)).toEqual(
            expect.arrayContaining(["quick_message", "schedule_tour"])
        );
        expect(result.orphans.map((o) => o.key)).toContain("close_lead");
        expect(result.orphans.every((o) => o.state === "unavailable")).toBe(true);
        expect(result.diagnostics.some((d) => d.code === "stage_evaluation_unselected")).toBe(true);
    });
});

describe("P6.S2 Current Work catalog fallback", () => {
    it("gates catalog-invented helpful actions by process selection", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "schedule_tour", enabled: true }],
            },
        });
        const projection = projectProcessRuntimeCommands({
            process,
            stageKey: "lead",
            stageActionCatalog: enrollmentLeadProofActionCatalog(),
        });
        const resolved = resolveCurrentWorkTemplateFromPublishedPlan({
            operatingPlan: {
                version: 1,
                lifecycle_key: "enrollment",
                stage_key: "lead",
                // journey_segment is "family" for every enrollment family-side stage in the
                // canonical plan (defaultEnrollmentStageOperatingPlans.ts). The three rule
                // collections are required but this test authors none — it exercises the
                // catalog-fallback path for helpful_actions — so empty is the honest value,
                // not a placeholder.
                journey_segment: "family",
                outcomes: [],
                outcome_rules: [],
                attention_rules: [],
                work_templates: [
                    {
                        template_key: "contact_family",
                        label: "Contact Family",
                        required: true,
                        primary: true,
                        // due_policy and owner_strategy became required on StageWorkTemplateV1 and
                        // have NO platform default — parseWorkTemplate rejects a template missing
                        // either. These are not invented: they are the values the canonical plan
                        // ships for this exact identity (enrollment / lead / contact_family) in
                        // defaultEnrollmentStageOperatingPlans.ts.
                        due_policy: { kind: "offset_days", days: 1 },
                        owner_strategy: "record_owner",
                        // still no helpful_actions → catalog fallback (the behaviour under test)
                    },
                ],
            },
            actionCatalog: enrollmentLeadProofActionCatalog(),
            fieldRules: null,
            processKey: "enrollment",
            stageKey: "lead",
            departmentMetadata: {},
            processStages: [{ key: "lead", label: "Lead" }],
            commandProjection: projection,
            stageWorkRuntime: null,
            recordHeaderActions: null,
        });
        expect(resolved?.templateConfig.helpful_actions?.map((r) => r.action_ref)).toEqual([
            "schedule_tour",
        ]);
        // Orphans from catalog (send_form, close_lead, quick_message) must not appear as helpful.
        expect(resolved?.templateConfig.communication_actions ?? []).toEqual([]);
    });
});

describe("P6.S2 BOS process-aware resolution", () => {
    it("filters slash eligibility by process-effective keys", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "create_lead", enabled: true }],
            },
        });
        const keys = resolveBosProcessEffectiveCommandKeys({ process });
        expect(keys.has("create_lead")).toBe(true);

        const withProcess = queryBosSlashCatalog({
            query: "/create",
            processEffectiveCommandKeys: keys,
            authorized: true,
        });
        expect(withProcess.some((d) => d.actionKey === "create_lead" && d.eligible)).toBe(true);

        const emptyProcess = buildEnrollmentLeadProofProcess({
            commandSet: emptyProcessCommandSetV1(),
        });
        const emptyKeys = resolveBosProcessEffectiveCommandKeys({ process: emptyProcess });
        const blocked = queryBosSlashCatalog({
            query: "/create",
            processEffectiveCommandKeys: emptyKeys,
            authorized: true,
        });
        const create = blocked.find((d) => d.actionKey === "create_lead");
        expect(create?.eligible).toBe(false);
        expect(create?.ineligibleReason).toMatch(/process/i);
    });

    it("does not invent unselected Commands as eligible", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "quick_message", enabled: true }],
            },
        });
        const keys = resolveBosProcessEffectiveCommandKeys({ process });
        expect(keys.has("create_lead")).toBe(false);
        const results = queryBosSlashCatalog({
            query: "/create",
            processEffectiveCommandKeys: keys,
            authorized: true,
        });
        expect(results.find((d) => d.actionKey === "create_lead")?.eligible).toBe(false);
    });
});
