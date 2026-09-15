/**
 * THE PARITY PROOF FOR MOVING PROJECTION TO THE SERVER.
 *
 * The Focus Panel's operational projections run in the browser today: `BusinessProcessCard` calls
 * `buildBusinessProcessCardEvidence` and `projectProcessCardCommands` in `useMemo`, and
 * `CurrentWorkCard` calls `projectCurrentWork`. That is why the provisioning answer must ship 78KB
 * of raw configuration — measured 100% identical between consecutive subject selections — so the
 * browser can re-derive what the server already knew.
 *
 * `projectFocusPanelOperational` moves WHERE that happens without touching WHAT it means. This file
 * is the evidence for the second half of that sentence: for every fixture below, the chokepoint's
 * output is deep-equal to calling the same canonical functions the way the cards call them today.
 *
 * Deep equality is the right bar here precisely BECAUSE the chokepoint delegates. If it ever grows
 * an algorithm of its own — a normalization, a re-order, a "small fix" — these fail, which is the
 * guard against the second projection authority this migration exists to avoid.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { projectFocusPanelOperational } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjection";
import { buildBusinessProcessCardEvidence } from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import { projectProcessCardCommands } from "@/lib/adminV2/runtime/focusPanel/businessProcess/projectProcessCardCommands";
import { projectCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const NULL_SIGNALS = {
    work: { nextActionLabel: null, nextActionRef: null, openWorkCount: 0, workItems: [] },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
    communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
    billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
} as unknown as OperationalContext["signals"];

/**
 * A REAL published operating plan, trimmed.
 *
 * Copied from the live Firefly answer rather than invented: an earlier hand-written fixture used
 * `work_key` and a `checklist` array, and the published shape uses `template_key` and carries no
 * checklist at all — so the projection threw on it. A fixture whose shape the product never
 * produces proves nothing about the product.
 */
const REAL_OPERATING_PLAN = {
        "version": 1,
        "lifecycle_key": "enrollment",
        "stage_key": "lead",
        "journey_segment": "family",
        "purpose": "Review inbound lead and reach the family.",
        "outgoing_transitions": [
            {
                "transition_ref": "lead_to_tour",
                "source_stage_key": "lead",
                "target_stage_key": "tour",
                "label": "Move to Tour",
                "available": true
            }
        ],
        "outcomes": [
            {
                "outcome_key": "reached_qualified",
                "label": "Reached / Qualified",
                "work_template_key": "contact_family",
                "successful": true,
                "completes_work": true
            },
            {
                "outcome_key": "left_message",
                "label": "Left Message",
                "work_template_key": "contact_family"
            }
        ],
        "outcome_rules": [
            {
                "rule_key": "reached_move",
                "when_outcome_key": "reached_qualified",
                "targets": [
                    {
                        "kind": "update_family_case_status",
                        "status_key": "open"
                    },
                    {
                        "kind": "mark_stage_work_complete"
                    }
                ]
            }
        ],
        "attention_rules": [
            {
                "rule_key": "review_lead_overdue",
                "kind": "work_overdue",
                "targets": [
                    {
                        "kind": "create_needs_attention",
                        "attention_reason": "Review Lead overdue after 1 day",
                        "wait_bucket": "waiting_on_staff"
                    }
                ],
                "label": "Review Lead overdue",
                "severity": "medium",
                "threshold": 1,
                "threshold_duration": {
                    "offset_value": 1,
                    "offset_unit": "days"
                },
                "template_key": "review_lead"
            }
        ],
        "work_templates": [
            {
                "template_key": "contact_family",
                "label": "Contact Family",
                "required": true,
                "due_policy": {
                    "kind": "offset_days",
                    "days": 1
                },
                "owner_strategy": "record_owner",
                "description": "Reach the family, understand their needs, and determine the next step.",
                "work_definition_key": "contact_family",
                "primary": true,
                "completion_policy": {
                    "min_attempts": 3,
                    "max_attempts": 3,
                    "window_days": 7,
                    "repeat_until_outcome": true,
                    "repeat_due_days": 2,
                    "sufficient_command_results": [
                        {
                            "capability": "schedule_tour",
                            "result": "confirmed",
                            "satisfies_outcome_key": "tour_scheduled"
                        }
                    ]
                },
                "execution_mode": "direct_action",
                "primary_action": {
                    "action_ref": "quick_message",
                    "override_label": "Contact Family"
                },
                "helpful_actions": [
                    {
                        "action_ref": "schedule_tour"
                    },
                    {
                        "action_ref": "send_tour_invitation"
                    },
                    {
                        "action_ref": "move_to_waitlist"
                    },
                    {
                        "action_ref": "add_child"
                    }
                ],
                "alternate_paths": [
                    {
                        "transition_ref": "move_to_stage:waitlist"
                    },
                    {
                        "transition_ref": "move_to_stage:tour"
                    },
                    {
                        "action_ref": "close_lead"
                    }
                ],
                "outcome_refs": [
                    {
                        "outcome_ref": "reached_qualified"
                    },
                    {
                        "outcome_ref": "left_message"
                    },
                    {
                        "outcome_ref": "awaiting_response"
                    },
                    {
                        "outcome_ref": "unable_to_reach"
                    },
                    {
                        "outcome_ref": "contact_closed_lost"
                    }
                ]
            }
        ]
    };

const PROCESS_STAGES = [
    { key: "lead", label: "Lead" },
    { key: "tour", label: "Tour" },
    { key: "decision", label: "Decision" },
    { key: "waitlist", label: "Waitlist" },
    { key: "enrolling", label: "Enrolling" },
];

function publishedStageInputs(stageKey: string, options?: { helpful?: string[] }) {
    const template = {
        ...REAL_OPERATING_PLAN.work_templates[0],
        ...(options?.helpful ? { helpful_actions: options.helpful.map((action_ref) => ({ action_ref })) } : {}),
    };
    return {
        operatingPlan: { ...REAL_OPERATING_PLAN, stage_key: stageKey, work_templates: [template] },
        actionCatalog: null,
        fieldRules: null,
        processKey: "enrollment",
        stageKey,
        departmentMetadata: {},
        processStages: PROCESS_STAGES,
    } as unknown as OperationalContext["publishedStageInputs"];
}

function context(partial: Partial<OperationalContext>): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Test Family" },
        businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
        perspective: null,
        truth: {},
        signals: NULL_SIGNALS,
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
        ...partial,
    } as OperationalContext;
}

/**
 * The mandated parity matrix, expressed as contexts.
 *
 * Grain, stage and published configuration are what the projections actually read, so these are the
 * dimensions that can diverge. A fixture with NO published inputs is included deliberately: that is
 * the pre-settlement frame, and it is where an eager chokepoint would most plausibly differ.
 */
const FIXTURES: { name: string; context: OperationalContext }[] = [
    { name: "Lead family", context: context({ publishedStageInputs: publishedStageInputs("lead") }) },
    {
        name: "Tour family",
        context: context({
            businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "tour" },
            publishedStageInputs: publishedStageInputs("tour"),
            signals: { ...NULL_SIGNALS, tour: { scheduled: true, startAt: "2026-09-20T15:00:00Z", statusLabel: "Scheduled", statusKey: "scheduled", bookingId: "bk-1" } } as unknown as OperationalContext["signals"],
        }),
    },
    {
        name: "Waitlist child",
        context: context({
            grain: "child",
            subject: { type: "customer_member", id: "cm-1", label: "Child A" },
            businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "waitlist" },
            publishedStageInputs: publishedStageInputs("waitlist"),
        }),
    },
    {
        name: "Enrolling child",
        context: context({
            grain: "child",
            subject: { type: "customer_member", id: "cm-2", label: "Child B" },
            businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "enrolling" },
            publishedStageInputs: publishedStageInputs("enrolling"),
        }),
    },
    {
        name: "mixed-grain family — family Lead with child participants",
        context: context({
            publishedStageInputs: publishedStageInputs("lead"),
            truth: { _inquiry_children: [{ id: "cm-1", name: "Child A", stage_key: "waitlist" }, { id: "cm-2", name: "Child B", stage_key: "enrolling" }] } as unknown as OperationalContext["truth"],
        }),
    },
    {
        name: "composed stage + work actions",
        context: context({ publishedStageInputs: publishedStageInputs("lead", { helpful: ["contact_family", "schedule_tour", "move_to_waitlist", "add_child"] }) }),
    },
    {
        name: "attention / blocked",
        context: context({
            publishedStageInputs: publishedStageInputs("lead"),
            signals: { ...NULL_SIGNALS, attention: { needsAttention: true, primaryReason: "missing_health_form", reasonCount: 2 } } as unknown as OperationalContext["signals"],
        }),
    },
    {
        name: "no published inputs — the pre-settlement frame",
        context: context({ publishedStageInputs: null }),
    },
    {
        name: "cannot mutate",
        context: context({ publishedStageInputs: publishedStageInputs("lead"), capabilities: { canMutate: false, maskedChannels: false } }),
    },
];

describe("server projection is byte-for-byte what the browser produces today", () => {
    for (const fixture of FIXTURES) {
        it(`${fixture.name}`, () => {
            // THE CLIENT PATH, called exactly as the cards call it.
            const clientEvidence = buildBusinessProcessCardEvidence(fixture.context, { selectedParticipantId: null });
            const clientCommands = projectProcessCardCommands(fixture.context);
            const clientCurrentWork = projectCurrentWork(fixture.context);

            const server = projectFocusPanelOperational({ context: fixture.context, selectedParticipantId: null });

            expect(server.businessProcess.evidence).toEqual(clientEvidence);
            expect(server.businessProcess.commands).toEqual(clientCommands);
            expect(server.currentWork).toEqual(clientCurrentWork);
        });
    }

    it("carries the selected participant through unchanged", () => {
        const ctx = FIXTURES[4].context;
        const server = projectFocusPanelOperational({ context: ctx, selectedParticipantId: "cm-2" });
        expect(server.businessProcess.evidence).toEqual(
            buildBusinessProcessCardEvidence(ctx, { selectedParticipantId: "cm-2" }),
        );
    });

    it("defaults the participant to absent, which means no emphasis — never 'pick one'", () => {
        const ctx = FIXTURES[4].context;
        expect(projectFocusPanelOperational({ context: ctx })).toEqual(
            projectFocusPanelOperational({ context: ctx, selectedParticipantId: null }),
        );
    });

    it("produces command verdicts, so the browser binds handlers to a decision it did not make", () => {
        const server = projectFocusPanelOperational({ context: FIXTURES[5].context });
        // Whatever the configuration selected, each command arrives already judged.
        for (const command of server.businessProcess.commands.commands) {
            expect(command).toHaveProperty("status");
            expect(command).toHaveProperty("key");
        }
    });
});

describe("the chokepoint delegates and never re-implements", () => {
    const src = readFileSync(
        resolve(__dirname, "../../lib/adminV2/runtime/focusPanel/focusPanelOperationalProjection.ts"),
        "utf8",
    );
    const code = src
        .split("\n")
        .filter((line) => {
            const t = line.trimStart();
            return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
        })
        .join("\n");

    it("calls the existing canonical owners", () => {
        expect(code).toContain("buildBusinessProcessCardEvidence(context");
        expect(code).toContain("projectProcessCardCommands(context)");
        expect(code).toContain("projectCurrentWork(context)");
    });

    it("declares no model of its own — the envelope reuses existing types", () => {
        // A V2 model is the second authority this migration exists to avoid. Scoped to DECLARED
        // names: `adminV2` is in every import path here and is the module namespace, not a model.
        expect(code).not.toMatch(/(type|const|function)\s+\w*V2\b/);
        for (const shape of ["interface ", "class "]) expect(code).not.toContain(shape);
    });

    it("holds no branching of its own, so semantics cannot drift into it", () => {
        // No conditionals beyond the participant default: every decision belongs to a callee.
        const body = code.slice(code.indexOf("export function projectFocusPanelOperational"));
        expect(body).not.toMatch(/\bif\s*\(/);
        expect(body).not.toMatch(/\?\s*[^.]/); // no ternaries (optional chaining is fine)
    });

    it("does NOT carry a server-only marker, which took the panel down", () => {
        /*
         * The marker was in C1 and had to go: this module is reached from graphs the client also
         * imports, and `server-only` anywhere in that graph fails the Ecmascript parse — the Focus
         * Panel rendered nothing. No typecheck and no required gate saw it; a browser render did.
         *
         * Ownership is enforced by WHO CALLS IT — the two server producers — not by a directive.
         */
        expect(code).not.toContain('import "server-only"');
    });
});
