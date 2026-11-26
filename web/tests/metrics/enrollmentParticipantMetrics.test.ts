/** @vitest-environment node */

/**
 * The Lyons scenario proven at the METRIC layer — metrics count participants via the engine
 * projection + semantics, so the same membership drives active/new/waitlisted. No separate logic.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MetricResolveContext } from "@/lib/metrics/types";
import { buildProcessParticipant } from "@/lib/process/engine";
import type { EnrollmentParticipant, EnrollmentAttributes } from "@/lib/process/definitions/enrollment";

const loadMock = vi.fn(async (): Promise<EnrollmentParticipant[]> => []);
vi.mock("@/lib/process/definitions/enrollment", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/process/definitions/enrollment")>();
    return { ...actual, enrollmentProjection: { ...actual.enrollmentProjection, load: () => loadMock() } };
});

const resolveMetricScopeFilterMock = vi.fn();
vi.mock("@/lib/metrics/scopeFilter", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/metrics/scopeFilter")>();
    return {
        ...actual,
        resolveMetricScopeFilter: (...args: unknown[]) => resolveMetricScopeFilterMock(...args),
    };
});

import {
    resolveEnrollmentActiveLeads,
    resolveEnrollmentActiveFamilies,
    resolveEnrollmentNewLeads,
    resolveEnrollmentWaitlisted,
    resolveEnrollmentLeadCountCompat,
    enrollmentParticipantMatchesLocationScope,
} from "@/lib/metrics/resolvers/enrollmentParticipantMetrics";

function child(over: {
    id: string;
    stageKey?: string | null;
    state?: string | null;
    contextLocationId?: string | null;
    subjectLocationId?: string | null;
}): EnrollmentParticipant {
    const attributes: EnrollmentAttributes = {
        contextStatusKey: "open",
        subjectActive: true,
        waitlistRank: null,
        contextLocationId: over.contextLocationId ?? "site-north",
        subjectLocationId: over.subjectLocationId ?? over.contextLocationId ?? "site-north",
    };
    return buildProcessParticipant<EnrollmentAttributes>(
        {
            id: over.id,
            org_id: "org-1",
            process_key: "enrollment",
            subject_type: "child",
            subject_id: `cm-${over.id}`,
            context_id: "opp-lyons",
            stage_key: over.stageKey ?? null,
            state: over.state ?? null,
            close_reason_key: null,
        },
        { contextStageKey: "lead", scopeId: "wu-1", attributes }, // household is at Lead stage
    );
}

const ctx = { supabase: {} as never, orgId: "org-1", scope: {} as never, window: "rolling_30d", workUnitId: "wu-1" } as MetricResolveContext;
async function counts() {
    return {
        active: (await resolveEnrollmentActiveLeads(ctx)).value,
        newLeads: (await resolveEnrollmentNewLeads(ctx)).value,
        waitlisted: (await resolveEnrollmentWaitlisted(ctx)).value,
    };
}

describe("Lyons scenario — metrics count participants", () => {
    beforeEach(() => {
        loadMock.mockReset();
        resolveMetricScopeFilterMock.mockReset();
    });

    it("two children both at Lead → Active 2 / New 2 / Waitlisted 0 / Families 1", async () => {
        // Both children ride the family track (stage null → effective 'lead' from the household).
        loadMock.mockResolvedValue([child({ id: "a" }), child({ id: "b" })]);
        expect(await counts()).toEqual({ active: 2, newLeads: 2, waitlisted: 0 });
        expect((await resolveEnrollmentActiveFamilies(ctx)).value).toBe(1);
        expect((await resolveEnrollmentActiveFamilies(ctx)).meta).toMatchObject({ grain: "case" });
    });

    it("move one child to Waitlist → Active 2 / New 1 / Waitlisted 1", async () => {
        loadMock.mockResolvedValue([child({ id: "a" }), child({ id: "b", stageKey: "waitlist" })]);
        expect(await counts()).toEqual({ active: 2, newLeads: 1, waitlisted: 1 });
    });

    it("lead_count is the DEPRECATED alias of active_leads (one definition)", async () => {
        loadMock.mockResolvedValue([child({ id: "a" }), child({ id: "b", stageKey: "waitlist" })]);
        expect((await resolveEnrollmentLeadCountCompat(ctx)).value).toBe(2); // == active_leads
    });

    it("enrolled/withdrawn children drop out of Active (terminal state)", async () => {
        loadMock.mockResolvedValue([
            child({ id: "a" }),
            child({ id: "e", stageKey: "enrolled", state: "enrolled" }),
        ]);
        expect((await resolveEnrollmentActiveLeads(ctx)).value).toBe(1); // only child a
    });
});

describe("Workspace Site Filter — enrollment participant metrics", () => {
    beforeEach(() => {
        loadMock.mockReset();
        resolveMetricScopeFilterMock.mockReset();
    });

    it("zeros Family Leads / Children when the selected site has no matching subjects", async () => {
        resolveMetricScopeFilterMock.mockResolvedValue({
            constraints: {},
            locationIds: ["site-south"],
            impossible: false,
        });
        loadMock.mockResolvedValue([
            child({ id: "a", contextLocationId: "site-north", subjectLocationId: "site-north" }),
            child({ id: "b", contextLocationId: "site-north", subjectLocationId: "site-north" }),
        ]);
        const siteCtx = { ...ctx, siteLocationId: "site-south", workUnitId: null } as MetricResolveContext;
        expect((await resolveEnrollmentActiveFamilies(siteCtx)).value).toBe(0);
        expect((await resolveEnrollmentActiveLeads(siteCtx)).value).toBe(0);
        expect((await resolveEnrollmentActiveFamilies(siteCtx)).meta).toMatchObject({
            scope: "site",
            site_id: "site-south",
        });
    });

    it("respects child OCM location for participant grain vs opportunity location for case grain", () => {
        const northChildSouthOcm = child({
            id: "mixed",
            contextLocationId: "site-north",
            subjectLocationId: "site-south",
        });
        expect(
            enrollmentParticipantMatchesLocationScope(northChildSouthOcm, ["site-south"], "participant"),
        ).toBe(true);
        expect(
            enrollmentParticipantMatchesLocationScope(northChildSouthOcm, ["site-south"], "case"),
        ).toBe(false);
        expect(
            enrollmentParticipantMatchesLocationScope(northChildSouthOcm, ["site-north"], "case"),
        ).toBe(true);
    });
});
