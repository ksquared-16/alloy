import { describe, expect, it } from "vitest";
import { resolveQueueRowWarmTarget } from "@/lib/presentation/runtime/queueRowWarmTarget";
import type { QueueRowModel } from "@/lib/presentation/runtime";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

/**
 * The pure resolver behind queue-row hover/focus warm (Phase 2). Proves a hover warms exactly
 * the record a click would open, and no-ops where warming would be wrong.
 */
const SCOPE = { departmentId: "dept-1", workUnitId: "wu-1", workViewId: "view-1" };

function context(overrides: Partial<QueueRowContext> = {}): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: "opp-9", display_name: "Sam Rivera" },
        row_stage: "New Leads",
        lifecycle_key: "enrollment",
        row_status_key: "new_lead",
        row_status_label: "New Lead",
        case_context: {
            case_id: "opp-9",
            display_name: "Sam Rivera",
            case_type_label: "Enrollment",
            case_status_key: "new_lead",
            case_status_label: "New Lead",
        },
        primary_contact: { display_name: "Alex Rivera" },
        related_subjects_summary: [],
        attention_summary: { needs_attention: false },
        work_summary: { open_count: 0, primary_open_label: null },
        current_work_summary: null,
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: "opp-9" },
        ...overrides,
    };
}

const oppRow = (over: Partial<QueueRowModel> = {}): QueueRowModel => ({
    context: context(),
    entityType: "opportunity",
    entityId: "opp-9",
    ...over,
});

describe("resolveQueueRowWarmTarget", () => {
    it("resolves an opportunity row to the drawer_open anchor id + scoped context + seed", () => {
        const t = resolveQueueRowWarmTarget(oppRow(), SCOPE);
        expect(t).not.toBeNull();
        expect(t!.id).toBe("opp-9"); // drawer_open anchor — same id openRecord opens
        expect(t!.context).toEqual({
            work_unit_id: "wu-1",
            department_id: "dept-1",
            work_view_id: "view-1",
        });
        expect(t!.seed).not.toBeNull(); // preview seed carried for instant identity
    });

    it("falls back to the row's own entityId when no drawer_open anchor", () => {
        const row = oppRow({ context: context({ drawer_open: undefined as never }) });
        expect(resolveQueueRowWarmTarget(row, SCOPE)!.id).toBe("opp-9");
    });

    it("prefers a grouped row's case anchor over the row entityId", () => {
        const row = oppRow({
            entityId: "child-42",
            context: context({ drawer_open: { entity_type: "opportunities", entity_id: "opp-9" } }),
        });
        expect(resolveQueueRowWarmTarget(row, SCOPE)!.id).toBe("opp-9");
    });

    it("no-ops for non-opportunity rows (jobs/schedules own their own surfaces)", () => {
        expect(resolveQueueRowWarmTarget({ context: null, entityType: "job", entityId: "j1" }, SCOPE)).toBeNull();
        expect(resolveQueueRowWarmTarget({ context: null, entityType: "schedule", entityId: "s1" }, SCOPE)).toBeNull();
    });

    it("no-ops when the work-unit scope is unresolved (never warms without a target)", () => {
        expect(resolveQueueRowWarmTarget(oppRow(), { ...SCOPE, departmentId: null })).toBeNull();
        expect(resolveQueueRowWarmTarget(oppRow(), { ...SCOPE, workUnitId: undefined })).toBeNull();
        expect(resolveQueueRowWarmTarget(oppRow(), { ...SCOPE, departmentId: "  " })).toBeNull();
    });

    it("null work view is carried through as null (view-less warm is valid)", () => {
        const t = resolveQueueRowWarmTarget(oppRow(), { ...SCOPE, workViewId: null });
        expect(t!.context.work_view_id).toBeNull();
    });
});
