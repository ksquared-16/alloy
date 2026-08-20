import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * `RL-32` — **the controls that hold, stay holding** (§25), for the two families that had no lock.
 *
 * `W-40` / `RL-30` proved that every side-effecting route reachable without a session
 * AUTHENTICATES its sender. Its own header states the two things it does NOT prove:
 *
 *   > "it does not prove the check PRECEDES the side effect, and it does not prove the credential
 *   > is bound to the SUBJECT being mutated."
 *
 * Both are `RL-32`'s, and §19 states its tier C shape: *"per family — token expiry, replay,
 * cross-subject, cross-org; webhook signature rejection before any side effect."*
 *
 * ## Which families this file locks, and which it deliberately does not
 *
 * `RL-30` enumerated 18 sessionless side-effecting routes in four families. Two were already
 * locked and are NOT restated here:
 *
 *   - **tour-booking (6 routes)** — `tests/tours/authorizeTourAction.test.ts` already covers all
 *     four properties by name: expiry (link and invitation), replay (single-use consumption plus
 *     the losing racer), cross-subject (`recipient_mismatch`), cross-org (`context_mismatch`).
 *     Duplicating it here would add coverage of nothing.
 *   - **public forms (3 routes)** — resolve through the same hashed-token shape.
 *
 * That leaves the two this file exists for:
 *
 *   - **`action_links` (3 routes)** — the family whose single-use guarantee was NOT concurrency
 *     safe. Every one of them established "not yet used" with a SELECT and then wrote with
 *     `.eq("id", …)` alone, so two callers holding one token both passed and both proceeded to the
 *     side effect. `claimActionLink` moves the predicate into the write; these tests are what
 *     convict its removal.
 *   - **webhooks (3 routes)** — where the property is ORDER, not presence. A route that verifies a
 *     signature after it has already written has a signature check and no protection.
 *
 * ## Why these assert an ABSENCE of effect
 *
 * The failure being locked is not "returns the wrong status" — a replayed link that returns 410 and
 * still emits the event has done the damage and reported a refusal. So each test asserts the
 * refusal AND that the side effect was never attempted, and each is paired with a positive control
 * proving the effect does happen when the credential is good. A refusal test with no positive
 * control passes just as well against a route that refuses everything.
 */

const TOKEN = "a".repeat(48);
const LINK_ID = "link-1";
const ORG_ID = "org-1";
const VENDOR_ID = "11111111-2222-3333-4444-555555555555";
const JOB_ID = "66666666-7777-8888-9999-000000000000";
const SCHEDULE_ID = "sched-1";

const { mockEmitEvent, mockExecuteWorkflowRun } = vi.hoisted(() => ({
    mockEmitEvent: vi.fn(),
    mockExecuteWorkflowRun: vi.fn(),
}));
vi.mock("@/lib/emitEvent", () => ({ emitEvent: mockEmitEvent }));
vi.mock("@/lib/workflowRun", () => ({ executeWorkflowRun: mockExecuteWorkflowRun }));

const { mockAdminClient, mockServiceClient } = vi.hoisted(() => ({
    mockAdminClient: { value: null as unknown },
    mockServiceClient: { value: null as unknown },
}));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: vi.fn(() => mockAdminClient.value) }));
vi.mock("@/lib/supabase/serverServiceClient", () => ({
    createServiceRoleClient: vi.fn(() => mockServiceClient.value),
}));

// The accept-job route hydrates a workflow payload from several tables. None of it is the subject
// here, and letting it run would make the test about payload shape rather than about the claim.
vi.mock("@/lib/actionLinkDisplayDetails", () => ({
    loadJobScheduleAndLocationForActionLink: vi.fn(async () => ({
        job: { id: JOB_ID, customer_id: null, opportunity_id: null, primary_contact_id: null, scheduled_at: null },
        schedule: null,
        location: null,
    })),
    loadBookingPersonForJobWorkflow: vi.fn(async () => null),
}));

import { POST as consumeTokenPOST } from "@/app/api/action/[token]/consume/route";
import { POST as consumeReschedulePOST } from "@/app/api/action-links/consume-reschedule/route";
import { POST as consumeAcceptJobPOST } from "@/app/api/action-links/consume-accept-job/route";

// ---------------------------------------------------------------------------
// A Supabase double that RECORDS the shape of every statement
// ---------------------------------------------------------------------------

type Recorded = { table: string; ops: string[] };

/**
 * The recorder is the point. Asserting only on the returned status would let the
 * `.is("consumed_at", null)` predicate be deleted silently — the double would still answer, and
 * the route would still return 410 in the sequential case. Recording the operators lets a test
 * assert the WRITE ITSELF is guarded, which is the property that survives a race.
 */
function chainFor(rec: Recorded, resolve: () => Promise<unknown>) {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "or", "in", "neq", "update", "insert", "order", "limit"]) {
        c[m] = (...args: unknown[]) => {
            rec.ops.push(`${m}(${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(",")})`);
            return c;
        };
    }
    c.maybeSingle = async () => resolve();
    c.single = async () => resolve();
    // Thenable, so `await supabase.from(x).update(y).eq(z)` resolves like PostgREST's builder.
    c.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
        resolve().then(onOk, onErr);
    return c;
}

function makeSupabase(cfg: {
    linkRow: Record<string, unknown> | null;
    /** Does THIS caller win the atomic claim? `false` models losing the race to a concurrent caller. */
    claimWins: boolean;
    scheduleRow?: Record<string, unknown> | null;
    jobUpdateWins?: boolean;
}) {
    const calls: Recorded[] = [];
    const client = {
        from(table: string) {
            const rec: Recorded = { table, ops: [] };
            calls.push(rec);
            return chainFor(rec, async () => {
                const ops = rec.ops.join("|");
                const isUpdate = rec.ops[0]?.startsWith("update") ?? false;

                if (table === "action_links") {
                    if (!isUpdate) return { data: cfg.linkRow, error: cfg.linkRow ? null : { message: "not found" } };
                    // The guarded claim — identified by the predicate, not by call order.
                    if (ops.includes("is(consumed_at,null)")) {
                        return { data: cfg.claimWins ? { id: LINK_ID } : null, error: null };
                    }
                    return { data: null, error: null }; // unguarded bookkeeping write
                }
                if (table === "schedules") {
                    return cfg.scheduleRow
                        ? { data: cfg.scheduleRow, error: null }
                        : { data: null, error: { message: "no schedule" } };
                }
                if (table === "jobs") {
                    if (isUpdate) {
                        return {
                            data: cfg.jobUpdateWins ? { id: JOB_ID, assigned_vendor_id: VENDOR_ID } : null,
                            error: null,
                        };
                    }
                    return { data: { assigned_vendor_id: VENDOR_ID }, error: null };
                }
                if (table === "workflows") return { data: [], error: null };
                return { data: null, error: null };
            });
        },
    };
    return { calls, client };
}

/** The write that claims the link — located by its guard, which is what makes it a claim. */
function guardedClaims(calls: Recorded[]) {
    return calls.filter(
        (c) => c.table === "action_links" && c.ops[0]?.startsWith("update") && c.ops.join("|").includes("is(consumed_at,null)")
    );
}

function futureIso() {
    return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

function linkRow(over: Record<string, unknown> = {}) {
    return {
        id: LINK_ID,
        action_type: "customer_cancel",
        entity_type: "schedule",
        entity_id: SCHEDULE_ID,
        consumed_at: null,
        expires_at: futureIso(),
        org_id: ORG_ID,
        metadata: {},
        ...over,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockEmitEvent.mockResolvedValue("event-1");
    mockExecuteWorkflowRun.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// action_links — replay
// ---------------------------------------------------------------------------

describe("RL-32 · action_links — consumption is decided by the database, not by a prior read", () => {
    it("POST /api/action/[token]/consume claims with a guarded write", async () => {
        const { calls, client } = makeSupabase({ linkRow: linkRow(), claimWins: true });
        mockServiceClient.value = client;

        await consumeTokenPOST(new NextRequest("http://localhost/api/action/x/consume", { method: "POST" }), {
            params: Promise.resolve({ token: TOKEN }),
        });

        // Convicts deletion of the predicate: without `.is("consumed_at", null)` the UPDATE matches
        // a row that another caller already consumed, and the "single-use" link is reusable.
        expect(guardedClaims(calls)).toHaveLength(1);
    });

    it("POST /api/action/[token]/consume performs NO side effect when the claim is lost", async () => {
        const { client } = makeSupabase({ linkRow: linkRow(), claimWins: false });
        mockServiceClient.value = client;

        const res = await consumeTokenPOST(
            new NextRequest("http://localhost/api/action/x/consume", { method: "POST" }),
            { params: Promise.resolve({ token: TOKEN }) }
        );

        expect(res.status).toBe(410);
        expect(mockEmitEvent).not.toHaveBeenCalled();
        expect(mockExecuteWorkflowRun).not.toHaveBeenCalled();
    });

    it("POST /api/action/[token]/consume DOES emit when the claim is won — the positive control", async () => {
        const { client } = makeSupabase({ linkRow: linkRow(), claimWins: true });
        mockServiceClient.value = client;

        const res = await consumeTokenPOST(
            new NextRequest("http://localhost/api/action/x/consume", { method: "POST" }),
            { params: Promise.resolve({ token: TOKEN }) }
        );

        expect(res.status).toBe(200);
        expect(mockEmitEvent).toHaveBeenCalledTimes(1);
    });

    it("consume-reschedule claims with a guarded write and never moves the appointment on a lost claim", async () => {
        const { calls, client } = makeSupabase({
            linkRow: linkRow({ action_type: "customer_reschedule" }),
            claimWins: false,
            scheduleRow: { start_at: "x", end_at: "y", org_id: ORG_ID },
        });
        mockAdminClient.value = client;

        const start = new Date(Date.now() + 86_400_000).toISOString();
        const end = new Date(Date.now() + 90_000_000).toISOString();
        const res = await consumeReschedulePOST(
            new NextRequest("http://localhost/api/action-links/consume-reschedule", {
                method: "POST",
                body: JSON.stringify({ token: TOKEN, start_at: start, end_at: end }),
            })
        );

        expect(res.status).toBe(410);
        expect(guardedClaims(calls)).toHaveLength(1);
        // The whole point: the losing caller must not write `schedules` a second time.
        expect(calls.filter((c) => c.table === "schedules")).toHaveLength(0);
        expect(mockEmitEvent).not.toHaveBeenCalled();
    });

    it("consume-reschedule DOES move the appointment when the claim is won — the positive control", async () => {
        const { calls, client } = makeSupabase({
            linkRow: linkRow({ action_type: "customer_reschedule" }),
            claimWins: true,
            scheduleRow: { start_at: "x", end_at: "y", org_id: ORG_ID },
        });
        mockAdminClient.value = client;

        const start = new Date(Date.now() + 86_400_000).toISOString();
        const end = new Date(Date.now() + 90_000_000).toISOString();
        const res = await consumeReschedulePOST(
            new NextRequest("http://localhost/api/action-links/consume-reschedule", {
                method: "POST",
                body: JSON.stringify({ token: TOKEN, start_at: start, end_at: end }),
            })
        );

        expect(res.status).toBe(200);
        expect(calls.filter((c) => c.table === "schedules")).toHaveLength(1);
        expect(mockEmitEvent).toHaveBeenCalledTimes(1);
    });

    it("consume-accept-job claims BEFORE assigning, so a lost claim assigns nothing", async () => {
        const { calls, client } = makeSupabase({
            linkRow: linkRow({ action_type: "vendor_accept_job", entity_type: "job", entity_id: JOB_ID, metadata: { vendor_id: VENDOR_ID } }),
            claimWins: false,
            jobUpdateWins: true,
        });
        mockAdminClient.value = client;

        const res = await consumeAcceptJobPOST(
            new NextRequest("http://localhost/api/action-links/consume-accept-job", {
                method: "POST",
                body: JSON.stringify({ token: TOKEN }),
            })
        );

        expect(res.status).toBe(410);
        expect(guardedClaims(calls)).toHaveLength(1);
        // Ordering, not just atomicity: the assignment must sit AFTER the claim, so losing the
        // claim means the `jobs` write was never reached.
        expect(calls.filter((c) => c.table === "jobs" && c.ops[0]?.startsWith("update"))).toHaveLength(0);
        expect(mockEmitEvent).not.toHaveBeenCalled();
    });

    it("consume-accept-job DOES assign when the claim is won — the positive control", async () => {
        const { calls, client } = makeSupabase({
            linkRow: linkRow({ action_type: "vendor_accept_job", entity_type: "job", entity_id: JOB_ID, metadata: { vendor_id: VENDOR_ID } }),
            claimWins: true,
            jobUpdateWins: true,
        });
        mockAdminClient.value = client;

        const res = await consumeAcceptJobPOST(
            new NextRequest("http://localhost/api/action-links/consume-accept-job", {
                method: "POST",
                body: JSON.stringify({ token: TOKEN }),
            })
        );

        expect(res.status).toBe(200);
        expect(calls.filter((c) => c.table === "jobs" && c.ops[0]?.startsWith("update"))).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// action_links — expiry
// ---------------------------------------------------------------------------

describe("RL-32 · action_links — an expired credential reaches no side effect", () => {
    it("refuses an expired link without claiming it", async () => {
        const past = new Date(Date.now() - 60_000).toISOString();
        const { calls, client } = makeSupabase({ linkRow: linkRow({ expires_at: past }), claimWins: true });
        mockServiceClient.value = client;

        const res = await consumeTokenPOST(
            new NextRequest("http://localhost/api/action/x/consume", { method: "POST" }),
            { params: Promise.resolve({ token: TOKEN }) }
        );

        expect(res.status).toBe(410);
        expect(guardedClaims(calls)).toHaveLength(0);
        expect(mockEmitEvent).not.toHaveBeenCalled();
    });

    it("refuses an already-consumed link on the sequential path too", async () => {
        const { client } = makeSupabase({
            linkRow: linkRow({ consumed_at: new Date().toISOString() }),
            claimWins: true,
        });
        mockServiceClient.value = client;

        const res = await consumeTokenPOST(
            new NextRequest("http://localhost/api/action/x/consume", { method: "POST" }),
            { params: Promise.resolve({ token: TOKEN }) }
        );

        expect(res.status).toBe(410);
        expect(mockEmitEvent).not.toHaveBeenCalled();
    });
});
