/**
 * D-95, Slice 2.2 — participant Enrollment objective launch and resume.
 *
 * Exercises the real service against an in-memory Supabase double that models the parts of
 * the schema this path depends on, including the partial unique index. The database suite
 * proves the constraints exist; this proves the SERVICE behaves correctly around them —
 * particularly that losing the race resumes the winner's session instead of surfacing a
 * constraint error to a parent.
 */

import { describe, expect, it, vi } from "vitest";

import {
    CURRENT_ENROLLMENT_SESSION_STATUS,
    launchEnrollmentObjectiveSession,
    resolveCurrentEnrollmentSession,
} from "@/lib/pos/packet/enrollmentObjectiveSession";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const PI = "aaaa1111-0000-4000-8000-000000000001";
const PACKET_DEF = "ffffffff-0000-4000-8000-000000000001";
const LINK = "88888888-0000-4000-8000-000000000001";

type Session = {
    id: string;
    org_id: string;
    packet_definition_id: string;
    started_via_public_link_id: string;
    status: string;
    process_instance_id: string | null;
};

type World = {
    processInstances: { id: string; org_id: string; process_key: string; subject_type: string }[];
    sessions: Session[];
    /** Counts realizations so a race can be observed rather than inferred. */
    creates: number;
};

function world(over: Partial<World> = {}): World {
    return {
        processInstances: [{ id: PI, org_id: ORG, process_key: "enrollment", subject_type: "child" }],
        sessions: [],
        creates: 0,
        ...over,
    };
}

/**
 * Minimal Supabase double. Only the query shapes this service issues are modelled; anything
 * else throws, so a future change that reaches for an unmodelled table fails loudly rather
 * than silently returning empty.
 */
function client(w: World) {
    const makeQuery = (table: string) => {
        const filters: Record<string, unknown> = {};
        const q: Record<string, unknown> = {
            select: () => q,
            order: () => q,
            eq: (col: string, val: unknown) => {
                filters[col] = val;
                return q;
            },
            maybeSingle: async () => {
                if (table === "process_instances") {
                    const row = w.processInstances.find((p) => p.id === filters.id) ?? null;
                    return { data: row, error: null };
                }
                if (table === "form_packet_sessions") {
                    const row =
                        w.sessions.find(
                            (s) =>
                                s.org_id === filters.org_id &&
                                s.process_instance_id === filters.process_instance_id &&
                                s.status === filters.status,
                        ) ?? null;
                    return { data: row, error: null };
                }
                throw new Error(`unmodelled maybeSingle on ${table}`);
            },
            then: undefined,
        };
        // Item reads resolve as awaited thenables returning a data array.
        (q as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
            resolve({ data: [], error: null });
        return q;
    };
    return { from: (table: string) => makeQuery(table) } as never;
}

/** Stands in for `ensurePacketSessionForPublicLink`, honouring the unique index. */
function ensureDouble(w: World, opts: { concurrentWinnerFirst?: () => void } = {}) {
    return vi.fn(async (_c: unknown, input: { orgId: string; processInstanceId?: string | null }) => {
        opts.concurrentWinnerFirst?.();
        const anchored = input.processInstanceId ?? null;
        if (
            anchored &&
            w.sessions.some(
                (s) => s.process_instance_id === anchored && s.status === CURRENT_ENROLLMENT_SESSION_STATUS,
            )
        ) {
            return {
                session: null,
                items: [],
                error: new Error(
                    'duplicate key value violates unique constraint "uq_form_packet_sessions_current_process_instance"',
                ),
            };
        }
        const session: Session = {
            id: `sess-${w.sessions.length + 1}`,
            org_id: input.orgId,
            packet_definition_id: PACKET_DEF,
            started_via_public_link_id: LINK,
            status: CURRENT_ENROLLMENT_SESSION_STATUS,
            process_instance_id: anchored,
        };
        w.sessions.push(session);
        w.creates += 1;
        return { session, items: [], error: null };
    });
}

vi.mock("@/lib/forms/packets/formPacketService", async (orig) => {
    const actual = (await orig()) as Record<string, unknown>;
    return { ...actual, ensurePacketSessionForPublicLink: (...a: unknown[]) => currentEnsure(...a) };
});

let currentEnsure: (...a: unknown[]) => unknown = () => {
    throw new Error("ensure not installed");
};

function launch(w: World, over: Partial<Parameters<typeof launchEnrollmentObjectiveSession>[1]> = {}) {
    return launchEnrollmentObjectiveSession(client(w), {
        orgId: ORG,
        processInstanceId: PI,
        packetDefinitionId: PACKET_DEF,
        linkId: LINK,
        ...over,
    });
}

describe("launch — creation, idempotency, resume", () => {
    it("creates an anchored session on first launch", async () => {
        const w = world();
        currentEnsure = ensureDouble(w) as never;
        const r = await launch(w);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.outcome).toBe("created");
        expect(r.value.session.process_instance_id).toBe(PI);
        expect(w.creates).toBe(1);
    });

    it("is idempotent — a second launch RESUMES the same session", async () => {
        const w = world();
        currentEnsure = ensureDouble(w) as never;
        const first = await launch(w);
        const second = await launch(w);
        expect(first.ok && second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(second.value.outcome).toBe("resumed");
        expect(second.value.session.id).toBe(first.value.session.id);
        // The decisive assertion: no second realization occurred.
        expect(w.creates).toBe(1);
    });

    it("requires NO Opportunity — launch succeeds with an empty FK stamp", async () => {
        const w = world();
        currentEnsure = ensureDouble(w) as never;
        const r = await launch(w);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.session.process_instance_id).toBe(PI);
    });

    it("resumes after a terminal session by realizing a new one", async () => {
        const w = world();
        currentEnsure = ensureDouble(w) as never;
        const first = await launch(w);
        expect(first.ok).toBe(true);
        w.sessions[0]!.status = "cancelled";
        const restarted = await launch(w);
        expect(restarted.ok).toBe(true);
        if (!restarted.ok) return;
        expect(restarted.value.outcome).toBe("created");
        expect(w.sessions).toHaveLength(2);
        expect(w.sessions.filter((s) => s.status === CURRENT_ENROLLMENT_SESSION_STATUS)).toHaveLength(1);
    });
});

describe("launch — concurrency", () => {
    it("a losing race resumes the winner's session rather than erroring", async () => {
        const w = world();
        // The winner commits between this caller's resolve and its own insert.
        let armed = true;
        currentEnsure = ensureDouble(w, {
            concurrentWinnerFirst: () => {
                if (!armed) return;
                armed = false;
                w.sessions.push({
                    id: "sess-winner",
                    org_id: ORG,
                    packet_definition_id: PACKET_DEF,
                    started_via_public_link_id: LINK,
                    status: CURRENT_ENROLLMENT_SESSION_STATUS,
                    process_instance_id: PI,
                });
            },
        }) as never;

        const r = await launch(w);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.outcome).toBe("resumed");
        expect(r.value.session.id).toBe("sess-winner");
        expect(w.sessions.filter((s) => s.status === CURRENT_ENROLLMENT_SESSION_STATUS)).toHaveLength(1);
    });

    it("both concurrent callers converge on one session", async () => {
        const w = world();
        currentEnsure = ensureDouble(w) as never;
        const [a, b] = await Promise.all([launch(w), launch(w)]);
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(a.value.session.id).toBe(b.value.session.id);
        expect(w.sessions.filter((s) => s.status === CURRENT_ENROLLMENT_SESSION_STATUS)).toHaveLength(1);
    });
});

describe("launch — refusals", () => {
    it("refuses a process instance from another org", async () => {
        const w = world({
            processInstances: [{ id: PI, org_id: OTHER_ORG, process_key: "enrollment", subject_type: "child" }],
        });
        currentEnsure = ensureDouble(w) as never;
        const r = await launch(w);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal.code).toBe("wrong_org");
        expect(w.creates).toBe(0);
    });

    it("refuses a non-Enrollment process", async () => {
        const w = world({
            processInstances: [{ id: PI, org_id: ORG, process_key: "tour", subject_type: "child" }],
        });
        currentEnsure = ensureDouble(w) as never;
        const r = await launch(w);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal.code).toBe("not_enrollment_process");
    });

    it("refuses the wrong subject grain", async () => {
        const w = world({
            processInstances: [{ id: PI, org_id: ORG, process_key: "enrollment", subject_type: "family" }],
        });
        currentEnsure = ensureDouble(w) as never;
        const r = await launch(w);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal.code).toBe("not_enrollment_process");
    });

    it("refuses an unknown process instance", async () => {
        const w = world({ processInstances: [] });
        currentEnsure = ensureDouble(w) as never;
        const r = await launch(w);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal.code).toBe("process_instance_not_found");
    });
});

describe("resolver — one owner of 'current'", () => {
    it("returns null when only terminal sessions exist", async () => {
        const w = world({
            sessions: [
                {
                    id: "s1",
                    org_id: ORG,
                    packet_definition_id: PACKET_DEF,
                    started_via_public_link_id: LINK,
                    status: "completed",
                    process_instance_id: PI,
                },
            ],
        });
        const r = await resolveCurrentEnrollmentSession(client(w), { orgId: ORG, processInstanceId: PI });
        expect(r.session).toBeNull();
    });

    it("never creates — a read leaves the world unchanged", async () => {
        const w = world();
        await resolveCurrentEnrollmentSession(client(w), { orgId: ORG, processInstanceId: PI });
        expect(w.sessions).toHaveLength(0);
        expect(w.creates).toBe(0);
    });

    it("pins the terminal vocabulary to one constant", () => {
        expect(CURRENT_ENROLLMENT_SESSION_STATUS).toBe("in_progress");
    });
});
