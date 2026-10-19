/**
 * ONE FAMILY, EVERY CHILD'S OWN JOURNEY — grouping, household ownership and navigation.
 *
 * Measured before this slice: the family view existed only for a household with a live Opportunity
 * episode, and only for children still running in it. A context-free household had no family view
 * (and could not pay through it); a child who reached Enrolled vanished from it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const live = { context: null as null | { opportunityId: string; runningSubjectIds: string[] } };
vi.mock("@/lib/records/enrollmentContextResolver", () => ({
    resolveLiveEnrollmentContextForHousehold: async () => ({ context: live.context, consideredOpportunityIds: [] }),
}));
vi.mock("@/lib/enrollment/completion/resolveEnrollmentJourneyContext", () => ({
    enrollmentContextIdsForOpportunities: async (_s: unknown, _o: string, ids: string[]) => ({ contextIds: [...ids, "ocm-ava", "ocm-ben", "ocm-cy"], opportunityIdByContextId: new Map() }),
}));
const progressCalls: string[] = [];
vi.mock("@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress", () => ({
    resolveEnrollmentParticipantProgress: async (_s: unknown, input: { processInstanceId: string; captureLoaded?: (l: unknown) => void }) => {
        progressCalls.push(input.processInstanceId);
        input.captureLoaded?.({ requirements: [] });
        return { ok: true, value: { total_requirements: 2, satisfied_requirements: 1, remaining_requirements: 1, requirements: [] } };
    },
}));
vi.mock("@/lib/enrollment/financial/readEnrollmentFeeProjection", () => ({
    readFamilyEnrollmentFeeProjection: async () => ({ state: "NOT_APPLICABLE", needsAttention: false, amounts: { currencyCode: null, grossCents: 0, expectedFundingCents: 0, collectibleNowCents: 0, appliedCents: 0, outstandingCents: 0 }, obligations: [], explanation: "" }),
}));

import { groupHouseholdEnrollmentJourneys, onePerChild } from "@/lib/enrollment/family/groupHouseholdEnrollmentJourneys";
import { resolveFamilyEnrollmentExperience } from "@/lib/enrollment/family/resolveFamilyEnrollmentExperience";
import { composeFamilyEnrollmentExperience } from "@/lib/enrollment/family/familyEnrollmentExperience";

const ORG = "org";
const HOUSE = "house-1";
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

function db() {
    return {
        from(table: string) {
            let rows = [...(tables[table] ?? [])];
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return api; },
                in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return api; },
                maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
                insert: () => { throw new Error("WROTE during a read"); },
                update: () => { throw new Error("WROTE during a read"); },
                then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
            };
            return api;
        },
    } as never;
}

const pi = (id: string, child: string, over: Row = {}): Row => ({
    id, org_id: ORG, subject_id: child, subject_type: "child", process_key: "enrollment", state: null, stage_key: "enrolling", context_id: null, created_at: "2026-10-01", ...over,
});

beforeEach(() => {
    live.context = null;
    progressCalls.length = 0;
    tables = {
        customer_members: [
            { id: "ava", org_id: ORG, customer_id: HOUSE, display_name: "Ava" },
            { id: "ben", org_id: ORG, customer_id: HOUSE, display_name: "Ben" },
            { id: "cy", org_id: ORG, customer_id: HOUSE, display_name: "Charlie" },
            { id: "zed", org_id: ORG, customer_id: "other-house", display_name: "Zed" },
        ],
        process_instances: [],
        form_packet_sessions: [],
        form_public_links: [],
        processing_cases: [],
        child_enrollment_agreements: [],
        customers: [{ id: HOUSE, org_id: ORG, name: "Test Family" }],
    };
});

describe("grouping the family's child journeys", () => {
    it("episode: Enrolled, Waitlist and Enrolling siblings are shown together — the enrolled one is kept", async () => {
        live.context = { opportunityId: "opp-1", runningSubjectIds: ["ben", "cy"] };
        tables.process_instances = [
            pi("pi-ava", "ava", { state: "enrolled", stage_key: "enrolled", context_id: "ocm-ava" }),
            pi("pi-ben", "ben", { stage_key: "waitlist", context_id: "ocm-ben" }),
            pi("pi-cy", "cy", { context_id: "ocm-cy" }),
        ];
        const g = await groupHouseholdEnrollmentJourneys(db(), { orgId: ORG, customerId: HOUSE });
        expect(g?.basis).toBe("episode");
        expect(g?.instances.map((i) => i.id).sort()).toEqual(["pi-ava", "pi-ben", "pi-cy"]);
    });

    it("household: context-free journeys with no Opportunity are grouped by household", async () => {
        tables.process_instances = [pi("pi-ava", "ava"), pi("pi-ben", "ben", { stage_key: "waitlist" })];
        const g = await groupHouseholdEnrollmentJourneys(db(), { orgId: ORG, customerId: HOUSE });
        expect(g?.basis).toBe("household");
        expect(g?.opportunityId).toBeNull();
        expect(g?.instances.map((i) => i.id).sort()).toEqual(["pi-ava", "pi-ben"]);
    });

    it("an archived child's journey is history, not family progress", async () => {
        tables.customer_members.push({ id: "built", org_id: ORG, customer_id: HOUSE, display_name: "Built-out", is_active: false });
        tables.process_instances = [pi("pi-ava", "ava"), pi("pi-built", "built")];
        const g = await groupHouseholdEnrollmentJourneys(db(), { orgId: ORG, customerId: HOUSE });
        expect(g?.instances.map((i) => i.id)).toEqual(["pi-ava"]);
    });

    it("never includes another household's child, another process, or a non-child subject", async () => {
        tables.process_instances = [
            pi("pi-ava", "ava"),
            pi("pi-zed", "zed"),
            pi("pi-other", "ben", { process_key: "staff_onboarding" }),
            pi("pi-case", "cy", { subject_type: "case" }),
        ];
        const g = await groupHouseholdEnrollmentJourneys(db(), { orgId: ORG, customerId: HOUSE });
        expect(g?.instances.map((i) => i.id)).toEqual(["pi-ava"]);
    });

    it("household with only concluded journeys and no episode has no family view", async () => {
        tables.process_instances = [pi("pi-ava", "ava", { state: "enrolled" })];
        expect(await groupHouseholdEnrollmentJourneys(db(), { orgId: ORG, customerId: HOUSE })).toBeNull();
    });

    it("one journey per child: the running one, else the latest", () => {
        const picked = onePerChild([
            { id: "old", subject_id: "ava", state: "withdrawn", stage_key: null, created_at: "2025-01-01" },
            { id: "run", subject_id: "ava", state: null, stage_key: "enrolling", created_at: "2024-01-01" },
            { id: "b1", subject_id: "ben", state: "enrolled", stage_key: null, created_at: "2025-01-01" },
            { id: "b2", subject_id: "ben", state: "withdrawn", stage_key: null, created_at: "2026-01-01" },
        ]);
        expect(picked.map((p) => p.id).sort()).toEqual(["b2", "run"]);
    });
});

describe("the family resolver", () => {
    const session = (piId: string) => ({ id: `s-${piId}`, process_instance_id: piId, status: "in_progress", crm_snapshot: { customer_id: HOUSE } });

    beforeEach(() => {
        live.context = { opportunityId: "opp-1", runningSubjectIds: ["ben", "cy"] };
        tables.process_instances = [
            pi("pi-ava", "ava", { state: "enrolled", stage_key: "enrolled", context_id: "ocm-ava" }),
            pi("pi-ben", "ben", { stage_key: "waitlist", context_id: "ocm-ben" }),
            pi("pi-cy", "cy", { context_id: "ocm-cy" }),
        ];
        tables.form_packet_sessions = [
            { id: "s-pi-ben", org_id: ORG, process_instance_id: "pi-ben", status: "in_progress", started_via_public_link_id: "link-ben" },
            { id: "s-pi-cy", org_id: ORG, process_instance_id: "pi-cy", status: "in_progress", started_via_public_link_id: "link-cy" },
        ];
        tables.form_public_links = [
            { id: "link-cy", org_id: ORG, metadata: { recipient_person_id: "parent-1", share_embed_path: "/forms/embed/cy-token" } },
            { id: "link-ben", org_id: ORG, metadata: { recipient_person_id: "parent-2", share_embed_path: "/forms/embed/ben-token" } },
        ];
    });

    it("shows each child's own state; a concluded child is not re-projected or counted as work", async () => {
        const r = await resolveFamilyEnrollmentExperience(db(), { orgId: ORG, session: session("pi-cy"), focusedCustomerMemberId: "cy", linkId: "link-cy" });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const byName = Object.fromEntries(r.value.progress.filter((p) => p.customerMemberId).map((p) => [p.label, p.detail]));
        expect(byName).toEqual({ Ava: "Enrolled", Ben: "On the waitlist", Charlie: "1 of 2 complete" });
        expect(progressCalls).not.toContain("pi-ava");
    });

    it("offers a sibling's own link only when it was addressed to the same person", async () => {
        tables.form_public_links.push({ id: "link-cy-2", org_id: ORG, metadata: { recipient_person_id: "parent-2" } });
        const asParent2 = await resolveFamilyEnrollmentExperience(db(), { orgId: ORG, session: session("pi-ben"), linkId: "link-cy-2" });
        const asParent1 = await resolveFamilyEnrollmentExperience(db(), { orgId: ORG, session: session("pi-cy"), linkId: "link-cy" });
        const paths = (r: typeof asParent1) => (r.ok ? Object.fromEntries(r.value.children.map((c) => [c.displayName, c.participantPath])) : {});
        expect(paths(asParent1)).toMatchObject({ Charlie: "/forms/embed/cy-token", Ben: null });
        expect(paths(asParent2)).toMatchObject({ Charlie: null, Ben: "/forms/embed/ben-token" });
        // With no arrival link, nobody's link is offered.
        expect(paths(await resolveFamilyEnrollmentExperience(db(), { orgId: ORG, session: session("pi-cy") }))).toMatchObject({ Charlie: null, Ben: null });
    });

    it("refuses when the session's own child is not in the household its snapshot names", async () => {
        tables.process_instances.push(pi("pi-zed", "zed"));
        const r = await resolveFamilyEnrollmentExperience(db(), { orgId: ORG, session: session("pi-zed") });
        expect(r.ok).toBe(false);
    });
});

describe("the family's completion is each child's own", () => {
    const child = (name: string, state: "in_progress" | "waitlisted" | "enrolled", submitted: boolean) => ({
        customerMemberId: name, displayName: name, processInstanceId: `pi-${name}`, sessionId: null, participantPath: null, state,
        locationName: null, totalRequirements: 2, satisfiedRequirements: submitted ? 2 : 1, remainingRequirements: submitted ? 0 : 1, submitted, processingState: null,
    });

    it("an enrolled and a waitlisted sibling neither finish nor hold open the child still working", () => {
        const open = composeFamilyEnrollmentExperience({ opportunityId: null, familyName: "F", sharedInformationComplete: true, financials: null, children: [child("Ava", "enrolled", true), child("Ben", "waitlisted", false), child("Cy", "in_progress", false)] });
        expect(open.complete).toBe(false);
        const done = composeFamilyEnrollmentExperience({ opportunityId: null, familyName: "F", sharedInformationComplete: true, financials: null, children: [child("Ava", "enrolled", true), child("Ben", "waitlisted", false), child("Cy", "in_progress", true)] });
        expect(done.complete).toBe(true);
        expect(done.progress.find((p) => p.label === "Ben")?.complete).toBe(false);
    });
});

describe("a child the family asked about appears as requested — never as Enrolling", () => {
    it("shows the requested child with no requirements and leaves siblings unchanged", async () => {
        live.context = { opportunityId: "opp-1", runningSubjectIds: ["cy"] };
        tables.customer_members = tables.customer_members.map((m) => ({ ...m, relationship: "child", is_active: true }));
        tables.customer_members.push({ id: "dee", org_id: ORG, customer_id: HOUSE, display_name: "Dee", relationship: "child", is_active: true });
        tables.process_instances = [pi("pi-cy", "cy", { context_id: "ocm-cy" })];
        tables.opportunity_customer_members = [{ org_id: ORG, customer_member_id: "dee", opportunity_id: "opp-1", outcome_status_key: "new_inquiry" }];
        const r = await resolveFamilyEnrollmentExperience(db(), {
            orgId: ORG,
            session: { id: "s", process_instance_id: "pi-cy", status: "in_progress", crm_snapshot: { customer_id: HOUSE } },
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const rows = Object.fromEntries(r.value.progress.filter((p) => p.customerMemberId).map((p) => [p.label, [p.detail, p.complete]]));
        expect(rows).toEqual({ Charlie: ["1 of 2 complete", false], Dee: ["Requested — the school will review", false] });
        expect(r.value.children.find((c) => c.displayName === "Dee")?.processInstanceId).toBeNull();
    });

    it("a new child the family told the school about shows as sent for review, or not added — never as a child's journey", async () => {
        live.context = { opportunityId: "opp-1", runningSubjectIds: ["cy"] };
        tables.process_instances = [pi("pi-cy", "cy", { context_id: "ocm-cy" })];
        tables.processing_participant_child_requests = [
            { id: "r1", org_id: ORG, customer_id: HOUSE, first_name: "Dex", last_name: "Example", status: "pending", created_at: "2026-10-18T00:00:00Z" },
            { id: "r2", org_id: ORG, customer_id: HOUSE, first_name: "Fay", last_name: "Example", status: "declined", created_at: "2026-10-18T00:00:01Z" },
            { id: "r3", org_id: ORG, customer_id: HOUSE, first_name: "Gus", last_name: "Example", status: "committed", created_at: "2026-10-18T00:00:02Z" },
            { id: "r4", org_id: ORG, customer_id: "other-house", first_name: "Zed", last_name: "Other", status: "pending", created_at: "2026-10-18T00:00:03Z" },
        ];
        const r = await resolveFamilyEnrollmentExperience(db(), {
            orgId: ORG,
            session: { id: "s", process_instance_id: "pi-cy", status: "in_progress", crm_snapshot: { customer_id: HOUSE } },
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const rows = Object.fromEntries(r.value.progress.filter((p) => p.customerMemberId).map((p) => [p.label, [p.detail, p.complete]]));
        expect(rows).toEqual({
            Charlie: ["1 of 2 complete", false],
            "Dex Example": ["Sent to the school for review", false],
            "Fay Example": ["Not added — please contact the school", false],
        });
        // A request is never the child still working, and holds nothing open for the family.
        expect(r.value.children.filter((c) => c.state === "sent_for_review" || c.state === "not_added").every((c) => c.processInstanceId === null && c.totalRequirements === 0)).toBe(true);
    });
});
