import { describe, expect, it } from "vitest";

import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { minimalSettledOpportunityDrawerViewModel } from "@/tests/adminV2/viewModel/fixtures/minimalSettledOpportunityDrawerViewModel";

describe("deriveOpportunityFocusPanelPresentation", () => {
    const baseVm = minimalSettledOpportunityDrawerViewModel({
        summaries: {
            tasks: {
                state: "loaded",
                open_count: 2,
                open_tasks: [
                    { id: "t1", title: "Follow up", due_at: null, status: "open", source: "task_assist" },
                    { id: "t2", title: "Send form", due_at: null, status: "open", source: "task_assist" },
                ],
            },
            active_tour_bookings: [],
            reminders: { state: "empty", next_follow_up_iso: null, scheduled_send_count: 0, scheduled_sends: [] },
            bos: null,
            attention: {
                visible: true,
                needs_attention: true,
                primary_reason: "Missing immunizations",
                reason_count: 2,
            },
        },
        header: {
            title: "Test Opp",
            subtitle: null,
            status: {
                renderAs: "dropdown",
                status_key: "new",
                label: "New",
                options: [{ status_key: "new", label: "New", sort_order: 0 }],
            },
            status_can_mutate: true,
            oper_trust_preview: {
                headline: "2 blockers before tour",
                risk_urgency_hint: "high",
            },
        },
    });

    it("summary grid leads with executive briefing cards", () => {
        const { grid, cards } = deriveOpportunityFocusPanelPresentation({
            mode: "summary",
            displayVm: baseVm,
            record: {
                _inquiry_children: [
                    {
                        id: "child-1",
                        customer_member_id: "cm-1",
                        display_name: "Ava",
                        outcome_status_key: "active",
                    },
                ],
            },
            title: "Smith Family",
            perspective: null,
            statusLabel: "New",
        });

        const firstRowKeys = grid.rows[0]?.cells.map((c) => c.key) ?? [];
        expect(firstRowKeys).toEqual(["attention", "current_mission", "current_work", "health"]);

        expect(cards.get("attention")?.insight).toBe("Missing immunizations");
        expect(cards.get("health")?.insight).toBe("2 blockers before tour");
        expect(cards.get("readiness_kpi")?.insight).toBe("2 blockers");
        expect(cards.get("children")?.insight).toBe("1 enrolling");
    });

    it("work idle grid follows mission → blockers → launcher hierarchy", () => {
        const { grid } = deriveOpportunityFocusPanelPresentation({
            mode: "work",
            displayVm: baseVm,
            record: {},
            title: "Smith Family",
            perspective: null,
            statusLabel: "New",
        });

        const rowKeys = grid.rows.map((row) => row.cells.map((c) => c.key));
        expect(rowKeys[0]).toEqual(["current_mission"]);
        expect(rowKeys[1]).toEqual(["required_information"]);
        expect(rowKeys[2]).toEqual(["work_launcher"]);
        expect(rowKeys.at(-1)).toEqual(["primary_next_action"]);
    });

    it("work active grid elevates workflow steps and attention", () => {
        const activeVm = minimalSettledOpportunityDrawerViewModel({
            workspace: {
                ...baseVm.workspace,
                work_intent_runtime: { state: "open", template_key: "tour", label: "Tour prep" } as never,
                stage_work_runtime: {
                    stage_key: "tour",
                    stage_label: "Tour",
                    purpose: "Schedule and confirm tour",
                    primary: { template_key: "tour", label: "Schedule tour", state: "open" },
                    additional: [],
                } as never,
            },
        });

        const { grid } = deriveOpportunityFocusPanelPresentation({
            mode: "work",
            displayVm: activeVm,
            record: {},
            title: "Smith Family",
            perspective: null,
            statusLabel: "Tour scheduled",
        });

        const rowKeys = grid.rows.map((row) => row.cells.map((c) => c.key));
        expect(rowKeys[0]).toEqual(["attention"]);
        expect(rowKeys[1]).toEqual(["workflow_steps"]);
    });

    it("activity grid includes timeline and audit cards", () => {
        const { grid } = deriveOpportunityFocusPanelPresentation({
            mode: "activity",
            displayVm: baseVm,
            record: {},
            title: "Smith Family",
            perspective: null,
            statusLabel: "New",
        });

        const allKeys = grid.rows.flatMap((row) => row.cells.map((c) => c.key));
        expect(allKeys).toContain("timeline");
        expect(allKeys).toContain("audit");
        expect(allKeys).toContain("communications");
    });
});
