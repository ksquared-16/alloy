/**
 * COMPLETING THE PAPERWORK MUST NOT HIDE THE PAPERWORK.
 *
 * The defect this pins, in full:
 *
 *   resolveEnrollmentParticipantProgress asked resolveCurrentEnrollmentSession for the packet work,
 *   and that resolver correctly returns only `in_progress` sessions — a completed packet must never
 *   be handed back as editable. But requirement satisfaction was reading through the same call, so
 *   the moment a participant finished the packet it disappeared from realization, `realized` came
 *   back empty, and every form requirement projected UNREALIZED.
 *
 *   For this tenant's single-form packet that made satisfaction unobservable outright: submitting the
 *   only form is what completes the session, so the evidence was destroyed by the act that created
 *   it. In a multi-form packet only the LAST form would vanish, which would have read as flakiness.
 *
 * Two questions, two readers:
 *   current  — "which packet may this participant work in NOW?"   in_progress only
 *   evidence — "what has already been done for this execution?"    in_progress + completed
 */

import { describe, expect, it } from "vitest";

import {
    ENROLLMENT_EVIDENCE_SESSION_STATUSES,
    resolveEnrollmentEvidenceSessionItems,
} from "@/lib/pos/packet/enrollmentObjectiveSession";

/**
 * A fake client that records the predicate rather than simulating a database.
 *
 * The defect was never a wrong value coming back — it was the query asking for the wrong rows. So
 * the assertions are about the filters, which is where the bug actually lived.
 */
function fakeSupabase(rows: Record<string, unknown[]>) {
    const calls: Array<Record<string, unknown>> = [];
    const builder = (table: string) => {
        const state: Record<string, unknown> = { table };
        const chain: Record<string, unknown> = {
            select() { return chain; },
            eq(col: string, val: unknown) { state[`eq:${col}`] = val; return chain; },
            in(col: string, val: unknown) { state[`in:${col}`] = val; return chain; },
            order() { return chain; },
            then(resolve: (v: unknown) => unknown) {
                calls.push(state);
                return Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve);
            },
        };
        return chain;
    };
    return { client: { from: builder } as never, calls };
}

describe("the evidence read sees completed work", () => {
    it("includes in_progress AND completed", () => {
        expect([...ENROLLMENT_EVIDENCE_SESSION_STATUSES]).toEqual(["in_progress", "completed"]);
    });

    it("EXCLUDES cancelled — an abandoned attempt is history, not evidence", () => {
        /*
         * The tempting shortcut is "anything that is not current". That would let an abandoned packet
         * satisfy a requirement, which is worse than the bug being fixed.
         */
        expect([...ENROLLMENT_EVIDENCE_SESSION_STATUSES]).not.toContain("cancelled");
    });

    it("queries sessions by that status set, not by a negation", async () => {
        const { client, calls } = fakeSupabase({ form_packet_sessions: [{ id: "s1", status: "completed" }] });
        await resolveEnrollmentEvidenceSessionItems(client, { orgId: "org", processInstanceId: "pi" });
        const sessionQuery = calls.find((c) => c.table === "form_packet_sessions");
        expect(sessionQuery?.["in:status"]).toEqual(["in_progress", "completed"]);
        expect(sessionQuery?.["eq:status"]).toBeUndefined();
    });
});

describe("evidence stays scoped to ONE Enrollment execution", () => {
    it("is keyed by process_instance_id and org, so a previous episode cannot be seen", async () => {
        /*
         * This is the safety half of the fix. Widening from "current" to "history" is exactly how a
         * prior year's completed packet could start satisfying a new episode. An Enrollment episode
         * IS a Process Instance, so scoping by that key gives cross-episode, sibling and cross-tenant
         * isolation from one predicate rather than three filters someone could forget.
         */
        const { client, calls } = fakeSupabase({ form_packet_sessions: [{ id: "s1", status: "completed" }] });
        await resolveEnrollmentEvidenceSessionItems(client, { orgId: "org-a", processInstanceId: "episode-b" });
        const sessionQuery = calls.find((c) => c.table === "form_packet_sessions");
        expect(sessionQuery?.["eq:org_id"]).toBe("org-a");
        expect(sessionQuery?.["eq:process_instance_id"]).toBe("episode-b");
    });

    it("reads items only for the sessions it just scoped", async () => {
        const { client, calls } = fakeSupabase({
            form_packet_sessions: [{ id: "s1", status: "completed" }, { id: "s2", status: "in_progress" }],
        });
        await resolveEnrollmentEvidenceSessionItems(client, { orgId: "org", processInstanceId: "pi" });
        const itemQuery = calls.find((c) => c.table === "form_packet_session_items");
        expect(itemQuery?.["in:packet_session_id"]).toEqual(["s1", "s2"]);
    });

    it("returns nothing when the execution has no evidence sessions, rather than falling back", async () => {
        const { client } = fakeSupabase({ form_packet_sessions: [] });
        const result = await resolveEnrollmentEvidenceSessionItems(client, { orgId: "org", processInstanceId: "pi" });
        expect(result.items).toEqual([]);
        expect(result.sessionIds).toEqual([]);
        expect(result.error).toBeNull();
    });
});

describe("the two readers stay separate", () => {
    const source = () =>
        import("node:fs/promises").then((fs) =>
            fs.readFile(new URL("../../lib/pos/packet/enrollmentObjectiveSession.ts", import.meta.url), "utf8"),
        );

    it("the WORK resolver still returns in_progress only", async () => {
        /*
         * The fix must not be achieved by widening the work resolver. A completed packet handed back
         * as editable would let a parent reopen finished paperwork.
         */
        const src = await source();
        const work = src.slice(
            src.indexOf("export async function resolveCurrentEnrollmentSession"),
            src.indexOf("export const ENROLLMENT_EVIDENCE_SESSION_STATUSES"),
        );
        expect(work).toContain('.eq("status", CURRENT_ENROLLMENT_SESSION_STATUS)');
        expect(work).not.toContain("ENROLLMENT_EVIDENCE_SESSION_STATUSES");
    });

    it("progress builds requirement evidence from the evidence read, not the work read", async () => {
        const progress = await import("node:fs/promises").then((fs) =>
            fs.readFile(
                new URL("../../lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress.ts", import.meta.url),
                "utf8",
            ),
        );
        // The exact seam. Reverting this line to the work-session items reproduces the defect.
        expect(progress).toContain("loadRealizedFormItems(supabase, input.orgId, evidence.items as SessionItemRow[])");
        expect(progress).toContain("resolveEnrollmentEvidenceSessionItems");
    });
});
