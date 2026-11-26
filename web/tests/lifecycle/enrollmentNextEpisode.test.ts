/**
 * THE NEXT-EPISODE PROOF.
 *
 * The defect, stated as the story it broke:
 *
 *   A family enrolls their child. A year later they enroll the same child again — same school,
 *   still no acquisition Opportunity, because the school has known them since last year.
 *
 * Before this correction the second Start Enrollment found last year's `enrolled` participation
 * still occupying the child's one ACTIVE context-free slot, and REUSED it. The new journey began
 * already holding the previous episode's outcome, and creating a second participation was
 * impossible because the partial unique index forbade it. The family could not re-enroll.
 *
 * This exercises the real reuse logic against a fake client — not the source text — so it fails if
 * the behaviour regresses however the code is rearranged.
 */

import { describe, expect, it } from "vitest";

import { ensureOpportunityCustomerMemberParticipation } from "@/lib/lifecycle/ensureOpportunityCustomerMemberParticipation";

type Row = {
    id: string;
    org_id: string;
    opportunity_id: string | null;
    customer_member_id: string;
    outcome_status_key: string | null;
};

const ORG = "org-1";
const CHILD = "child-1";

/**
 * A fake `opportunity_customer_members` table.
 *
 * It enforces the SAME partial uniqueness the migration declares, so a test that would have needed
 * two simultaneously-active context-free rows fails here exactly as Postgres would.
 */
function fakeClient(seed: Row[]) {
    const rows: Row[] = [...seed];
    let nextId = seed.length + 1;
    const CONCLUDED = new Set(["withdrawn", "not_enrolling", "enrolled"]);
    const occupiesActiveSlot = (r: Row) =>
        r.opportunity_id === null && !CONCLUDED.has(String(r.outcome_status_key ?? "").trim());

    const client = {
        rows,
        from() {
            const filters: Array<(r: Row) => boolean> = [];
            const builder: Record<string, unknown> = {
                select() {
                    return builder;
                },
                eq(col: string, val: unknown) {
                    filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val);
                    return builder;
                },
                maybeSingle() {
                    const found = rows.filter((r) => filters.every((f) => f(r)));
                    return Promise.resolve({ data: found[0] ?? null, error: null });
                },
                single() {
                    const found = rows.filter((r) => filters.every((f) => f(r)));
                    return Promise.resolve({ data: found[0] ?? null, error: null });
                },
                insert(payload: Record<string, unknown>) {
                    const candidate: Row = {
                        id: `ocm-${nextId++}`,
                        org_id: String(payload.org_id),
                        opportunity_id: (payload.opportunity_id as string | null) ?? null,
                        customer_member_id: String(payload.customer_member_id),
                        outcome_status_key: (payload.outcome_status_key as string | null) ?? null,
                    };
                    // The partial unique index, enforced.
                    const clash =
                        occupiesActiveSlot(candidate) &&
                        rows.some(
                            (r) =>
                                r.org_id === candidate.org_id &&
                                r.customer_member_id === candidate.customer_member_id &&
                                occupiesActiveSlot(r),
                        );
                    return {
                        select: () => ({
                            single: () =>
                                clash ?
                                    Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } })
                                :   (rows.push(candidate), Promise.resolve({ data: { id: candidate.id }, error: null })),
                        }),
                    };
                },
                then: undefined as unknown,
            };
            // The context-free lookup awaits the filtered select directly.
            (builder as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
                resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null });
            return builder;
        },
    };
    return client as unknown as Parameters<typeof ensureOpportunityCustomerMemberParticipation>[0]["supabase"] & {
        rows: Row[];
    };
}

const row = (over: Partial<Row> & { id: string }): Row => ({
    org_id: ORG,
    opportunity_id: null,
    customer_member_id: CHILD,
    outcome_status_key: "enrolling",
    ...over,
});

describe("one ACTIVE context-free participation per child", () => {
    it("2 — repeated Start Enrollment while it is active REUSES it", async () => {
        const supabase = fakeClient([row({ id: "ocm-A", outcome_status_key: "enrolling" })]);
        const first = await ensureOpportunityCustomerMemberParticipation({
            supabase,
            orgId: ORG,
            customerMemberId: CHILD,
            outcomeStatusKey: "enrolling",
        });
        expect(first).toEqual({ ocmId: "ocm-A", created: false });

        const second = await ensureOpportunityCustomerMemberParticipation({
            supabase,
            orgId: ORG,
            customerMemberId: CHILD,
            outcomeStatusKey: "enrolling",
        });
        expect(second).toEqual({ ocmId: "ocm-A", created: false });
        expect(supabase.rows).toHaveLength(1);
    });

    it("reuses an UNDISPOSITIONED participation — a fresh one is the live episode", async () => {
        const supabase = fakeClient([row({ id: "ocm-A", outcome_status_key: null })]);
        const result = await ensureOpportunityCustomerMemberParticipation({
            supabase,
            orgId: ORG,
            customerMemberId: CHILD,
        });
        expect(result).toEqual({ ocmId: "ocm-A", created: false });
    });
});

describe("F — a concluded episode releases the slot", () => {
    it("3+4 — once ENROLLED it is not active, and a new Start Enrollment creates a NEW participation", async () => {
        const supabase = fakeClient([row({ id: "ocm-A", outcome_status_key: "enrolled" })]);

        const next = await ensureOpportunityCustomerMemberParticipation({
            supabase,
            orgId: ORG,
            customerMemberId: CHILD,
            outcomeStatusKey: "enrolling",
        });

        expect(next.created).toBe(true);
        expect(next.ocmId).not.toBe("ocm-A");
        expect(supabase.rows).toHaveLength(2);
    });

    it("5 — the old enrolled row is untouched history", async () => {
        const supabase = fakeClient([row({ id: "ocm-A", outcome_status_key: "enrolled" })]);
        await ensureOpportunityCustomerMemberParticipation({
            supabase,
            orgId: ORG,
            customerMemberId: CHILD,
            outcomeStatusKey: "enrolling",
        });

        const historical = supabase.rows.find((r) => r.id === "ocm-A");
        // Not rewound to `enrolling`, not deleted, not reused.
        expect(historical).toMatchObject({ id: "ocm-A", outcome_status_key: "enrolled", opportunity_id: null });
    });

    it("6 — withdrawn and not_enrolling still release the slot, as already modeled", async () => {
        for (const concluded of ["withdrawn", "not_enrolling"]) {
            const supabase = fakeClient([row({ id: "ocm-A", outcome_status_key: concluded })]);
            const next = await ensureOpportunityCustomerMemberParticipation({
                supabase,
                orgId: ORG,
                customerMemberId: CHILD,
                outcomeStatusKey: "enrolling",
            });
            expect(next.created).toBe(true);
            expect(supabase.rows).toHaveLength(2);
        }
    });

    it("7 — no Opportunity is fabricated for the new episode", async () => {
        const supabase = fakeClient([row({ id: "ocm-A", outcome_status_key: "enrolled" })]);
        const next = await ensureOpportunityCustomerMemberParticipation({
            supabase,
            orgId: ORG,
            customerMemberId: CHILD,
            outcomeStatusKey: "enrolling",
        });
        const created = supabase.rows.find((r) => r.id === next.ocmId);
        expect(created?.opportunity_id).toBeNull();
        expect(supabase.rows.every((r) => r.opportunity_id === null)).toBe(true);
    });

    it("8 — two SIMULTANEOUSLY-ACTIVE context-free rows remain impossible", async () => {
        // One active row already exists; the reuse path must return it rather than inserting a
        // second. If the lookup ever regressed to always-insert, the index would reject it.
        const supabase = fakeClient([row({ id: "ocm-A", outcome_status_key: "enrolling" })]);
        await ensureOpportunityCustomerMemberParticipation({
            supabase,
            orgId: ORG,
            customerMemberId: CHILD,
            outcomeStatusKey: "enrolling",
        });
        const active = supabase.rows.filter(
            (r) =>
                r.opportunity_id === null &&
                !["withdrawn", "not_enrolling", "enrolled"].includes(String(r.outcome_status_key)),
        );
        expect(active).toHaveLength(1);
    });

    it("the full next-episode story: A enrolled, B active, B is not A", async () => {
        const supabase = fakeClient([row({ id: "ocm-A", outcome_status_key: "enrolled" })]);

        const episodeTwo = await ensureOpportunityCustomerMemberParticipation({
            supabase,
            orgId: ORG,
            customerMemberId: CHILD,
            outcomeStatusKey: "enrolling",
        });

        const a = supabase.rows.find((r) => r.id === "ocm-A");
        const b = supabase.rows.find((r) => r.id === episodeTwo.ocmId);

        expect(b?.id).not.toBe(a?.id);
        expect(a?.outcome_status_key).toBe("enrolled");
        expect(b?.outcome_status_key).toBe("enrolling");
        expect(b?.opportunity_id).toBeNull();
    });
});
