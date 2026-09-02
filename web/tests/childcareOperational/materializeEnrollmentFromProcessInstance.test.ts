/**
 * Enrollment completion materializes durable operational truth from the process instance:
 * validates the process, resolves facts (PI metadata → placement_candidates → OCM), delegates to the
 * shared core, and stamps provenance back on the instance. The Process Instance stays the journey;
 * the Agreement is the durable truth — no operational facts are moved into process_instances.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/childcareOperational/materializeChildEnrollment", () => ({
    applyChildEnrollmentMaterialization: vi.fn(async () => ({
        site_location_id: "site-1",
        agreement: { outcome: "created", id: "agr-1" },
        placement: { outcome: "created", id: "plc-1" },
        schedule_assignment: { outcome: "created", id: "sch-1" },
        warnings: [],
    })),
}));

import {
    materializeEnrollmentFromProcessInstance,
    materializeEnrollmentForChildScope,
} from "@/lib/childcareOperational/materializeEnrollmentFromProcessInstance";
import { applyChildEnrollmentMaterialization } from "@/lib/childcareOperational/materializeChildEnrollment";

const ORG = "org-1";
const core = vi.mocked(applyChildEnrollmentMaterialization);

type Rec = Record<string, unknown>;

const pi = (extra: Rec = {}): Rec => ({
    id: "pi-1",
    org_id: ORG,
    process_key: "enrollment",
    subject_type: "child",
    subject_id: "child-A",
    context_type: "opportunity",
    context_id: "opp-1",
    stage_key: "enrolling",
    state: "enrolling",
    metadata: {},
    created_at: "2026-07-01",
    updated_at: "2026-07-02",
    ...extra,
});

/** Mock Supabase over the reads the materializer makes; captures the process_instances update patch. */
function mockSupabase(cfg: { processInstance?: Rec | null; candidate?: Rec | null; ocm?: Rec | null; opportunity?: Rec | null; scopeId?: string | null }) {
    /*
     * `ocmAccess` counts OCM reads that could SUPPLY A FACT — nothing else.
     *
     * The materializer now resolves the journey's anchor through the participation, so it touches
     * `opportunity_customer_members` on every run. Counting every touch would turn this guard into
     * "the materializer never mentions OCM", which is not the rule; the rule is that OCM must not be
     * a source of operational facts unless the legacy flag says so. Fact reads are told apart by
     * what they SELECT — the anchor lookup asks only for ids.
     */
    const captured: { piUpdate: Rec | null; ocmAccess: number; ocmAnchorReads: number } = {
        piUpdate: null,
        ocmAccess: 0,
        ocmAnchorReads: 0,
    };
    const client = {
        from(table: string) {
            let op: "select" | "update" = "select";
            let cols = "*";
            let patch: Rec | null = null;
            const builder: Rec = {
                select(c?: string) {
                    cols = c ?? "*";
                    if (table === "opportunity_customer_members") {
                        const factColumns = /program_category_id|program_room_cohort_key|schedule_type|start_date|person_id|location_id/;
                        if (factColumns.test(cols)) captured.ocmAccess++;
                        else captured.ocmAnchorReads++;
                    }
                    return builder;
                },
                update(p: Rec) {
                    op = "update";
                    patch = p;
                    return builder;
                },
                eq: () => builder,
                maybeSingle() {
                    if (table === "process_instances") return Promise.resolve({ data: cols === "id" ? (cfg.scopeId ? { id: cfg.scopeId } : null) : (cfg.processInstance ?? null), error: null });
                    if (table === "placement_candidates") return Promise.resolve({ data: cfg.candidate ?? null, error: null });
                    if (table === "opportunity_customer_members") return Promise.resolve({ data: cfg.ocm ?? null, error: null });
                    if (table === "opportunities") return Promise.resolve({ data: cfg.opportunity ?? null, error: null });
                    return Promise.resolve({ data: null, error: null });
                },
                then(resolve: (r: { data: null; error: null }) => void) {
                    if (op === "update" && table === "process_instances") captured.piUpdate = patch;
                    resolve({ data: null, error: null });
                },
            };
            return builder;
        },
    };
    return { client: client as never, captured };
}

describe("materializeEnrollmentFromProcessInstance", () => {
    beforeEach(() => core.mockClear());

    it("skips when the process is not an enrollment journey about a child", async () => {
        const { client } = mockSupabase({ processInstance: pi({ process_key: "billing" }) });
        const res = await materializeEnrollmentFromProcessInstance(client, { processInstanceId: "pi-1", orgId: ORG });
        expect(res.skipped).toBe(true);
        // The gate no longer requires an Opportunity context — an Enrollment journey anchored to its
        // participation is a first-class enrollment, so the reason names what is actually checked.
        expect(res.reason).toBe("not_enrollment_child_process");
        expect(core).not.toHaveBeenCalled();
    });

    it("creates the agreement and returns its id", async () => {
        const { client } = mockSupabase({
            processInstance: pi({ metadata: { site_location_id: "site-1", program_category_id: "prog-1", start_date: "2026-09-01", schedule_type: "full_day" } }),
        });
        const res = await materializeEnrollmentFromProcessInstance(client, { processInstanceId: "pi-1", orgId: ORG, todayYmd: "2026-07-04" });
        expect(res.ok).toBe(true);
        expect(res.agreement_id).toBe("agr-1");
        expect(core).toHaveBeenCalledTimes(1);
        expect(core.mock.calls[0][1].facts).toMatchObject({ customerMemberId: "child-A", siteLocationId: "site-1", programCategoryId: "prog-1", startDate: "2026-09-01", scheduleType: "full_day" });
    });

    it("prefers process-instance facts over OCM (source order)", async () => {
        const { client } = mockSupabase({
            processInstance: pi({ metadata: { site_location_id: "site-1", program_category_id: "prog-from-meta" } }),
            ocm: { id: "ocm-1", program_category_id: "prog-from-ocm", location_id: "site-ocm" },
        });
        const res = await materializeEnrollmentFromProcessInstance(client, { processInstanceId: "pi-1", orgId: ORG });
        expect(core.mock.calls[0][1].facts.programCategoryId).toBe("prog-from-meta");
        expect(res.fact_sources?.programCategoryId).toBe("process_instance");
        expect(res.fact_sources?.siteLocationId).toBe("process_instance");
    });

    it("falls back to OCM ONLY behind the legacy flag (old data)", async () => {
        process.env.ALLOY_ENROLLMENT_MATERIALIZE_OCM_FALLBACK = "1";
        try {
            const { client } = mockSupabase({
                processInstance: pi({ metadata: {} }),
                ocm: { id: "ocm-1", program_category_id: "prog-from-ocm", location_id: "site-ocm", schedule_type: "half_day" },
            });
            const res = await materializeEnrollmentFromProcessInstance(client, { processInstanceId: "pi-1", orgId: ORG });
            expect(core.mock.calls[0][1].facts.programCategoryId).toBe("prog-from-ocm");
            expect(res.fact_sources?.programCategoryId).toBe("ocm");
            expect(res.fact_sources?.siteLocationId).toBe("ocm");
        } finally {
            delete process.env.ALLOY_ENROLLMENT_MATERIALIZE_OCM_FALLBACK;
        }
    });

    it("does NOT read OCM by default (new leads); site/facts come from PI metadata + placement candidate", async () => {
        const { client, captured } = mockSupabase({
            processInstance: pi({ metadata: {} }),
            candidate: { program_room_cohort_key: "room-1", start_date: "2026-09-01", site_id: "site-cand" },
            // OCM present in fixture but must be ignored without the flag:
            ocm: { id: "ocm-1", program_category_id: "prog-from-ocm", location_id: "site-ocm" },
        });
        const res = await materializeEnrollmentFromProcessInstance(client, { processInstanceId: "pi-1", orgId: ORG });
        expect(res.ok).toBe(true);
        expect(captured.ocmAccess).toBe(0); // OCM never consulted for a FACT
        // …though the anchor IS resolved through it, which is how a participation-anchored journey
        // finds its Opportunity at all. Asserted so the distinction stays deliberate.
        expect(captured.ocmAnchorReads).toBeGreaterThan(0);
        expect(core.mock.calls[0][1].facts.siteLocationId).toBe("site-cand"); // from placement candidate, not OCM
        expect(res.fact_sources?.siteLocationId).toBe("placement_candidate");
    });

    it("skips with a clear reason when required site fact is missing", async () => {
        const { client } = mockSupabase({ processInstance: pi({ metadata: {} }) });
        const res = await materializeEnrollmentFromProcessInstance(client, { processInstanceId: "pi-1", orgId: ORG });
        expect(res.ok).toBe(false);
        expect(res.skipped).toBe(true);
        expect(res.reason).toBe("missing_site_location_id");
    });

    it("stamps ONLY provenance + journey markers on the instance — no new operational facts", async () => {
        // PI metadata holds a DRAFT desired input (program) the process collected — that is legitimate
        // and preserved; the durable fact now lives on the agreement.
        const originalMeta = { site_location_id: "site-1", program_category_id: "prog-1" };
        const { client, captured } = mockSupabase({ processInstance: pi({ metadata: { ...originalMeta } }) });
        await materializeEnrollmentFromProcessInstance(client, { processInstanceId: "pi-1", orgId: ORG, completedStageKey: "enrolled" });
        const patch = captured.piUpdate!;
        const newMeta = patch.metadata as Rec;
        // The ONLY keys the materializer adds to metadata are provenance pointers (not operational facts).
        const added = Object.keys(newMeta).filter((k) => !(k in originalMeta));
        expect(added.sort()).toEqual(["enrollment_agreement_id", "materialized_at"]);
        expect(newMeta.enrollment_agreement_id).toBe("agr-1");
        // Top-level patch is journey-only: metadata + updated_at + terminal state/stage. No fact columns.
        expect(Object.keys(patch).sort()).toEqual(["metadata", "stage_key", "state", "updated_at"]);
        expect(patch.state).toBe("enrolled");
        expect(patch.stage_key).toBe("enrolled");
    });

    it("is idempotent — reused agreement still returns ok and re-stamps provenance", async () => {
        core.mockResolvedValueOnce({
            site_location_id: "site-1",
            agreement: { outcome: "reused", id: "agr-existing" },
            placement: { outcome: "reused", id: "plc-x" },
            schedule_assignment: { outcome: "reused", id: "sch-x" },
            warnings: [],
        });
        const { client, captured } = mockSupabase({ processInstance: pi({ metadata: { site_location_id: "site-1" } }) });
        const res = await materializeEnrollmentFromProcessInstance(client, { processInstanceId: "pi-1", orgId: ORG });
        expect(res.ok).toBe(true);
        expect(res.agreement_id).toBe("agr-existing");
        expect((captured.piUpdate!.metadata as Rec).enrollment_agreement_id).toBe("agr-existing");
    });

    it("scope wrapper resolves the instance id then materializes; null when none", async () => {
        const withId = mockSupabase({ scopeId: "pi-1", processInstance: pi({ metadata: { site_location_id: "site-1" } }) });
        const res = await materializeEnrollmentForChildScope(withId.client, { orgId: ORG, opportunityId: "opp-1", customerMemberId: "child-A" });
        expect(res?.ok).toBe(true);

        const noId = mockSupabase({ scopeId: null });
        const none = await materializeEnrollmentForChildScope(noId.client, { orgId: ORG, opportunityId: "opp-1", customerMemberId: "child-A" });
        expect(none).toBeNull();
    });
});
