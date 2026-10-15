// @vitest-environment jsdom
import { act, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import BusinessProcessCard from "@/components/admin/focusPanel/cards/BusinessProcessCard";
import { useDismissSignal } from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import type {
    FocusPanelCoordination,
    FocusPanelDismissSignal,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";

/**
 * E2E-10 — closing a Focus Panel command left the panel dead until refresh.
 *
 * Measured on deployed staging (25b419fd / d58659f0): Move to Waitlist → backdrop or Esc → Contact
 * Family did nothing, and so did Tour ▸ Send Tour Invitation, with no overlay, no inert, no pointer
 * lock and the button on top. ✕ / Close / Cancel did not reproduce it.
 *
 * Backdrop and Esc are the only exits that go through the host's `dismiss()`, which publishes
 * `dismissed = { card, nonce }` — and nothing ever clears it. The command workspace is hosted by
 * mounting a FRESH `CurrentWorkCard` (`BusinessProcessCard` renders it when the workspace opens), and
 * `useDismissSignal` ran its reset on mount whenever a nonce was present. So every later launch
 * mounted, saw the old dismissal, and closed itself in the same commit: nothing ever painted.
 *
 * A dismissal is an event. A card answers the ones raised while it is mounted, never history.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/workIntent/useWorkIntentOutcomeCompletion", () => ({
    useWorkIntentOutcomeCompletion: () => ({
        completeOutcome: vi.fn(async () => {}),
        busy: false,
        error: null,
        clearError: vi.fn(),
    }),
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(node: React.ReactElement) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(node));
}

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
});

/* ------------------------------------------------------------------ the hook, for every card */

describe("useDismissSignal answers dismissals, not their history", () => {
    type Api = {
        dismiss: (card: FocusPanelCardKey) => void;
        setMounted: (on: boolean) => void;
    };
    let api: Api;
    const resets: string[] = [];

    function Card({ coordination, name }: { coordination: FocusPanelCoordination; name: string }) {
        useDismissSignal(coordination, "children", () => resets.push(name));
        return <p>{name}</p>;
    }

    function Host({ initiallyMounted }: { initiallyMounted: boolean }) {
        const [dismissed, setDismissed] = useState<FocusPanelDismissSignal | null>(null);
        const [mounted, setMounted] = useState(initiallyMounted);
        const [generation, setGeneration] = useState(0);
        const coordination = useMemo(
            () =>
                ({
                    request: null,
                    requestFocus: () => {},
                    dismissed,
                    dismiss: () => {},
                }) as unknown as FocusPanelCoordination,
            [dismissed],
        );
        api = {
            dismiss: (card) => setDismissed((prev) => ({ card, nonce: (prev?.nonce ?? 0) + 1 })),
            setMounted: (on) => {
                if (on) setGeneration((g) => g + 1);
                setMounted(on);
            },
        };
        return mounted ? <Card coordination={coordination} name={`card#${generation}`} /> : null;
    }

    it("a dismissal raised while the card is mounted resets it", () => {
        resets.length = 0;
        mount(<Host initiallyMounted />);
        act(() => api.dismiss("children"));
        expect(resets).toEqual(["card#0"]);
    });

    it("a card mounted AFTER a dismissal does not replay it", () => {
        resets.length = 0;
        mount(<Host initiallyMounted />);
        act(() => api.dismiss("children"));
        act(() => api.setMounted(false));
        act(() => api.setMounted(true));
        expect(resets).toEqual(["card#0"]);
    });

    it("…and still answers the next dismissal after it remounts", () => {
        resets.length = 0;
        mount(<Host initiallyMounted />);
        act(() => api.dismiss("children"));
        act(() => api.setMounted(false));
        act(() => api.setMounted(true));
        act(() => api.dismiss("children"));
        expect(resets).toEqual(["card#0", "card#1"]);
    });

    it("another card's dismissal is not this card's", () => {
        resets.length = 0;
        mount(<Host initiallyMounted />);
        act(() => api.dismiss("household"));
        expect(resets).toEqual([]);
    });
});

/* ------------------------------------------------------------------ the real command host */

function runtime(): StageWorkRuntimeProjection {
    const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    return {
        stage_key: "lead",
        stage_label: "Lead",
        purpose: "Reach the family.",
        journey_segment: "family",
        template_keys: ["contact_family"],
        primary: {
            template_key: "contact_family",
            label: "Contact Family",
            description: "Make contact and record outcome.",
            role: "primary",
            state: "open",
            requires_outcome_picker: true,
            work_id: "work-1",
            due_at: null,
            due_urgency: "none",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: plan.outcomes,
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: [],
        },
        additional: [],
        execution: {
            department_id: "dept-1",
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
            requires_outcome_picker: true,
        },
    } as unknown as StageWorkRuntimeProjection;
}

const context = {
    grain: "case",
    subject: { type: "opportunity", id: "opp-1", label: "Mygrant Family" },
    businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
    perspective: null,
    truth: { id: "opp-1" },
    stageWorkRuntime: runtime(),
    signals: {
        work: {
            primary: { id: "work-1", label: "Contact Family", state: "open", dueLabel: null, dueAt: null, urgency: null, source: "Stage work", kind: "stage_work" },
            items: [],
            openCount: 1,
            overdueCount: 0,
            nextActionLabel: null,
        },
        attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
        tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
        communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
        billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
    },
    capabilities: { canMutate: true, maskedChannels: false },
    status: "ready",
} as unknown as OperationalContext;

const model: FocusPanelCardModel = {
    key: "business_process",
    title: "Enrollment",
    insight: "Lead",
    tier: "work",
    span: "row",
    density: "compact",
    visible: true,
    archetype: "status",
} as unknown as FocusPanelCardModel;

describe("the Process card's command workspace stays open after an earlier backdrop/Esc close", () => {
    let hostApi: {
        open: () => void;
        dismissCurrentWork: () => void;
        state: () => { open: boolean; closes: number };
    };

    /** The Focus Panel host's coordination, reduced to the parts the command workspace uses. */
    function FocusPanelHost() {
        const [workspace, setWorkspace] = useState<{ open: boolean; intent: unknown }>({ open: false, intent: null });
        const [dismissed, setDismissed] = useState<FocusPanelDismissSignal | null>(null);
        const [closes, setCloses] = useState(0);
        const coordination = useMemo(
            () =>
                ({
                    focusTargets: new Set(["current_work", "business_process"]),
                    request: null,
                    requestFocus: () => {},
                    activeDepth: workspace.open ? { card: "current_work", level: "focused" } : null,
                    reportPerspective: () => {},
                    dismissed,
                    dismiss: () => {},
                    previousFocus: null,
                    back: () => {},
                    currentWorkWorkspace: workspace,
                    openCurrentWorkWorkspace: (intent: unknown) => setWorkspace({ open: true, intent: intent ?? { kind: "drill_in" } }),
                    closeCurrentWorkWorkspace: () => {
                        setCloses((n) => n + 1);
                        setWorkspace({ open: false, intent: null });
                    },
                    clearCurrentWorkWorkspaceIntent: () => setWorkspace((prev) => ({ ...prev, intent: null })),
                }) as unknown as FocusPanelCoordination,
            [workspace, dismissed],
        );
        hostApi = {
            open: () => setWorkspace({ open: true, intent: { kind: "drill_in" } }),
            // What the backdrop click / Esc does, after its depth animation.
            dismissCurrentWork: () => setDismissed((prev) => ({ card: "current_work", nonce: (prev?.nonce ?? 0) + 1 })),
            state: () => ({ open: workspace.open, closes }),
        };
        return <BusinessProcessCard model={model} context={context} coordination={coordination} />;
    }

    const focused = () => host!.querySelector('[data-work-focused-surface="true"]') != null;

    it("first launch opens; a backdrop/Esc dismissal closes it", () => {
        mount(<FocusPanelHost />);
        act(() => hostApi.open());
        expect(focused()).toBe(true);
        act(() => hostApi.dismissCurrentWork());
        expect(hostApi.state().open).toBe(false);
        expect(focused()).toBe(false);
    });

    it("the NEXT launch after that dismissal opens and stays open (was: closed itself before painting)", () => {
        mount(<FocusPanelHost />);
        act(() => hostApi.open());
        act(() => hostApi.dismissCurrentWork());
        const closesAfterDismiss = hostApi.state().closes;

        act(() => hostApi.open());
        expect(hostApi.state().open).toBe(true);
        expect(hostApi.state().closes).toBe(closesAfterDismiss);
        expect(focused()).toBe(true);
    });

    it("repeated open → dismiss → open cycles never need a refresh", () => {
        mount(<FocusPanelHost />);
        for (let i = 0; i < 5; i += 1) {
            act(() => hostApi.open());
            expect(focused(), `cycle ${i} open`).toBe(true);
            act(() => hostApi.dismissCurrentWork());
            expect(focused(), `cycle ${i} dismissed`).toBe(false);
        }
        act(() => hostApi.open());
        expect(focused()).toBe(true);
    });
});
