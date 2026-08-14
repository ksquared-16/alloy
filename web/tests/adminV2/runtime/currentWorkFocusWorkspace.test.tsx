/**
 * Current Work focus workspace — navigation, shared VM, executable action surfaces.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import CurrentWorkWorkspace from "@/components/admin/focusPanel/cards/CurrentWorkWorkspace";
import {
    isCurrentWorkActionExecutable,
    planCurrentWorkActionExecution,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import { resolveCurrentWorkActionSurface } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import { isFocusElevatingCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { CurrentWorkActionVM, CurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

function action(partial: Partial<CurrentWorkActionVM> & Pick<CurrentWorkActionVM, "key" | "label" | "category" | "placement">): CurrentWorkActionVM {
    return {
        description: null,
        handlerKey: partial.key,
        actionRef: partial.key,
        ...partial,
    };
}

/** Registry-resolved client object — record-header actions carry this in production. */
function resolvedFor(key: string): CurrentWorkActionVM["resolved"] {
    return {
        key,
        label: key,
        description: null,
        action_type: "registry",
        icon: null,
        style: null,
        display_style: "outline",
        payload: {},
        workflow_id: null,
    };
}

const minimalSurface = {
    title: "Contact Family",
    description: "Reach out to understand needs",
    status: "blocked",
    statusLabel: "Blocked",
    progress: { completed: 8, total: 10, percent: 80 },
    readiness: {
        state: "blocked",
        reasonCodes: [],
        reasonLabel: "First contact overdue",
        requirements: {
            complete: 8,
            total: 10,
            remaining: 2,
            items: [
                { key: "dob", label: "Child Date of Birth", status: "missing" as const },
                { key: "program", label: "Program Selection", status: "missing" as const },
            ],
        },
    },
    primaryAction: action({
        key: "contact_family",
        label: "Contact Family",
        category: "primary",
        placement: "current_work_primary",
        handlerKey: "send_email",
        resolved: resolvedFor("send_email"),
    }),
    recordOutcomeAction: action({
        key: "record_outcome",
        label: "Record Outcome",
        category: "primary",
        placement: "current_work_primary",
        handlerKey: "record_outcome",
    }),
    supportingActions: [
        action({
            key: "schedule_tour",
            label: "Schedule Tour",
            category: "supporting",
            placement: "current_work_supporting",
            handlerKey: "schedule_tour",
        }),
        action({
            key: "send_form",
            label: "Send Form",
            category: "supporting",
            placement: "current_work_supporting",
            handlerKey: "send_form",
            resolved: resolvedFor("send_form"),
        }),
        action({
            key: "add_child",
            label: "Add Child",
            category: "supporting",
            placement: "current_work_supporting",
            handlerKey: "add_child",
            resolved: resolvedFor("add_child"),
        }),
        action({
            key: "create_task",
            label: "Create Task",
            category: "supporting",
            placement: "current_work_supporting",
            handlerKey: "create_task",
            resolved: resolvedFor("create_task"),
        }),
    ],
    communicationActions: [],
    alternatePaths: [
        action({
            key: "tr:lead->tour",
            label: "Move to Tour",
            category: "alternate_path",
            placement: "current_work_alternate_paths",
            handlerKey: "process_stage_transition",
            actionRef: "tour",
        }),
    ],
    bosRecommendations: [],
    completionOutcomes: [
        { outcome_key: "reached", label: "Reached Family" },
        { outcome_key: "left_message", label: "Left Message" },
    ],
    showOutcomeCompletion: true,
    operatorGuidance: "Reach out to the family to understand their needs.",
} as unknown as CurrentWorkSurfaceVM;

describe("Current Work action execution planner", () => {
    it("plans schedule_tour as inline form", () => {
        const plan = planCurrentWorkActionExecution(minimalSurface.supportingActions[0]!);
        expect(plan.kind).toBe("open_inline_panel");
        expect(resolveCurrentWorkActionSurface(minimalSurface.supportingActions[0]!)).toBe("inline_form");
    });

    it("plans send_form as its declared form_delivery inline host", () => {
        const sendForm = minimalSurface.supportingActions.find((a) => a.key === "send_form")!;
        expect(resolveCurrentWorkActionSurface(sendForm)).toBe("form_delivery");
        expect(isCurrentWorkActionExecutable(sendForm)).toBe(true);
        expect(planCurrentWorkActionExecution(sendForm).kind).toBe("open_inline_panel");
    });

    it("plans add_child / create_task as header_delegate", () => {
        for (const row of minimalSurface.supportingActions.filter((a) => a.key === "add_child" || a.key === "create_task")) {
            expect(resolveCurrentWorkActionSurface(row)).toBe("header_delegate");
            expect(isCurrentWorkActionExecutable(row)).toBe(true);
            expect(planCurrentWorkActionExecution(row).kind).toBe("header_delegate");
        }
    });

    it("plans process transitions for Other Transitions", () => {
        const plan = planCurrentWorkActionExecution(minimalSurface.alternatePaths[0]!);
        expect(plan.kind).toBe("process_transition");
        if (plan.kind === "process_transition") {
            expect(plan.nextStatusKey).toBe("tour");
        }
    });

    it("never treats unsupported actions as executable", () => {
        const dead = action({
            key: "totally_unknown_zzz",
            label: "Do Nothing",
            category: "administrative",
            placement: "manage_overflow",
        });
        expect(isCurrentWorkActionExecutable(dead)).toBe(false);
        expect(planCurrentWorkActionExecution(dead).kind).toBe("unsupported");
    });
});

describe("Current Work Focus workspace composition", () => {
    it("elevates Current Work as a centered Focus Card (Slice A)", () => {
        expect(isFocusElevatingCard("current_work")).toBe(true);
        expect(isFocusElevatingCard("household")).toBe(true);
    });

    it("renders workspace surface without outer CURRENT WORK card chrome", () => {
        const html = renderToStaticMarkup(
            <CurrentWorkWorkspace
                surface={minimalSurface}
                completionPhase="working"
                pendingOutcome={null}
                pendingOutcomeKey={null}
                primaryWorkItem={null}
                busy={false}
                error={null}
                handoffNotice={null}
                activityItems={[{ label: "Note added", occurredAt: "Today" }]}
                activityPreviewOpen={false}
                onToggleActivityPreview={() => undefined}
                onCloseActivityPreview={() => undefined}
                onViewFullActivity={() => undefined}
                onChecklistItem={() => undefined}
                onSelectOutcome={() => undefined}
                onCancelOutcome={() => undefined}
                onConfirmOutcome={() => undefined}
                onCancelPicker={() => undefined}
                onAction={() => undefined}
                onBack={() => undefined}
                onContinueAfterComplete={() => undefined}
                completionSummary={null}
                stageLabel="Lead"
            />,
        );
        expect(html).toContain('data-current-work-workspace="true"');
        expect(html).toContain("Back to summary");
        expect(html).toContain("Next action");
        expect(html).toContain("Record outcome");
        expect(html).toContain("More actions");
        expect(html).toContain("Other transitions");
        expect(html).toContain("Recent activity");
        // Tour actions are grouped under the shared DropdownMenu trigger (items portal on open).
        expect(html).toContain('data-work-tour-menu-trigger="true"');
        expect(html).toContain("Tour ▾");
        expect(html).toContain("Send Form");
        expect(html).not.toMatch(/>CURRENT WORK</i);
        expect(html).not.toContain("data-work-summary");
    });

    it("promotes Record Outcome for outcome-led work without a fake Primary Action", () => {
        const outcomeLedSurface = {
            ...minimalSurface,
            title: "Conduct Tour",
            primaryAction: null,
            execution: {
                executionMode: "outcome_led",
                prominentCta: "record_outcome",
                hasExecutablePrimaryAction: false,
                primaryActionIsExecutable: false,
            },
        } as CurrentWorkSurfaceVM;
        const html = renderToStaticMarkup(
            <CurrentWorkWorkspace
                surface={outcomeLedSurface}
                completionPhase="working"
                pendingOutcome={null}
                pendingOutcomeKey={null}
                primaryWorkItem={null}
                busy={false}
                error={null}
                handoffNotice={null}
                activityItems={[]}
                activityPreviewOpen={false}
                onToggleActivityPreview={() => undefined}
                onCloseActivityPreview={() => undefined}
                onViewFullActivity={() => undefined}
                onChecklistItem={() => undefined}
                onSelectOutcome={() => undefined}
                onCancelOutcome={() => undefined}
                onConfirmOutcome={() => undefined}
                onCancelPicker={() => undefined}
                onAction={() => undefined}
                onBack={() => undefined}
                onContinueAfterComplete={() => undefined}
                completionSummary={null}
                stageLabel="Tour"
            />,
        );
        expect(html).toContain('data-execution-mode="outcome_led"');
        expect(html).toContain('data-prominent-cta="record_outcome"');
        expect(html).toContain('data-outcome-prominence="primary"');
        expect(html).not.toContain("data-work-primary-action");
    });

    it("ModeGrid elevates current_work via the standard depth path — no canvas replace (Slice A)", () => {
        const source = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx"),
            "utf8",
        );
        // Slice A removed the full-canvas workspace replace; current_work elevates like truth cards.
        expect(source).not.toContain('data-focus-panel-workspace="current_work"');
        expect(source).not.toContain('presentation="workspace"');
        expect(source).toContain("elevatedCellKey");
    });

    it("current_work card reports centered-elevation depth (Slice A)", () => {
        const source = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/cards/CurrentWorkCard.tsx"),
            "utf8",
        );
        expect(source).toContain('presentation?: "summary" | "workspace"');
        // Opening now elevates the card (reports "focused") instead of a canvas replace; the
        // coordination host raises the cell (backdrop + centered) via activeDepth/elevatedCellKey.
        expect(source).toContain('useReportPerspective(coordination, "current_work"');
        expect(source).toContain("useDismissSignal(coordination, \"current_work\"");
        expect(source).not.toContain("setFocused(true)");
    });
});
