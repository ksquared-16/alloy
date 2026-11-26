/**
 * SITE ROOMS DO NOT WAIT FOR EVENTS OR EXPECTATIONS — asserted as behaviour, and with the failure
 * semantics that hoisting a call can quietly destroy.
 *
 * `siteRoomsFor` takes orgId and subject.siteLocationId; it never reads an event or an expectation.
 * It was serial only because it is written after them, and that cost 111ms of a 1,072ms fold on
 * deployed 20c3dd7e2.
 *
 * The scheduling assertion is the boundary a serial chain cannot cross: at the moment the first
 * read settles, the independent read must ALREADY be in flight. Re-introducing the await fails it
 * however it is written.
 */
import { describe, expect, it, vi } from "vitest";

const listEvents = vi.fn();
const fetchExpectations = vi.fn();
const resolveSubject = vi.fn();
const resolveRooms = vi.fn();

vi.mock("@/lib/childcareOperational/attendance/resolveAttendanceSubject", () => ({
    resolveAttendanceSubject: (...a: unknown[]) => resolveSubject(...a),
}));
vi.mock("@/lib/childcareOperational/attendance/attendanceService", async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    listAttendanceEvents: (...a: unknown[]) => listEvents(...a),
}));
vi.mock("@/lib/childcareOperational/expectations/fetchScheduleExpectations", () => ({
    fetchScheduleExpectations: (...a: unknown[]) => fetchExpectations(...a),
}));
vi.mock("@/lib/location/canonicalRoomProvider", async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    resolveRoomsForLocation: (...a: unknown[]) => resolveRooms(...a),
}));

const SUBJECT = {
    ok: true as const,
    subject: { enrollmentAgreementId: "ea-1", siteLocationId: "site-1", customerMemberId: "cm-1" },
};

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

/** Minimal client: `roomLabelsFor` calls supabase.from directly and is not mocked. */
function stubSupabase() {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "or", "order", "limit"]) b[m] = () => b;
    b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
    return { from: () => b } as never;
}

/**
 * Let the module import and the fold's synchronous region complete, with the deferred read still
 * pending. Microtask turns alone are not enough: build() performs a dynamic import first.
 */
const settleTurns = async () => {
    // 0ms is not enough: build() resolves a dynamic import before the fold even starts.
    await new Promise((r) => setTimeout(r, 20));
};

async function build(overrides: { supabase?: unknown } = {}) {
    const { buildAttendanceCardVM } = await import(
        "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM"
    );
    return buildAttendanceCardVM((overrides.supabase ?? stubSupabase()) as never, {
        orgId: "org-1",
        customerMemberId: "cm-1",
    });
}

describe("the attendance fold starts its independent reads together", () => {
    it("site rooms are IN FLIGHT before events and expectations settle", async () => {
        resolveSubject.mockResolvedValue(SUBJECT);
        let releaseEvents!: () => void;
        listEvents.mockImplementation(() => new Promise((r) => { releaseEvents = () => r([]); }));
        fetchExpectations.mockResolvedValue({ expectedAttendance: [] });
        resolveRooms.mockClear().mockResolvedValue([]);

        // Import BEFORE the timing window: a dynamic import inside it is indistinguishable from
        // the fold being slow to start, and that ambiguity made this case fail while the behaviour
        // it asserts was correct.
        const { buildAttendanceCardVM } = await import(
            "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM"
        );
        const p = buildAttendanceCardVM(stubSupabase(), { orgId: "org-1", customerMemberId: "cm-1" });
        await new Promise((r) => setTimeout(r, 20));

        expect(
            resolveRooms.mock.calls.length,
            "site rooms must be issued while the events read is still pending",
        ).toBe(1);
        expect(listEvents).toHaveBeenCalled();
        releaseEvents();
        await p;
    });

    it("subject still gates everything — nothing is issued before it resolves", async () => {
        const sub = deferred<typeof SUBJECT>();
        resolveSubject.mockImplementation(() => sub.promise);
        let anyStarted = false;
        listEvents.mockImplementation(() => { anyStarted = true; return Promise.resolve([]); });
        fetchExpectations.mockImplementation(() => { anyStarted = true; return Promise.resolve(null); });
        resolveRooms.mockImplementation(() => { anyStarted = true; return Promise.resolve([]); });

        const p = build();
        await settleTurns();
        expect(anyStarted, "no read may precede subject resolution").toBe(false);
        sub.resolve(SUBJECT);
        await p;
    });

    it("the fail-closed branch issues NO further reads", async () => {
        resolveSubject.mockResolvedValue({ ok: false, message: "This child has no active enrolment" });
        listEvents.mockClear(); fetchExpectations.mockClear(); resolveRooms.mockClear();
        const vm = await build();
        expect(vm.unavailableReason).toBe("This child has no active enrolment");
        expect(listEvents).not.toHaveBeenCalled();
        expect(fetchExpectations).not.toHaveBeenCalled();
        expect(resolveRooms).not.toHaveBeenCalled();
    });

    it("a FAILED site-rooms read still propagates — it must not become an empty room list", async () => {
        // The old code awaited siteRoomsFor with no catch, so a failure left the fold and became
        // UNAVAILABLE. Starting the read earlier must not silently turn that into `siteRooms: []`.
        resolveSubject.mockResolvedValue(SUBJECT);
        listEvents.mockResolvedValue([]);
        fetchExpectations.mockResolvedValue({ expectedAttendance: [] });
        resolveRooms.mockRejectedValue(new Error("rooms read failed"));
        await expect(build()).rejects.toThrow("rooms read failed");
    });

    it("a failed EVENTS read degrades to no events, exactly as before", async () => {
        resolveSubject.mockResolvedValue(SUBJECT);
        listEvents.mockRejectedValue(new Error("events read failed"));
        fetchExpectations.mockResolvedValue({ expectedAttendance: [] });
        resolveRooms.mockResolvedValue([]);
        const vm = await build();
        expect(vm.state).toBe("no_record");
        expect(vm.unavailableReason).toBeNull();
    });

    it("a failed EXPECTATIONS read leaves the day unexpected, not falsely expected", async () => {
        resolveSubject.mockResolvedValue(SUBJECT);
        listEvents.mockResolvedValue([]);
        fetchExpectations.mockRejectedValue(new Error("expectations read failed"));
        resolveRooms.mockResolvedValue([]);
        const vm = await build();
        expect(vm.expected.expected).toBe(false);
        expect(vm.state).toBe("no_record");
    });

    it("site rooms are read for the SUBJECT's site, never another", async () => {
        resolveSubject.mockResolvedValue(SUBJECT);
        listEvents.mockResolvedValue([]);
        fetchExpectations.mockResolvedValue({ expectedAttendance: [] });
        resolveRooms.mockClear().mockResolvedValue([]);
        await build();
        expect(resolveRooms).toHaveBeenCalledTimes(1);
        expect(resolveRooms.mock.calls[0][1]).toBe("org-1");
        expect(resolveRooms.mock.calls[0][2]).toBe("site-1");
    });

    it("a subject with no site issues no room read and yields no rooms", async () => {
        resolveSubject.mockResolvedValue({
            ok: true, subject: { enrollmentAgreementId: "ea-1", siteLocationId: null, customerMemberId: "cm-1" },
        });
        listEvents.mockResolvedValue([]);
        fetchExpectations.mockResolvedValue({ expectedAttendance: [] });
        resolveRooms.mockClear();
        const vm = await build();
        expect(resolveRooms).not.toHaveBeenCalled();
        expect(vm.siteRooms).toEqual([]);
    });
});
