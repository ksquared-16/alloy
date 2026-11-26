/**
 * NAVIGATION → PANEL CONTEXT — the participant scope, end to end through the real context builder.
 *
 * The seven guards the Director asked for, exercised through `buildOperationalContext` rather than
 * the resolver alone, because the thing that can break is the WIRING: a selection that never
 * arrives, or one that arrives and is never cleared.
 */

import { describe, expect, it } from "vitest";

import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";

function vm() {
    return {
        entity: { type: "opportunity", id: "opp_1" },
        header: { title: "Wright Family" },
        layout: { mode: "workflow_v1" },
        actions: { header: [], header_menu: [], manage_menu: [], record_header: null },
        workspace: {
            department_id: "d1",
            work_unit_id: "wu1",
            queue_definition: null,
            lifecycle_rail: { stages: [{ key: "tour", label: "Tour" }], current_stage_key: "tour" },
            stage_context: { stage_key: "tour", stage_label: "Tour", purpose: "" },
            work_intent_runtime: null,
            stage_work_runtime: null,
            published_stage_inputs: null,
            stage_work: { status: "pending" },
        },
        summaries: {
            tasks: { state: "loaded", open_tasks: [], open_count: 0 },
            active_tour_bookings: [],
            reminders: { state: "empty", next_follow_up_iso: null, scheduled_send_count: 0, scheduled_sends: [] },
            bos: null,
            attention: null,
        },
        activity: { communicationsPreviewVm: null },
        above_fold: { render_model: { sections: [] }, record: { id: "opp_1", _record_surface: "full" } },
    };
}

const AVERY = { id: "ocm_avery", customer_member_id: "cm_avery", child_name: "Avery Wright", stage_key: "waitlist" };
const RILEY = { id: "ocm_riley", customer_member_id: "cm_riley", child_name: "Riley Wright", stage_key: "tour" };

function ctx(selected: string | null, children: Array<Record<string, unknown>>) {
    return buildOperationalContext({
        subjectVm: vm(),
        subjectId: "opp_1",
        title: "Wright Family",
        truth: { id: "opp_1", stage_key: "tour", _inquiry_children: children },
        perspective: null,
        statusLabel: null,
        canMutate: true,
        selectedParticipationId: selected,
    } as never);
}

describe("participant scope arrives through navigation", () => {
    it("1 — an explicit selection resolves the matching participant", () => {
        const c = ctx("ocm_avery", [AVERY, RILEY]);
        expect(c.participantScope?.participationId).toBe("ocm_avery");
        expect(c.participantScope?.displayName).toBe("Avery Wright");
        expect(c.participantScope?.stageKey).toBe("waitlist");
    });

    it("2 — several children and no selection resolves to null", () => {
        expect(ctx(null, [AVERY, RILEY]).participantScope).toBeNull();
    });

    it("3 — a sole eligible child resolves implicitly, where the contract allows it", () => {
        expect(ctx(null, [AVERY]).participantScope?.participationId).toBe("ocm_avery");
    });

    it("4 — a participant from the PREVIOUS case is rejected, not carried over", () => {
        // The operator moved to a different family and the old selection is still in hand.
        expect(ctx("ocm_from_another_case", [AVERY, RILEY]).participantScope).toBeNull();
    });

    it("5 — a display name never resolves identity", () => {
        expect(ctx("Avery Wright", [AVERY, RILEY]).participantScope).toBeNull();
    });

    it("6 — row-to-row navigation cannot retain stale scope", () => {
        // Row A: Avery scoped on the Wright case.
        const rowA = ctx("ocm_avery", [AVERY, RILEY]);
        expect(rowA.participantScope?.participationId).toBe("ocm_avery");

        // Row B: a different family, and the runtime still carries Avery's id for an instant.
        const rowB = ctx("ocm_avery", [{ id: "ocm_other", customer_member_id: "cm_other", child_name: "Sam Other" }]);
        expect(rowB.participantScope).toBeNull();

        // Row B once its own selection lands.
        const rowBSettled = ctx("ocm_other", [{ id: "ocm_other", customer_member_id: "cm_other", child_name: "Sam Other" }]);
        expect(rowBSettled.participantScope?.displayName).toBe("Sam Other");
    });

    it("7 — the case remains the panel subject; scope never changes grain", () => {
        const c = ctx("ocm_avery", [AVERY, RILEY]);
        expect(c.grain).toBe("case");
        expect(c.subject.type).toBe("opportunity");
        expect(c.subject.id).toBe("opp_1");
        // And the case's own stage is untouched by whoever is scoped.
        expect(c.businessProcess.stageKey).toBe("tour");
    });

    it("a case with no children carries no scope", () => {
        expect(ctx(null, []).participantScope).toBeNull();
        expect(ctx("ocm_avery", []).participantScope).toBeNull();
    });
});
