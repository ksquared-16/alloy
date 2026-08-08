/**
 * Contact Family — integrated and external execution paths.
 *
 * Asserts the decision logic (not the DB): the integrated path completes work via
 * effective sufficiency (explicit config → platform default for canonical templates
 * → no inference), stamping integrated provenance; the external path records an
 * operator declaration with external_manual provenance and fabricates no send.
 * DB-boundary collaborators are stubbed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- DB-boundary + config-source collaborators are stubbed; the resolver runs for real. ---
vi.mock("@/lib/lifecycle/completeStageWorkWithOutcome", () => ({
    completeStageWorkWithOutcome: vi.fn(async () => ({ ok: true, work_closed: false })),
}));
vi.mock("@/lib/lifecycle/resolveStageWorkOutcomeContext", () => ({
    resolveEnrollmentDepartmentForOpportunity: vi.fn(async () => "dept-1"),
}));
vi.mock("@/lib/admin/operationalWork/operationalWorkService", () => ({
    listWorkForEntity: vi.fn(),
}));
vi.mock("@/lib/admin/operationalWork/operationalWorkMetadata", () => ({
    parseOperationalWorkViewFromTaskRow: vi.fn(() => currentWorkView),
}));
vi.mock("@/lib/lifecycle/lifecycleBuilderConfig", () => ({
    lifecycleBuilderFromDepartmentMetadata: vi.fn(() => ({})),
    activeLifecycleProcess: vi.fn(() => ({ stages: [{ key: "lead", is_active: true }] })),
}));
vi.mock("@/lib/lifecycle/resolveEffectiveStageOperatingPlan", () => ({
    resolveEffectiveStageOperatingPlan: vi.fn(() => ({
        plan: currentPlan,
        source: currentPlan ? "explicit" : null,
        stageRecord: null,
        processKey: "enrollment",
    })),
}));

import { associateOutboundCommunicationToContactAttempt } from "@/lib/lifecycle/associateOutboundCommunicationToContactAttempt";
import { reportExternalContact } from "@/lib/lifecycle/reportExternalContact";
import { completeStageWorkWithOutcome } from "@/lib/lifecycle/completeStageWorkWithOutcome";
import { listWorkForEntity } from "@/lib/admin/operationalWork/operationalWorkService";
import { parseOperationalWorkViewFromTaskRow } from "@/lib/admin/operationalWork/operationalWorkMetadata";

const complete = vi.mocked(completeStageWorkWithOutcome);
const listWork = vi.mocked(listWorkForEntity);
const parseWork = vi.mocked(parseOperationalWorkViewFromTaskRow);

// The plan the resolver mock returns — carries the real completion_policy shape.
let currentPlan: unknown;
let currentWorkView: {
    context_snapshot: { lifecycle_stage_key: string };
    work_definition_key: string;
};

const planWithExplicitPolicy = {
    journey_segment: "family",
    stage_key: "lead",
    work_templates: [
        {
            template_key: "contact_family",
            work_definition_key: "contact_family",
            completion_policy: {
                sufficient_command_results: [
                    { capability: "communications_send", result: "sent", satisfies_outcome_key: "left_message" },
                ],
            },
        },
    ],
    outcomes: [{ outcome_key: "left_message", label: "Left Message" }],
};

/** Canonical contact_family with attempt cadence but no explicit sufficiency — platform default applies. */
const planContactFamilyNoSufficiency = {
    journey_segment: "family",
    stage_key: "lead",
    work_templates: [
        {
            template_key: "contact_family",
            work_definition_key: "contact_family",
            completion_policy: { min_attempts: 3, window_days: 7 },
        },
    ],
    outcomes: [{ outcome_key: "left_message", label: "Left Message" }],
};

/** Explicit reply-required override — sent must not complete. */
const planReplyRequired = {
    journey_segment: "family",
    stage_key: "lead",
    work_templates: [
        {
            template_key: "contact_family",
            work_definition_key: "contact_family",
            completion_policy: {
                sufficient_command_results: [
                    { capability: "communications_send", result: "replied", satisfies_outcome_key: "reached_family" },
                ],
            },
        },
    ],
    outcomes: [{ outcome_key: "reached_family", label: "Reached Family" }],
};

/** Firefly footgun: authored tour sufficiency only — communications must still use platform default. */
const planTourOnlySufficiency = {
    journey_segment: "family",
    stage_key: "lead",
    work_templates: [
        {
            template_key: "contact_family",
            work_definition_key: "contact_family",
            completion_policy: {
                min_attempts: 3,
                window_days: 7,
                sufficient_command_results: [
                    {
                        capability: "schedule_tour",
                        result: "confirmed",
                        satisfies_outcome_key: "tour_scheduled",
                    },
                ],
            },
        },
    ],
    outcomes: [
        { outcome_key: "left_message", label: "Left Message" },
        { outcome_key: "tour_scheduled", label: "Tour Scheduled" },
    ],
};

/** Unknown/custom work — no platform default; no inference. */
const planCustomWorkNoPolicy = {
    journey_segment: "family",
    stage_key: "lead",
    work_templates: [
        {
            template_key: "custom_outreach",
            work_definition_key: "custom_outreach",
        },
    ],
    outcomes: [{ outcome_key: "left_message", label: "Left Message" }],
};

// Minimal chainable supabase stub (only departments.select().maybeSingle() is read here).
const supabaseStub = {
    from: () => ({
        select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: {} } }) }) }),
        }),
        update: () => ({ eq: () => ({ eq: async () => ({}) }) }),
    }),
} as never;

const baseIntegrated = {
    supabase: supabaseStub,
    orgId: "org-1",
    userId: "user-1",
    opportunityId: "opp-1",
    channel: "sms" as const,
};

beforeEach(() => {
    complete.mockClear();
    listWork.mockClear();
    complete.mockResolvedValue({ ok: true, work_closed: false } as never);
    listWork.mockResolvedValue({ ok: true, rows: [{ id: "task-1", status: "open", metadata: {} }] } as never);
    currentPlan = planWithExplicitPolicy;
    currentWorkView = {
        context_snapshot: { lifecycle_stage_key: "lead" },
        work_definition_key: "contact_family",
    };
    parseWork.mockImplementation(() => currentWorkView as never);
});

describe("integrated contact — effective sufficiency + integrated provenance", () => {
    it("completes the open work with the CONFIGURED outcome (not sent_text) and integrated provenance", async () => {
        const res = await associateOutboundCommunicationToContactAttempt({
            ...baseIntegrated,
            result: "sent",
            communicationMessageId: "msg-1",
        });
        expect(res.associated).toBe(true);
        expect(res.outcome_key).toBe("left_message");
        expect(complete).toHaveBeenCalledTimes(1);
        const arg = complete.mock.calls[0]![0];
        expect(arg.outcomeKey).toBe("left_message");
        expect(arg.declaration).toEqual({ provenance: "integrated", channel: "sms" });
        expect(arg.subject).toEqual({ journey_segment: "family", opportunity_id: "opp-1" });
    });

    it("canonical Contact Family without explicit sufficiency uses the platform default (sent → left_message)", async () => {
        currentPlan = planContactFamilyNoSufficiency;
        const res = await associateOutboundCommunicationToContactAttempt({ ...baseIntegrated, result: "sent" });
        expect(res.associated).toBe(true);
        expect(res.outcome_key).toBe("left_message");
        expect(complete).toHaveBeenCalledTimes(1);
    });

    it("unknown/custom work without explicit sufficiency derives nothing (no inference)", async () => {
        currentPlan = planCustomWorkNoPolicy;
        currentWorkView = {
            context_snapshot: { lifecycle_stage_key: "lead" },
            work_definition_key: "custom_outreach",
        };
        const res = await associateOutboundCommunicationToContactAttempt({ ...baseIntegrated, result: "sent" });
        expect(res.associated).toBe(false);
        expect(res.reason).toBe("no_configured_sufficiency");
        expect(complete).not.toHaveBeenCalled();
    });

    it("explicit reply-required override wins over the platform default (sent does not complete)", async () => {
        currentPlan = planReplyRequired;
        const res = await associateOutboundCommunicationToContactAttempt({ ...baseIntegrated, result: "sent" });
        expect(res.associated).toBe(false);
        expect(res.reason).toBe("no_configured_sufficiency");
        expect(complete).not.toHaveBeenCalled();
    });

    it("explicit reply-required completes only when the configured result arrives", async () => {
        currentPlan = planReplyRequired;
        const res = await associateOutboundCommunicationToContactAttempt({
            ...baseIntegrated,
            result: "replied",
        });
        expect(res.associated).toBe(true);
        expect(res.outcome_key).toBe("reached_family");
    });

    it("a FAILED send cannot satisfy a success-mapped requirement", async () => {
        currentPlan = planContactFamilyNoSufficiency;
        const res = await associateOutboundCommunicationToContactAttempt({ ...baseIntegrated, result: "failed" });
        expect(res.associated).toBe(false);
        expect(complete).not.toHaveBeenCalled();
    });

    it("partial tour-only sufficient_command_results still associates a successful send via platform default", async () => {
        currentPlan = planTourOnlySufficiency;
        const res = await associateOutboundCommunicationToContactAttempt({ ...baseIntegrated, result: "sent" });
        expect(res.associated).toBe(true);
        expect(res.outcome_key).toBe("left_message");
        expect(complete).toHaveBeenCalledTimes(1);
    });

    it("no open work → nothing completed", async () => {
        listWork.mockResolvedValue({ ok: true, rows: [] } as never);
        const res = await associateOutboundCommunicationToContactAttempt({ ...baseIntegrated, result: "sent" });
        expect(res.associated).toBe(false);
        expect(res.reason).toBe("no_open_work");
        expect(complete).not.toHaveBeenCalled();
    });
});

describe("external contact — operator declaration, external_manual provenance, no fabricated send", () => {
    it("records the operator-declared outcome with external_manual provenance and channel", async () => {
        const res = await reportExternalContact({
            supabase: supabaseStub,
            orgId: "org-1",
            userId: "user-1",
            opportunityId: "opp-1",
            stageKey: "lead",
            workId: "task-1",
            outcomeKey: "reached_family",
            channel: "phone",
            note: "spoke with parent",
        });
        expect(res.ok).toBe(true);
        expect(complete).toHaveBeenCalledTimes(1);
        const arg = complete.mock.calls[0]![0];
        expect(arg.outcomeKey).toBe("reached_family");
        expect(arg.declaration).toEqual({ provenance: "external_manual", channel: "phone", note: "spoke with parent" });
        expect(arg.subject).toEqual({ journey_segment: "family", opportunity_id: "opp-1" });
    });

    it("integrated and external results carry distinguishable provenance", async () => {
        await associateOutboundCommunicationToContactAttempt({ ...baseIntegrated, result: "sent" });
        await reportExternalContact({
            supabase: supabaseStub,
            orgId: "org-1",
            userId: "user-1",
            opportunityId: "opp-1",
            stageKey: "lead",
            workId: "task-1",
            outcomeKey: "reached_family",
            channel: "phone",
        });
        const provenances = complete.mock.calls.map((c) => c[0].declaration?.provenance);
        expect(provenances).toEqual(["integrated", "external_manual"]);
    });
});
