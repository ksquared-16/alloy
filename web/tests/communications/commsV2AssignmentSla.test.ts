import { describe, expect, it } from "vitest";
import { applyAssignmentAction, computeSlaState, type AssignmentFields } from "@/lib/communications/v2/assignmentSla";

const UNASSIGNED: AssignmentFields = { assignment_state: "unassigned", assigned_user_id: null, assigned_team_id: null };

/** PKG-10 — assignment transitions. */
describe("applyAssignmentAction", () => {
    it("claim assigns to the actor", () => {
        const r = applyAssignmentAction(UNASSIGNED, "claim", { actorUserId: "u1" });
        expect(r.next).toEqual({ assignment_state: "assigned", assigned_user_id: "u1", assigned_team_id: null });
        expect(r.event).toMatchObject({ action: "claim", to_user_id: "u1", actor_user_id: "u1", from_user_id: null });
    });
    it("assign/reassign set the target + record the previous owner", () => {
        const cur: AssignmentFields = { assignment_state: "assigned", assigned_user_id: "u1", assigned_team_id: null };
        const r = applyAssignmentAction(cur, "reassign", { actorUserId: "mgr", toUserId: "u2" });
        expect(r.next.assigned_user_id).toBe("u2");
        expect(r.event.from_user_id).toBe("u1");
    });
    it("route to a team, and unassign clears", () => {
        expect(applyAssignmentAction(UNASSIGNED, "route", { toTeamId: "t1" }).next).toEqual({
            assignment_state: "assigned", assigned_user_id: null, assigned_team_id: "t1",
        });
        expect(applyAssignmentAction(UNASSIGNED, "route", {}).next.assignment_state).toBe("unassigned");
        const cur: AssignmentFields = { assignment_state: "assigned", assigned_user_id: "u1", assigned_team_id: null };
        expect(applyAssignmentAction(cur, "unassign", { actorUserId: "u1" }).next).toEqual(UNASSIGNED);
    });
});

/** PKG-10 — SLA computation. */
describe("computeSlaState", () => {
    const TH = { firstResponseMinutes: 60, staleHours: 72 };
    const at = (s: string) => Date.parse(s);
    it("awaiting response → first_response_due then overdue", () => {
        const inbound = "2026-06-11T10:00:00Z";
        expect(computeSlaState({ lastInboundAt: inbound }, at("2026-06-11T10:30:00Z"), TH).slaState).toBe("first_response_due");
        expect(computeSlaState({ lastInboundAt: inbound }, at("2026-06-11T12:00:00Z"), TH).slaState).toBe("overdue");
    });
    it("not awaiting + old last message → stale", () => {
        const r = computeSlaState(
            { lastInboundAt: "2026-05-30T00:00:00Z", lastOutboundAt: "2026-06-01T00:00:00Z", lastMessageAt: "2026-06-01T00:00:00Z" },
            at("2026-06-11T00:00:00Z"), TH
        );
        expect(r.slaState).toBe("stale");
    });
    it("recent + responded → none", () => {
        const r = computeSlaState(
            { lastInboundAt: "2026-06-11T09:00:00Z", lastOutboundAt: "2026-06-11T09:30:00Z", lastMessageAt: "2026-06-11T09:30:00Z" },
            at("2026-06-11T10:00:00Z"), TH
        );
        expect(r.slaState).toBe("none");
    });
});
