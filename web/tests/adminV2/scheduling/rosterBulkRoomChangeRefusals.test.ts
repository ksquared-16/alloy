/**
 * Roster bulk room change: every row's answer is read. On staging (46b696149) the panel posted
 * category-less, pattern-less supersessions, the server refused every one (400 ACTION_BLOCKED), and
 * the operator was told nothing. Refusals now come back as one line per row.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAssignmentRosterBulkHandlers } from "@/lib/adminV2/scheduling/assignmentRosterBulkHandlers";

afterEach(() => vi.unstubAllGlobals());

describe("onBulkRoomChange", () => {
    it("applies what the server accepts and reports what it refuses, by subject", async () => {
        const answers = [
            new Response(JSON.stringify({ ok: true }), { status: 200 }),
            new Response(JSON.stringify({ ok: false, error: { code: "VALIDATION_ERROR", message: "room does not resolve to site" } }), { status: 422 }),
        ];
        const fetchMock = vi.fn(async () => answers.shift()!);
        vi.stubGlobal("fetch", fetchMock);
        const onRefresh = vi.fn();
        const handlers = buildAssignmentRosterBulkHandlers({
            subjects: [],
            assignmentTypes: [],
            siteId: "site-1",
            onRefresh,
            onCreateForChild: () => {},
        } as never);
        const refused = await handlers.onBulkRoomChange!([
            { customerMemberId: "m-1", subjectName: "Ava", payload: { supersedes_assignment_id: "a-1" } },
            { customerMemberId: "m-2", subjectName: "Ben", payload: { supersedes_assignment_id: "a-2" } },
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(refused).toEqual(["Ben: room does not resolve to site"]);
        expect(onRefresh).toHaveBeenCalledOnce();
    });
});
