import { describe, expect, it } from "vitest";

import { mergeSubjectIdentityTruthOntoSettled } from "@/lib/adminV2/runtime/focusPanel/mergeSubjectIdentityTruthOntoSettled";
import { overlayContextMissionOntoSettledFocusModel } from "@/lib/adminV2/runtime/focusPanel/overlayContextMissionOntoSettledFocusModel";
import type { FocusPanelCommitCriticalInput } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalInput";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";
import {
    NULL_BILLING_SIGNAL,
    type OperationalContext,
} from "@/lib/adminV2/runtime/operationalContext/types";

function baseContext(truth: Record<string, unknown>): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Kurzman Family" },
        businessProcess: { key: "lead", label: "Lead", stageKey: "lead" },
        perspective: null,
        truth,
        stageWorkRuntime: null,
        publishedStageInputs: null,
        signals: {
            work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
            attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
            tour: { scheduled: true, startAt: "2026-08-14T16:00:00.000Z", statusLabel: "confirmed", bookingId: "tb-1" },
            communications: {
                scheduledSendCount: 0,
                nextFollowUpAt: null,
                hasOutreach: false,
                nextScheduledSendId: null,
            },
            billing: NULL_BILLING_SIGNAL,
        },
    };
}

describe("mergeSubjectIdentityTruthOntoSettled", () => {
    it("keeps richer settled _inquiry_children over thin commit-critical seed", () => {
        const settled = {
            _inquiry_children: [
                {
                    id: "c1",
                    display_name: "Lennon Kurzman",
                    gender: "male",
                    desired_program_label: "Infant",
                },
            ],
        };
        const commit = {
            _inquiry_children: [{ id: "c1", display_name: "Lennon Kurzman", dob: "2024-04-02" }],
            "person.primary_contact_name": "Kelly Kurzman",
        };
        const merged = mergeSubjectIdentityTruthOntoSettled(settled, commit);
        expect(merged["person.primary_contact_name"]).toBe("Kelly Kurzman");
        expect(merged._inquiry_children).toEqual(settled._inquiry_children);
    });
});

describe("overlayContextMissionOntoSettledFocusModel children authority", () => {
    it("does not blank Program/Gender when Mission overlay applies thin subjectIdentityTruth", () => {
        const richChildren = [
            {
                id: "c1",
                display_name: "Lennon Kurzman",
                gender: "male",
                desired_program_label: "Infant",
            },
        ];
        const settled: FocusPanelWorkModeModel = {
            source: "drawer_vm",
            phase: "settled",
            mode: "summary",
            subject: { id: "opp-1", type: "opportunity", label: "Kurzman Family" },
            context: baseContext({ id: "opp-1", _inquiry_children: richChildren }),
            cardModels: new Map(),
            cardReadiness: new Map(),
            commands: [],
            title: "Kurzman Family",
            statusLabel: "Lead",
            canMutate: true,
            perspective: null,
        };
        const commitCritical: FocusPanelCommitCriticalInput = {
            subjectId: "opp-1",
            subjectGrain: { grain: "case", subjectType: "opportunity" },
            situation: { stageKey: "waitlist", stageLabel: "Waitlist", purpose: null },
            stageWorkRuntime: {
                stage_key: "waitlist",
                stage_label: "Waitlist",
                journey_segment: null,
                template_keys: [],
                primary: null,
                additional: [],
            } as FocusPanelCommitCriticalInput["stageWorkRuntime"],
            publishedStageInputs: null,
            primaryAction: null,
            subjectIdentityTruth: {
                _inquiry_children: [{ id: "c1", display_name: "Lennon Kurzman", dob: "2024-04-02" }],
            },
        };
        const overlaid = overlayContextMissionOntoSettledFocusModel(settled, commitCritical);
        expect(overlaid.context.truth._inquiry_children).toEqual(richChildren);
        expect(overlaid.context.businessProcess.stageKey).toBe("waitlist");
    });
});
