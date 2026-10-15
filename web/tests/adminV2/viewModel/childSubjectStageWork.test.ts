/**
 * E2E-17 — one canonical child participation subject, both track shapes, no sibling leakage.
 * (Also covers E2E-12's child-subject stage scoping, now derived from the same resolution.)
 *
 * Measured on deployed 59538995: a child opened from the Waitlist view settled with
 * `selectedParticipant: null` because `resolveParticipationSubjectForOpportunity` accepted only
 * tracks anchored to the opportunity, while the certified Add Child → Waitlist path anchors the
 * track to the child's Enrollment Participation.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { sliceSpy } = vi.hoisted(() => ({ sliceSpy: vi.fn() }));
vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice", () => ({
    resolveOpportunityStageWorkSlice: (...a: unknown[]) => sliceSpy(...a),
}));
vi.mock("@/lib/communications/v2/familyWorkspace", () => ({ resolveFamilyCommunicationWorkspacePreview: vi.fn() }));

import { resolveParticipationSubjectForOpportunity } from "@/lib/adminV2/runtime/operationalContext/resolveParticipationSubjectForOpportunity";
import { buildDeferredDetailResource } from "@/lib/adminV2/viewModel/drawer/opportunity/deferredDetailResource";

const OPP = "opp-1";
const ORG = "org";
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
const track = (id: string, member: string, ocm: string, stage: string, extra: Record<string, unknown> = {}) => ({
    id, org_id: ORG, subject_type: "child", subject_id: member, context_type: "enrollment_participation", context_id: ocm, stage_key: stage, close_reason_key: null, ...extra,
});
const link = (id: string, member: string, opp = OPP) => ({ id, org_id: ORG, customer_member_id: member, opportunity_id: opp });
const FAMILY = fake({
    process_instances: [
        track("pi-alpha", "cm-alpha", "ocm-alpha", "waitlist"),
        track("pi-bravo", "cm-bravo", "ocm-bravo", "waitlist"),
        { ...track("pi-legacy", "cm-legacy", OPP, "lead"), context_type: "opportunity" },
        track("pi-foreign", "cm-foreign", "ocm-foreign", "waitlist"),
        track("pi-closed", "cm-closed", "ocm-closed", "waitlist", { close_reason_key: "withdrawn" }),
        track("pi-mismatch", "cm-someone-else", "ocm-alpha", "waitlist"),
    ],
    opportunity_customer_members: [
        link("ocm-alpha", "cm-alpha"),
        link("ocm-bravo", "cm-bravo"),
        link("ocm-foreign", "cm-foreign", "opp-2"),
        link("ocm-closed", "cm-closed"),
    ],
});
const resolve = (participationId: string | null) =>
    resolveParticipationSubjectForOpportunity({ supabase: FAMILY, orgId: ORG, opportunityId: OPP, participationId });

describe("resolveParticipationSubjectForOpportunity — the canonical child participation subject", () => {
    it("1. a participation-anchored track (the certified Add Child → Waitlist shape) resolves — was null", async () => {
        expect(await resolve("pi-alpha")).toEqual({
            participationId: "pi-alpha",
            customerMemberId: "cm-alpha",
            enrollmentParticipationId: "ocm-alpha",
            stageKey: "waitlist",
        });
    });
    it("2. the older opportunity-anchored shape still resolves", async () => {
        expect(await resolve("pi-legacy")).toMatchObject({ participationId: "pi-legacy", customerMemberId: "cm-legacy", stageKey: "lead" });
    });
    it("3. siblings resolve distinctly — never each other", async () => {
        const [a, b] = [await resolve("pi-alpha"), await resolve("pi-bravo")];
        expect(a?.customerMemberId).toBe("cm-alpha");
        expect(b?.customerMemberId).toBe("cm-bravo");
        expect(await resolve("pi-alpha")).toEqual(a); // deterministic
    });
    it("4. a family subject names no child — null, never the first child", async () => {
        expect(await resolve(OPP)).toBeNull();
        expect(await resolve(null)).toBeNull();
    });
    it("5. another family's participation is refused", async () => {
        expect(await resolve("pi-foreign")).toBeNull();
    });
    it("6. a track whose participation names a different child is refused", async () => {
        expect(await resolve("pi-mismatch")).toBeNull();
    });
    it("7. a closed track keeps the existing policy (resolves the child) but carries no open stage", async () => {
        expect(await resolve("pi-closed")).toMatchObject({ customerMemberId: "cm-closed", stageKey: null });
    });
});

describe("buildDeferredDetailResource — child subject stage work (E2E-12)", () => {
    const base = { supabase: {} as never, orgId: ORG, opportunityId: OPP, viewerUserId: "u", departmentId: "d", deptMetadata: null, deferCommunicationsPreview: true };
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
