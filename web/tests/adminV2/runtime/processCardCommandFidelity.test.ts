/**
 * THE PROCESS CARD'S COMMAND ROW IS THE PUBLISHED CONFIGURATION'S.
 *
 * These guards hold ONE boundary in place: Business Process configuration decides WHICH commands
 * appear and in WHAT ORDER; the action/capability platform decides WHETHER each of them can run.
 * The regression they exist to catch is the card taking the platform's answer as the question —
 * rendering whatever happened to be executable for the record, which is how the row came to show
 * commands the process never selected.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { projectProcessCardCommands } from "@/lib/adminV2/runtime/focusPanel/businessProcess/projectProcessCardCommands";
import { adaptBusinessProcessEvidenceToProcessCard } from "@/lib/adminV2/runtime/focusPanel/businessProcess/adaptBusinessProcessEvidenceToProcessCard";
import { buildBusinessProcessCardEvidence } from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import { resolvePublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { stageOperatingPlanDraftToPersisted } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import { buildStageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/buildStageWorkOutcomeAutomationPreview";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type {
    OperationalContext,
    OperationalContextSignals,
} from "@/lib/adminV2/runtime/operationalContext/types";

const NULL_SIGNALS: OperationalContextSignals = {
    work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null, bookingId: null },
    communications: {
        scheduledSendCount: 0,
        nextFollowUpAt: null,
        hasOutreach: false,
        nextScheduledSendId: null,
    },
    billing: {
        billingConfigured: false,
        billingContactName: null,
        billingContactEmail: null,
        tuitionRateLabel: null,
        feeBalanceCents: null,
    },
};

function baseContext(partial: Partial<OperationalContext>): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Wright Family" },
        businessProcess: { key: "enrollment", label: "Lead", name: "Enrollment", stageKey: "lead" },
        perspective: null,
        truth: {},
        signals: NULL_SIGNALS,
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
        ...partial,
    };
}

function slots(partial: Partial<ResolvedActionsBySlot>): ResolvedActionsBySlot {
    return {
        primary: [],
        secondary: [],
        overflow: [],
        right_rail: [],
        row_inline: [],
        header: [],
        ...partial,
    };
}

function resolvedAction(key: string, label: string) {
    return {
        key,
        label,
        description: null,
        action_type: "registry" as const,
        icon: null,
        style: null,
        display_style: "outline" as const,
        payload: {},
        workflow_id: null,
    };
}

/**
 * The contact_family work template with an EXPLICIT configured command set. This is the authored
 * artefact under test: a primary command with an override label, and helpful commands in a stated
 * order.
 */
function configuredContactFamilyPlan(helpful: string[], primaryRef = "quick_message"): StageOperatingPlanV1 {
    const defaults = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    const contact = defaults.work_templates.find((t) => t.template_key === "contact_family")!;
    return stageOperatingPlanDraftToPersisted(
        {
            purpose: defaults.purpose ?? "",
            journey_segment: defaults.journey_segment,
            work_templates: [
                {
                    ...contact,
                    primary: true,
                    execution_mode: "direct_action",
                    // The label configuration chose. Identity must survive it.
                    primary_action: { action_ref: primaryRef, override_label: "Contact Family" },
                    helpful_actions: helpful.map((action_ref) => ({ action_ref })),
                    outcome_refs: [],
                },
            ],
            outcomes: defaults.outcomes.filter((o) => o.work_template_key === "contact_family"),
            outcome_rules: defaults.outcome_rules,
            attention_rules: defaults.attention_rules,
        },
        "lead",
    )!;
}

function publishedMetadata(plan: StageOperatingPlanV1, extra?: Record<string, unknown>): Record<string, unknown> {
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: "proc-enrollment",
            processes: [
                {
                    id: "proc-enrollment",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: [
                        {
                            id: "stage-lead",
                            key: "lead",
                            label: "Lead",
                            sort_order: 0,
                            is_active: true,
                            stage_operating_plan_v1: plan,
                            action_catalog_v1: {
                                version: 1,
                                candidate_actions: [
                                    { action_key: "schedule_tour", recommendation: "recommended" },
                                    { action_key: "send_tour_invitation", recommendation: "ready" },
                                    { action_key: "quick_message", recommendation: "ready" },
                                ],
                            },
                        },
                        { id: "stage-tour", key: "tour", label: "Tour", sort_order: 1, is_active: true },
                    ],
                },
            ],
        },
        ...(extra ?? {}),
    };
}

function contactRuntime(plan: StageOperatingPlanV1): StageWorkRuntimeProjection {
    return {
        stage_key: "lead",
        stage_label: "Lead",
        purpose: plan.purpose ?? "",
        journey_segment: plan.journey_segment,
        template_keys: ["contact_family"],
        primary: {
            template_key: "contact_family",
            label: "Contact Family",
            role: "primary",
            state: "open",
            requires_outcome_picker: false,
            work_id: "work-contact",
            due_at: null,
            due_urgency: "none",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: plan.outcomes,
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: buildStageWorkOutcomeAutomationPreview({
                plan,
                templateKey: "contact_family",
            }),
        },
        additional: [],
        execution: {
            department_id: "dept-1",
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
            requires_outcome_picker: false,
        },
    } as unknown as StageWorkRuntimeProjection;
}

function contextFor(options: {
    helpful: string[];
    primaryRef?: string;
    recordHeaderActions?: ResolvedActionsBySlot | null;
    extraMetadata?: Record<string, unknown>;
}): OperationalContext {
    const plan = configuredContactFamilyPlan(options.helpful, options.primaryRef);
    const publishedStageInputs = resolvePublishedStageInputsForCurrentWork({
        departmentMetadata: publishedMetadata(plan, options.extraMetadata),
        builderStageKey: "lead",
    })!;
    return baseContext({
        publishedStageInputs,
        stageWorkRuntime: contactRuntime(plan),
        recordHeaderActions: options.recordHeaderActions ?? null,
    });
}

describe("Process card command fidelity", () => {
    it("never shows an executable action the process did not configure", () => {
        const context = contextFor({
            helpful: ["schedule_tour"],
            // Executable, registry-resolved, and offered on the record header — and NOT configured
            // by the process. This is the exact list the card used to render wholesale.
            recordHeaderActions: slots({
                primary: [resolvedAction("archive_lead", "Archive Lead")],
                secondary: [
                    resolvedAction("send_form", "Send Form"),
                    resolvedAction("add_child", "Add Child"),
                ],
            }),
        });

        const keys = projectProcessCardCommands(context).commands.map((c) => c.key);
        expect(keys).toContain("schedule_tour");
        expect(keys).not.toContain("archive_lead");
        expect(keys).not.toContain("send_form");
        expect(keys).not.toContain("add_child");
    });

    it("carries no commands at all when no published revision governs the subject", () => {
        // Fail closed. A record-header list is not a substitute for configuration, and an empty
        // command row is the honest answer to "what has this process configured here?".
        const projection = projectProcessCardCommands(
            baseContext({
                publishedStageInputs: null,
                recordHeaderActions: slots({ primary: [resolvedAction("archive_lead", "Archive Lead")] }),
            }),
        );
        expect(projection.configured).toBe(false);
        expect(projection.commands).toEqual([]);
    });

    it("preserves configured order through provider → evidence → card", () => {
        const helpful = ["schedule_tour", "send_tour_invitation", "send_form"];
        const context = contextFor({ helpful });
        const projection = projectProcessCardCommands(context);

        const rendered = projection.commands.map((c) => c.key);
        for (let i = 1; i < helpful.length; i += 1) {
            const before = rendered.indexOf(helpful[i - 1]!);
            const after = rendered.indexOf(helpful[i]!);
            expect(before).toBeGreaterThanOrEqual(0);
            expect(after).toBeGreaterThan(before);
        }

        // …and the same order survives the adapter into the locked card's evidence.
        const evidence = adaptBusinessProcessEvidenceToProcessCard({
            evidence: buildBusinessProcessCardEvidence(context, { selectedParticipantId: null }),
            subjectLabel: "Wright Family",
            activity: [],
            actions: projection.commands.map((c) => ({
                key: c.key,
                label: c.label,
                primary: c.prominence === "primary",
            })),
        });
        expect(evidence.actions.map((a) => a.key)).toEqual(rendered);
    });

    it("gives exactly one command the configured lead prominence", () => {
        const projection = projectProcessCardCommands(
            contextFor({ helpful: ["schedule_tour", "send_tour_invitation"] }),
        );
        expect(projection.commands.filter((c) => c.prominence === "primary")).toHaveLength(1);
        expect(projection.commands[0]?.prominence).toBe("primary");
    });

    it("keeps configured identity when configuration renames the command", () => {
        // `quick_message` is configured with override_label "Contact Family". A card that matched
        // on the label would key on a name configuration is free to change tomorrow.
        const projection = projectProcessCardCommands(contextFor({ helpful: [] }));
        const lead = projection.commands.find((c) => c.prominence === "primary")!;
        expect(lead.label).toBe("Contact Family");
        expect(lead.key).not.toBe("Contact Family");
        expect(lead.key).not.toBe("contact_family");
        expect([lead.key, lead.actionRef]).toContain("quick_message");
    });

    it("reports an unregistered configured command as drift instead of dropping it silently", () => {
        const projection = projectProcessCardCommands(
            contextFor({ helpful: ["schedule_tour", "mutation_command"] }),
        );
        // Not rendered — an operator must never read a platform fault as a command.
        expect(projection.commands.map((c) => c.key)).not.toContain("mutation_command");
        // …but not silent either.
        expect(projection.drift.map((d) => d.actionRef)).toContain("mutation_command");
        expect(projection.drift[0]?.code).toBe("configured_command_not_registered");
    });

    it("ignores draft configuration when a published revision governs", () => {
        const withDraft = contextFor({
            helpful: ["schedule_tour"],
            extraMetadata: {
                // A builder draft sitting beside the published payload, configuring another command.
                lifecycle_builder_draft_v1: {
                    version: 1,
                    processes: [
                        {
                            id: "process-enrollment",
                            key: "enrollment",
                            name: "Enrollment",
                            active: true,
                            stages: [
                                {
                                    key: "lead",
                                    label: "Lead",
                                    stage_operating_plan_v1: configuredContactFamilyPlan([
                                        "schedule_tour",
                                        "send_form",
                                    ]),
                                },
                            ],
                        },
                    ],
                },
            },
        });
        const withoutDraft = contextFor({ helpful: ["schedule_tour"] });

        expect(projectProcessCardCommands(withDraft).commands.map((c) => c.key)).toEqual(
            projectProcessCardCommands(withoutDraft).commands.map((c) => c.key),
        );
        expect(projectProcessCardCommands(withDraft).commands.map((c) => c.key)).not.toContain("send_form");
    });

    it("changes with the configuration and with nothing else", () => {
        // The publish-only proof, in a test: same code, same record, two published command sets.
        const before = projectProcessCardCommands(contextFor({ helpful: ["schedule_tour"] }));
        const after = projectProcessCardCommands(
            contextFor({ helpful: ["send_tour_invitation", "schedule_tour"] }),
        );
        expect(before.commands.map((c) => c.key)).not.toEqual(after.commands.map((c) => c.key));
        expect(after.commands.map((c) => c.key)).toContain("send_tour_invitation");
    });

    it("does not read the generic record-header action list", () => {
        /*
         * THE POSITIVE CONTROL FOR THIS WHOLE FILE.
         *
         * Every other guard here tests the projection. This one tests that the card actually uses
         * it: the defect was one `context.recordHeaderActions` read in the provider, and a card that
         * reads it again would satisfy every projection assertion above while still rendering the
         * registry's list.
         */
        const card = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/cards/BusinessProcessCard.tsx"),
            "utf8",
        );
        const code = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        expect(code).not.toContain("recordHeaderActions");
        expect(code).toContain("projectProcessCardCommands");
    });

    it("selects commands with no process or domain branching", () => {
        const sources = [
            "lib/adminV2/runtime/focusPanel/businessProcess/projectProcessCardCommands.ts",
            "components/admin/focusPanel/cards/BusinessProcessCard.tsx",
            "components/operationalCards/ProcessCard.tsx",
        ];
        // Domain names may appear in prose; a domain name in CODE is what makes one process special.
        const domainInCode =
            /(?:if|case|===|!==|\?\.|\[)\s*["'`]?(?:enrollment|billing|vacation|assignment|attendance|waitlist|tour)\b/i;
        for (const relative of sources) {
            const text = readFileSync(path.join(process.cwd(), relative), "utf8");
            const code = text
                // strip block comments
                .replace(/\/\*[\s\S]*?\*\//g, "")
                // strip line comments
                .replace(/^\s*\/\/.*$/gm, "")
                // strip JSX comment blocks
                .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
            expect(domainInCode.test(code), `${relative} branches on a domain key`).toBe(false);
        }
    });
});
