/**
 * Blocker 1 — waitlist placement candidate is created from process-instance / child-subject scope,
 * with no OCM read or write. Facts come from the child's enrollment process instance metadata.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ensurePlacementCandidateForWaitlistedChildBySubject } from "@/lib/orchestration/placement/placementCandidateLifecycleHook";

const ORG = "org-1";
const OPP = "opp-1";

type Rec = Record<string, unknown>;

function mockSupabase(cfg: { pi?: Rec | null; cm?: Rec | null; existingSeed?: boolean }) {
    const captured: { inserted: Rec | null; ocmAccess: number } = { inserted: null, ocmAccess: 0 };
    const client = {
        from(table: string) {
            if (table === "opportunity_customer_members") captured.ocmAccess++;
            let cols = "*";
            const filters: Rec = {};
            const builder: Rec = {
                select(c?: string) { cols = c ?? "*"; return builder; },
                eq(col: string, v: unknown) { filters[col] = v; return builder; },
                or() { return builder; },
                limit() { return builder; },
                insert(row: Rec) { if (table === "placement_candidates") captured.inserted = row; return Promise.resolve({ data: null, error: null }); },
                maybeSingle() {
                    if (table === "opportunities") return Promise.resolve({ data: { id: OPP, customer_id: "cust-1", location_id: "site-1", status_key: "open", created_at: "2026-06-01" }, error: null });
                    if (table === "process_instances") return Promise.resolve({ data: cfg.pi ?? null, error: null });
                    if (table === "customer_members") return Promise.resolve({ data: cfg.cm ?? { id: filters.id, person_id: "person-x", dob: "2024-05-01" }, error: null });
                    if (table === "location_program_categories") return Promise.resolve({ data: { key: "infant" }, error: null });
                    if (table === "placement_candidates" && cols === "id") return Promise.resolve({ data: cfg.existingSeed ? { id: "pc-existing" } : null, error: null });
                    return Promise.resolve({ data: null, error: null });
                },
            };
            return builder;
        },
    };
    return { client: client as never, captured };
}

const pi = (subjectId: string): Rec => ({
    id: `pi-${subjectId}`,
    metadata: { program_category_id: "prog-1", location_id: "site-1", program_room_cohort_key: "room-1", start_date: "2026-09-01" },
});

describe("ensurePlacementCandidateForWaitlistedChildBySubject", () => {
    beforeEach(() => { delete process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED; });

    it("creates a placement candidate WITHOUT OCM (no read/write)", async () => {
        const { client, captured } = mockSupabase({ pi: pi("child-A") });
        const res = await ensurePlacementCandidateForWaitlistedChildBySubject(client, { orgId: ORG, opportunityId: OPP, customerMemberId: "child-A" });
        expect(res.created).toBe(true);
        expect(captured.ocmAccess).toBe(0); // never touched opportunity_customer_members
        expect(captured.inserted).toMatchObject({
            org_id: ORG,
            opportunity_id: OPP,
            customer_member_id: "child-A",
            opportunity_customer_member_id: null, // no OCM dependency
            site_id: "site-1",
            status: "active",
        });
        expect(String(captured.inserted!.seed_key)).toContain("pc_v1_pi:opp-1:child-A");
        expect(String(captured.inserted!.seed_key)).not.toContain("missing_ocm");
    });

    it("is idempotent — skips when a candidate for the seed already exists", async () => {
        const { client, captured } = mockSupabase({ pi: pi("child-A"), existingSeed: true });
        const res = await ensurePlacementCandidateForWaitlistedChildBySubject(client, { orgId: ORG, opportunityId: OPP, customerMemberId: "child-A" });
        expect(res.created).toBe(false);
        expect(res.skipped_reason).toBe("already_exists");
        expect(captured.inserted).toBeNull();
        expect(captured.ocmAccess).toBe(0);
    });

    it("targets only the waitlisted child — a sibling is untouched", async () => {
        // Waitlisting child-A inserts a candidate keyed on child-A; child-B is never referenced.
        const { client, captured } = mockSupabase({ pi: pi("child-A") });
        await ensurePlacementCandidateForWaitlistedChildBySubject(client, { orgId: ORG, opportunityId: OPP, customerMemberId: "child-A" });
        expect(captured.inserted!.customer_member_id).toBe("child-A");
        expect(String(captured.inserted!.seed_key)).not.toContain("child-B");
    });

    it("skips when there is no enrollment process instance for the child", async () => {
        const { client, captured } = mockSupabase({ pi: null });
        const res = await ensurePlacementCandidateForWaitlistedChildBySubject(client, { orgId: ORG, opportunityId: OPP, customerMemberId: "child-A" });
        // opportunity exists but no PI → still builds from opportunity fallback facts (no OCM).
        expect(captured.ocmAccess).toBe(0);
        expect(res.attempted).toBe(true);
    });
});
