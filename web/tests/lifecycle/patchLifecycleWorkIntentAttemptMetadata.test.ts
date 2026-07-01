import { beforeEach, describe, expect, it, vi } from "vitest";
import { patchLifecycleWorkIntentAttemptMetadata } from "@/lib/lifecycle/patchLifecycleWorkIntentAttemptMetadata";
import { OPERATIONAL_WORK_FRAMEWORK_VERSION } from "@/lib/admin/operationalWork/operationalWorkTypes";

const orgId = "11111111-1111-4111-8111-111111111111";
const workId = "44444444-4444-4444-8444-444444444444";

const mockGetOperationalTaskById = vi.fn();

vi.mock("@/lib/admin/operationalTasksService", () => ({
    getOperationalTaskById: (...args: unknown[]) => mockGetOperationalTaskById(...args),
}));

function makeSupabaseForPatch() {
    const maybeSingle = vi.fn(async () => ({ data: { id: workId }, error: null }));
    const select = vi.fn(() => ({ maybeSingle }));
    const eq3 = vi.fn(() => ({ select }));
    const eq2 = vi.fn(() => ({ eq: eq3 }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const update = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ update }));
    return { from, update, eq1, maybeSingle };
}

describe("patchLifecycleWorkIntentAttemptMetadata", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetOperationalTaskById.mockResolvedValue({
            ok: true,
            row: {
                id: workId,
                org_id: orgId,
                status: "open",
                metadata: {
                    work_framework_version: OPERATIONAL_WORK_FRAMEWORK_VERSION,
                    attempt_count: 1,
                },
            },
        });
    });

    it("increments attempt_count and records last outcome fields", async () => {
        const supabaseMock = makeSupabaseForPatch();
        const now = new Date("2026-06-10T15:00:00.000Z");
        const result = await patchLifecycleWorkIntentAttemptMetadata({
            supabase: { from: supabaseMock.from } as never,
            orgId,
            workId,
            outcomeKey: "left_voicemail",
            outcomeLabel: "Left voicemail",
            now,
        });

        expect(result).toEqual({ ok: true, attempt_count: 2 });
        expect(supabaseMock.update).toHaveBeenCalledWith({
            metadata: expect.objectContaining({
                attempt_count: 2,
                last_outcome_key: "left_voicemail",
                last_outcome_label: "Left voicemail",
                last_outcome_at: "2026-06-10T15:00:00.000Z",
            }),
        });
    });

    it("rejects when work is not open", async () => {
        mockGetOperationalTaskById.mockResolvedValue({
            ok: true,
            row: { id: workId, org_id: orgId, status: "completed", metadata: {} },
        });

        const result = await patchLifecycleWorkIntentAttemptMetadata({
            supabase: { from: vi.fn() } as never,
            orgId,
            workId,
            outcomeKey: "no_answer",
            outcomeLabel: "No answer",
        });

        expect(result).toEqual({ ok: false, error: "Only open work can record retry attempts" });
    });
});
