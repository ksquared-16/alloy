/**
 * E2E-12 — a child subject's Focus Panel shows that child's stage work, not the family Mission's.
 *
 * Measured on deployed c081f862: with Charlie still at the family position the family Mission is
 * (correctly) Lead, and Alpha opened from the Waitlist view then showed Lead work — the settled
 * stage-work slice was keyed to the family Mission alone.
 */
import { describe, expect, it, vi } from "vitest";

const { sliceSpy } = vi.hoisted(() => ({ sliceSpy: vi.fn() }));
vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice", () => ({
    resolveOpportunityStageWorkSlice: (...a: unknown[]) => sliceSpy(...a),
}));
vi.mock("@/lib/communications/v2/familyWorkspace", () => ({ resolveFamilyCommunicationWorkspacePreview: vi.fn() }));

import { resolveAttentionTrackForOpportunity } from "@/lib/adminV2/runtime/operationalContext/resolveAttentionTrackForOpportunity";
import { buildDeferredDetailResource } from "@/lib/adminV2/viewModel/drawer/opportunity/deferredDetailResource";

const OPP = "opp-1";
function fake(tables: Record<string, Array<Record<string, unknown>>>) {
    return {
        from(table: string) {
            const f: Record<string, unknown> = {};
            const chain: Record<string, unknown> = {
                select: () => chain,
                eq: (c: string, v: unknown) => ((f[c] = v), chain),
                maybeSingle: async () => ({
                    data: (tables[table] ?? []).find((r) => Object.entries(f).every(([k, v]) => r[k] === v)) ?? null,
                    error: null,
                }),
            };
            return chain;
        },
    } as never;
}
const TRACK = { id: "pi-alpha", org_id: "org", subject_type: "child", subject_id: "cm-alpha", stage_key: "waitlist", close_reason_key: null };

describe("resolveAttentionTrackForOpportunity", () => {
    it("resolves a track anchored to the child's participation in this opportunity (grain-crossing doctrine)", async () => {
        const sb = fake({
            process_instances: [{ ...TRACK, context_id: "ocm-alpha" }],
            opportunity_customer_members: [{ id: "ocm-alpha", org_id: "org", opportunity_id: OPP }],
        });
        expect(await resolveAttentionTrackForOpportunity({ supabase: sb, orgId: "org", opportunityId: OPP, participationId: "pi-alpha" })).toEqual({
            processInstanceId: "pi-alpha",
            customerMemberId: "cm-alpha",
            ocmId: "ocm-alpha",
            stageKey: "waitlist",
        });
    });
    it("resolves a track anchored to the opportunity itself (older journeys)", async () => {
        const sb = fake({ process_instances: [{ ...TRACK, context_id: OPP }] });
        expect((await resolveAttentionTrackForOpportunity({ supabase: sb, orgId: "org", opportunityId: OPP, participationId: "pi-alpha" }))?.ocmId).toBeNull();
    });
    it("refuses a track belonging to another family", async () => {
        const sb = fake({
            process_instances: [{ ...TRACK, context_id: "ocm-other" }],
            opportunity_customer_members: [{ id: "ocm-other", org_id: "org", opportunity_id: "opp-2" }],
        });
        expect(await resolveAttentionTrackForOpportunity({ supabase: sb, orgId: "org", opportunityId: OPP, participationId: "pi-alpha" })).toBeNull();
    });
    it("a family subject (attention = the opportunity) or a closed track is not a child subject", async () => {
        const sb = fake({ process_instances: [{ ...TRACK, context_id: OPP, close_reason_key: "withdrawn" }] });
        expect(await resolveAttentionTrackForOpportunity({ supabase: sb, orgId: "org", opportunityId: OPP, participationId: "pi-alpha" })).toBeNull();
        expect(await resolveAttentionTrackForOpportunity({ supabase: sb, orgId: "org", opportunityId: OPP, participationId: OPP })).toBeNull();
    });
});

describe("buildDeferredDetailResource — child subject", () => {
    const base = { supabase: {} as never, orgId: "org", opportunityId: OPP, viewerUserId: "u", departmentId: "d", deptMetadata: null, deferCommunicationsPreview: true };
    it("runs the stage-work slice child-scoped when a child track is the subject", async () => {
        sliceSpy.mockResolvedValue({ stage_work_runtime: null, published_stage_inputs: null, work_intent_runtime: null });
        await buildDeferredDetailResource({ ...base, currentStageKey: "waitlist", currentStageLabel: "Waitlist", attentionTrack: { processInstanceId: "pi-alpha", customerMemberId: "cm-alpha", ocmId: "ocm-alpha" } });
        expect(sliceSpy.mock.calls.at(-1)![0]).toMatchObject({ stageKey: "waitlist", processInstanceId: "pi-alpha", customerMemberId: "cm-alpha", opportunityCustomerMemberId: "ocm-alpha" });
    });
    it("a family subject is unchanged — no child scope", async () => {
        sliceSpy.mockResolvedValue({ stage_work_runtime: null, published_stage_inputs: null, work_intent_runtime: null });
        await buildDeferredDetailResource({ ...base, currentStageKey: "lead", currentStageLabel: "Lead" });
        expect(sliceSpy.mock.calls.at(-1)![0]).not.toHaveProperty("processInstanceId");
    });
});
