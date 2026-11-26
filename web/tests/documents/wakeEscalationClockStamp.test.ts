/**
 * D9-H2 W-ES: the wake hands the D9.2 escalation THIS wake's database clock stamp (record_scheduled_work_wake's return,
 * surfaced as runScheduledWorkWake's clockRecordedAt) and nothing else — never the app clock, never a guess. When the
 * stamp could not be recorded (null), the escalation gets null and writes no later-wake confirmation (fail closed; the
 * escalation suite proves that half). Drives the exported handler with the runtime and the escalation mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runWake, escalate } = vi.hoisted(() => ({
    runWake: vi.fn(),
    escalate: vi.fn(),
}));

vi.mock("@/lib/scheduledWork/scheduledWorkRuntime", () => ({
    runScheduledWorkWake: (...args: unknown[]) => runWake(...args),
}));
vi.mock("@/lib/documents/external/unfiledApiUploadEscalation", () => ({
    escalateUnfiledApiUploads: (...args: unknown[]) => escalate(...args),
}));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({}) }));

import { POST } from "@/app/api/scheduled-work/wake/route";

const TOKEN = "internal-cron-token-value";
const SUMMARY = { scanned: 1, opened: 0, existing: 1, repaired: 0, held: 0, skipped: 0, failed: 0, resolved: 0, confirmed: 1, confirm_failed: 0, truncated: false, outcomes: [{ document_id: "d", outcome: "case_existing" }] };
const wakeResult = (clockRecordedAt: string | null) => ({
    workerId: "w", claimed: 0, completed: 0, retryScheduled: 0, terminallyFailed: 0, unregisteredHandler: 0, occurrences: [], clockRecordedAt,
});
const req = () => new Request("https://staging.example/api/scheduled-work/wake", { method: "POST", headers: { "x-cron-token": TOKEN } }) as unknown as Parameters<typeof POST>[0];

const ORIGINAL = { ...process.env };
beforeEach(() => {
    runWake.mockReset();
    escalate.mockReset();
    escalate.mockResolvedValue(SUMMARY);
    process.env.INTERNAL_CRON_TOKEN = TOKEN;
});
afterEach(() => {
    process.env = { ...ORIGINAL };
});

describe("wake → escalation clock stamp", () => {
    it("passes exactly this wake's recorded clock stamp, after the runtime recorded it", async () => {
        const stamp = "2026-11-09T19:50:00.970587+00:00";
        runWake.mockResolvedValue(wakeResult(stamp));
        const res = await POST(req());
        expect(res.status).toBe(200);
        expect(escalate).toHaveBeenCalledTimes(1);
        expect(escalate.mock.calls[0][0]).toMatchObject({ wakeClockAt: stamp });
        expect(runWake.mock.invocationCallOrder[0]).toBeLessThan(escalate.mock.invocationCallOrder[0]);
        const body = await res.json();
        expect(body.api_uploads_escalated).toMatchObject({ existing: 1, confirmed: 1, confirm_failed: 0 });
        expect(body.api_uploads_escalated).not.toHaveProperty("outcomes"); // per-document outcomes never leave the host
    });

    it("passes null when the clock stamp was not recorded, so no confirmation can be written", async () => {
        runWake.mockResolvedValue(wakeResult(null));
        await POST(req());
        expect(escalate.mock.calls[0][0]).toMatchObject({ wakeClockAt: null });
    });

    it("an escalation error is reported as null and the wake still answers", async () => {
        runWake.mockResolvedValue(wakeResult("2026-11-09T19:50:00+00:00"));
        escalate.mockRejectedValue(new Error("boom"));
        const res = await POST(req());
        expect(res.status).toBe(200);
        expect((await res.json()).api_uploads_escalated).toBeNull();
    });
});
