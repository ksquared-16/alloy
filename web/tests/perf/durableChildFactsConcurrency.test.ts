/**
 * P0-7.6 FINAL OWNER — the authoritative child roster, and the N+1 inside it.
 *
 * ── WHERE THE TIME WAS ──────────────────────────────────────────────────────────────────────────
 *
 * Decomposed on deployed 1072986ab (n=12, the drawer's own phase marks over the SAME shell):
 *
 *   visible_shell_children_ms            2,798
 *     children_overlay_parallel_fetch_ms 2,296   <- 82% of the chain
 *     children_ocm_members_batch_ms        130
 *     children_children_shell_tail_ms      124   <- photo minting lives HERE
 *     children_child_scoped_contacts_ms    115
 *     children_child_persons_ms            109
 *     children_location_labels_ms          108
 *     children_process_draft_ms              0
 *
 * The three legs of that `Promise.all` were already concurrent with one another. The serial cost
 * was INSIDE one of them: `resolveDurableFactsForChildren` awaited a full read model per child,
 * inside a `for` loop.
 *
 * Photos are 124ms. They are NOT the owner, and no photo split is made here.
 *
 * ── WHAT THESE TESTS PIN ────────────────────────────────────────────────────────────────────────
 *
 * EXACT roster parity, not count parity — the same map, the same keys, the same field values,
 * including the duplicate-member last-write-wins the serial loop had. And a WALL-CLOCK assertion,
 * because the Work View shared-acquisition experiment already proved query count is the wrong
 * measure: fewer queries can be slower when concurrency is replaced by a serial prefix.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ id: string; start: number; end: number }> = [];
const DELAY = 60;

vi.mock("@/lib/childcareOperational/operationalEnrollmentReadModel", () => ({
    buildOperationalEnrollmentReadModelForAgreement: vi.fn(
        async (_s: unknown, _o: string, agreementId: string) => {
            const start = Date.now();
            await new Promise((r) => setTimeout(r, DELAY));
            calls.push({ id: agreementId, start, end: Date.now() });
            if (agreementId === "agr-noagreement") return { agreement: null, labels: {}, placement: null };
            return {
                agreement: { id: agreementId, status: "active", start_date: "2026-01-01", site_location_id: "site-1" },
                labels: { program: `prog-${agreementId}`, room: `room-${agreementId}`, schedule: `sched-${agreementId}` },
                placement: { start_date: "2026-02-01", program_category_id: `pc-${agreementId}`, room_location_id: `rl-${agreementId}` },
            };
        },
    ),
}));

import { resolveDurableFactsForChildren } from "@/lib/childcareOperational/inquiryChildrenDurableFactsOverlay";

/** Supabase double returning a fixed agreement set. */
function fakeSupabase(agreements: Array<Record<string, unknown>> | null, error: unknown = null) {
    const b: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in"]) b[op] = () => b;
    b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: agreements, error }).then(res);
    return { from: () => b } as never;
}

const agr = (member: string, id: string, site: string | null = "site-1", status = "active") => ({
    id, customer_member_id: member, site_location_id: site, status,
});

beforeEach(() => { calls.length = 0; });

describe("exact roster parity — the same map, not the same count", () => {
    it("one child", async () => {
        const out = await resolveDurableFactsForChildren(
            fakeSupabase([agr("m1", "agr-1")]), "org-1", [{ customerMemberId: "m1", siteLocationId: "site-1" }],
        );
        expect([...out.keys()]).toEqual(["m1"]);
        expect(out.get("m1")).toEqual({
            programLabel: "prog-agr-1", roomLabel: "room-agr-1", scheduleLabel: "sched-agr-1",
            startDate: "2026-02-01", programCategoryId: "pc-agr-1", roomLocationId: "rl-agr-1",
            siteLocationId: "site-1", agreementStatus: "active",
        });
    });

    it("multiple children — every child present, each with its OWN agreement", async () => {
        const out = await resolveDurableFactsForChildren(
            fakeSupabase([agr("m1", "agr-1"), agr("m2", "agr-2"), agr("m3", "agr-3")]),
            "org-1",
            ["m1", "m2", "m3"].map((m) => ({ customerMemberId: m, siteLocationId: "site-1" })),
        );
        expect([...out.keys()].sort()).toEqual(["m1", "m2", "m3"]);
        expect(out.get("m2")!.programLabel).toBe("prog-agr-2");
        expect(out.get("m3")!.roomLocationId).toBe("rl-agr-3");
    });

    it("a child with NO agreement is absent, not an empty row", async () => {
        const out = await resolveDurableFactsForChildren(
            fakeSupabase([agr("m1", "agr-1")]), "org-1",
            [{ customerMemberId: "m1" }, { customerMemberId: "m-none" }],
        );
        expect(out.has("m-none")).toBe(false);
        expect(out.size).toBe(1);
    });

    it("a read model with no agreement is skipped, not written as nulls", async () => {
        const out = await resolveDurableFactsForChildren(
            fakeSupabase([agr("m1", "agr-noagreement")]), "org-1", [{ customerMemberId: "m1" }],
        );
        expect(out.size).toBe(0);
    });

    it("site preference: the agreement at the child's site wins over the first", async () => {
        const out = await resolveDurableFactsForChildren(
            fakeSupabase([agr("m1", "agr-other", "site-OTHER"), agr("m1", "agr-mine", "site-MINE")]),
            "org-1", [{ customerMemberId: "m1", siteLocationId: "site-MINE" }],
        );
        expect(out.get("m1")!.programLabel).toBe("prog-agr-mine");
    });

    it("no site on the child falls back to the FIRST operational agreement", async () => {
        const out = await resolveDurableFactsForChildren(
            fakeSupabase([agr("m1", "agr-first", "site-A"), agr("m1", "agr-second", "site-B")]),
            "org-1", [{ customerMemberId: "m1", siteLocationId: null }],
        );
        expect(out.get("m1")!.programLabel).toBe("prog-agr-first");
    });

    it("a member named twice keeps LAST-WRITE-WINS in iteration order", async () => {
        // The serial loop resolved duplicates this way; concurrency must not make it race.
        const out = await resolveDurableFactsForChildren(
            fakeSupabase([agr("m1", "agr-A", "site-A"), agr("m1", "agr-B", "site-B")]),
            "org-1",
            [{ customerMemberId: "m1", siteLocationId: "site-A" }, { customerMemberId: "m1", siteLocationId: "site-B" }],
        );
        expect(out.get("m1")!.programLabel).toBe("prog-agr-B");
    });

    it("no children, and a failed agreement read, both yield an empty map", async () => {
        expect((await resolveDurableFactsForChildren(fakeSupabase([]), "org-1", [])).size).toBe(0);
        expect((await resolveDurableFactsForChildren(fakeSupabase(null, { message: "boom" }), "org-1",
            [{ customerMemberId: "m1" }])).size).toBe(0);
    });
});

describe("the read models are built TOGETHER, not one per child in series", () => {
    it("five children cost about ONE read model, not five", async () => {
        const members = ["m1", "m2", "m3", "m4", "m5"];
        const t0 = Date.now();
        const out = await resolveDurableFactsForChildren(
            fakeSupabase(members.map((m, i) => agr(m, `agr-${i}`))),
            "org-1", members.map((m) => ({ customerMemberId: m, siteLocationId: "site-1" })),
        );
        const wall = Date.now() - t0;
        expect(out.size).toBe(5);
        expect(calls.length).toBe(5);
        // Serial would be ~5*DELAY. Concurrent is ~DELAY.
        expect(wall, `expected ~${DELAY}ms, got ${wall}ms — the read models look serialised`)
            .toBeLessThan(3 * DELAY);
    });

    it("their in-flight windows actually overlap", async () => {
        const members = ["m1", "m2", "m3"];
        await resolveDurableFactsForChildren(
            fakeSupabase(members.map((m, i) => agr(m, `agr-${i}`))),
            "org-1", members.map((m) => ({ customerMemberId: m, siteLocationId: "site-1" })),
        );
        const first = calls[0], last = calls[calls.length - 1];
        const overlap = Math.min(first.end, last.end) - Math.max(first.start, last.start);
        expect(overlap, "the first and last read model must be in flight at the same time")
            .toBeGreaterThan(0);
    });
});
