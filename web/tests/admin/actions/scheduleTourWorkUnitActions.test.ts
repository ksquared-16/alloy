import { describe, expect, it, vi } from "vitest";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import {
    buildScheduleTourPickerRow,
    filterScheduleTourPickerRows,
    isScheduleTourRegistryAction,
    resolveScheduleTourOpportunityIdFromQueueItem,
} from "@/lib/admin/actions/scheduleTourWorkUnitActions";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

describe("scheduleTourWorkUnitActions", () => {
    it("isScheduleTourRegistryAction matches workflow and form keys", () => {
        expect(isScheduleTourRegistryAction({ key: "schedule_tour", payload: {} })).toBe(true);
        expect(isScheduleTourRegistryAction({ key: "other", payload: { form_key: "schedule_tour" } })).toBe(
            true
        );
        expect(isScheduleTourRegistryAction({ key: "create_lead", payload: {} })).toBe(false);
    });

    it("resolveScheduleTourOpportunityIdFromQueueItem uses opportunityId for candidate rows", () => {
        expect(
            resolveScheduleTourOpportunityIdFromQueueItem({
                id: "pcrow:opp-1:pc-9",
                title: "Row",
                quickActions: [],
                opportunityId: "opp-1",
            })
        ).toBe("opp-1");
    });

    it("filterScheduleTourPickerRows searches queue row labels (legacy picker rows)", () => {
        const items: QueuePreviewItemVm[] = [
            {
                id: "opp-a",
                title: "Hayes Family",
                quickActions: [],
                semanticCrmCompact: {
                    primaryIdentity: "Hayes Family",
                    childName: "Sam",
                    contactDisplayName: "Jane Hayes",
                    programContext: "Toddler",
                    statusLabel: "Waitlisted",
                    stageLabel: null,
                    nextStep: null,
                    lastActivity: null,
                    commercialValue: null,
                    contactSnippet: null,
                    roomContext: null,
                    ageContext: null,
                    attentionReason: null,
                    familyNote: null,
                },
            },
            {
                id: "opp-b",
                title: "Other",
                quickActions: [],
            },
        ];
        const filtered = filterScheduleTourPickerRows(items, "sam");
        expect(filtered).toHaveLength(1);
        expect(filtered[0]?.opportunityId).toBe("opp-a");
    });

    it("buildScheduleTourPickerRow includes contact and child/program lines", () => {
        const row = buildScheduleTourPickerRow({
            id: "opp-1",
            title: "Fallback",
            quickActions: [],
            semanticCrmCompact: {
                primaryIdentity: "Smith",
                childName: "Alex",
                contactDisplayName: "Pat Smith",
                programContext: "Pre-K",
                statusLabel: "Lead",
                stageLabel: null,
                nextStep: null,
                lastActivity: null,
                commercialValue: null,
                contactSnippet: null,
                roomContext: null,
                ageContext: null,
                attentionReason: null,
                familyNote: null,
            },
        });
        expect(row?.primaryLabel).toBe("Smith");
        expect(row?.contactLine).toContain("Pat Smith");
        expect(row?.childProgramLine).toContain("Alex");
        expect(row?.childProgramLine).toContain("Pre-K");
    });
});

describe("applyRegistryResolvedActionClient schedule tour", () => {
    const scheduleTourAction: ResolvedActionForClient = {
        key: "schedule_tour",
        label: "Schedule Tour",
        description: null,
        action_type: "workflow",
        icon: null,
        style: null,
        display_style: "button",
        payload: {},
        workflow_id: null,
    };

    it("department rail with no entity opens record picker", async () => {
        const openScheduleTourRecordPicker = vi.fn();
        const out = await applyRegistryResolvedActionClient(scheduleTourAction, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openScheduleTourRecordPicker,
            context: { surface: "right_rail", department_id: "dept-1" },
        });
        expect(out.ok).toBe(true);
        expect(openScheduleTourRecordPicker).toHaveBeenCalledTimes(1);
    });

    it("work unit rail with no entity opens record picker instead of alert", async () => {
        const openScheduleTourRecordPicker = vi.fn();

        const out = await applyRegistryResolvedActionClient(scheduleTourAction, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openScheduleTourRecordPicker,
            context: { surface: "right_rail" },
        });

        expect(out.ok).toBe(true);
        expect(openScheduleTourRecordPicker).toHaveBeenCalledTimes(1);
    });

    it("open_form schedule_tour without entity delegates to openForm", async () => {
        const openForm = vi.fn();
        const openAction = { ...scheduleTourAction, action_type: "open_form" as const, payload: { form_key: "schedule_tour" } };
        const out = await applyRegistryResolvedActionClient(openAction, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openForm,
            context: { surface: "right_rail" },
        });
        expect(out.ok).toBe(true);
        expect(openForm).toHaveBeenCalled();
    });

    it("schedule_tour with entity skips picker", async () => {
        const openScheduleTourRecordPicker = vi.fn();
        const openForm = vi.fn();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, data: { execution_result: { kind: "noop" } }, correlation_id: "cid-test" }),
        }) as typeof fetch;

        await applyRegistryResolvedActionClient(scheduleTourAction, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openScheduleTourRecordPicker,
            openForm,
            entityId: "opp-123",
            context: { surface: "queue_row" },
        });

        expect(openScheduleTourRecordPicker).not.toHaveBeenCalled();
    });
});
