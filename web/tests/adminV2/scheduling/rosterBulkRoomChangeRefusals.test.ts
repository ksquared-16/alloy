/**
 * Roster bulk commands: every row's answer is read, and the run is reported as what it was —
 * all applied, partially completed, or nothing applied — with each refused/failed row named.
 * Rows commit one by one; nothing here claims atomicity. (V7 S3 / audit A7.)
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { describeBulkOutcome } from "@/components/adminV2/scheduling/screens/AssignmentRosterPanel";
import { buildAssignmentRosterBulkHandlers } from "@/lib/adminV2/scheduling/assignmentRosterBulkHandlers";

afterEach(() => vi.unstubAllGlobals());

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const refuse = (message: string, status = 422) =>
    new Response(JSON.stringify({ ok: false, error: { code: "VALIDATION_ERROR", message } }), { status });

const handlersWith = (answers: Array<Response | Error>, subjects: unknown[] = []) => {
    const fetchMock = vi.fn(async () => {
        const next = answers.shift()!;
        if (next instanceof Error) throw next;
        return next;
    });
    vi.stubGlobal("fetch", fetchMock);
    const onRefresh = vi.fn();
    const handlers = buildAssignmentRosterBulkHandlers({
        subjects,
        assignmentTypes: [],
        siteId: "site-1",
        onRefresh,
        onCreateForChild: () => {},
    } as never);
    return { handlers, fetchMock, onRefresh };
};

describe("roster bulk outcomes", () => {
    it("room change: applies what the server accepts and reports what it refuses, by subject", async () => {
        const { handlers, fetchMock, onRefresh } = handlersWith([ok(), refuse("room does not resolve to site")]);
        const outcome = await handlers.onBulkRoomChange!([
            { customerMemberId: "m-1", subjectName: "Ava", payload: { supersedes_assignment_id: "a-1" } },
            { customerMemberId: "m-2", subjectName: "Ben", payload: { supersedes_assignment_id: "a-2" } },
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(outcome).toEqual({ succeeded: 1, refused: ["Ben: room does not resolve to site"], failed: [] });
        expect(onRefresh).toHaveBeenCalledOnce();
        expect(describeBulkOutcome(outcome).headline).toBe("Partially completed: 1 applied, 1 refused.");
    });

    it("archive: a refusal, a server failure and a lost request are each reported — never 'archived'", async () => {
        const subjects = [
            { subjectName: "Ava", assignments: [{ assignmentId: "a-1" }] },
            { subjectName: "Ben", assignments: [{ assignmentId: "a-2" }] },
            { subjectName: "Cy", assignments: [{ assignmentId: "a-3" }] },
            { subjectName: "Di", assignments: [{ assignmentId: "a-4" }] },
        ];
        const { handlers } = handlersWith(
            [ok(), refuse("primary cannot be archived", 409), refuse("boom", 500), new Error("network down")],
            subjects,
        );
        const outcome = await handlers.onBulkArchive!(["a-1", "a-2", "a-3", "a-4"]);
        expect(outcome.succeeded).toBe(1);
        expect(outcome.refused).toEqual([expect.stringMatching(/primary cannot be archived/)]);
        expect(outcome.failed).toHaveLength(2);
        expect(outcome.failed.join("|")).toMatch(/boom/);
        expect(outcome.failed.join("|")).toMatch(/network down/);
        const report = describeBulkOutcome(outcome);
        expect(report.headline).toBe("Partially completed: 1 applied, 1 refused, 2 failed.");
        expect(report.lines).toHaveLength(3);
    });

    it("all refused reads as nothing applied; all accepted reads as all applied", async () => {
        expect(describeBulkOutcome({ succeeded: 0, refused: ["Ava: x"], failed: [] }).headline).toBe("Nothing applied — 1 refused.");
        expect(describeBulkOutcome({ succeeded: 3, refused: [], failed: [] })).toEqual({ headline: "All 3 applied.", lines: [] });
        expect(describeBulkOutcome({ succeeded: 2, refused: [], failed: [] }, ["Cy: no room"]).headline).toBe(
            "Partially completed: 2 applied, 1 refused.",
        );
    });

    it("bulk Make Primary is gone (V7 P1)", () => {
        const { handlers } = handlersWith([]);
        expect("onBulkMakePrimary" in handlers).toBe(false);
    });
});
