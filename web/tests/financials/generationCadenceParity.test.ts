/**
 * THE OPERATOR MUST PREVIEW THE OPERATION CONFIRM WILL RUN.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────────────────────────
 *
 * `buildPreview` passed no cadence to `previewTuitionGeneration`, which defaults to monthly, while
 * `execute` honoured `payload.cadence`. Measured on the running app: previewing a WEEKLY run
 * reported the monthly answer — "1 to bill · $1,450.00" — and confirming it generated FIVE weekly
 * obligations. The operator confirmed one operation and got another.
 *
 * ── WHAT IS LOCKED, AND WHY IT IS THE ARGUMENTS ───────────────────────────────────────────────
 *
 * Not that a cadence is passed — that a preview and an execute driven by the SAME payload reach
 * their planners with the SAME cadence and the SAME period. The two are driven here against the
 * real registered action, with the planners captured, because the defect lived precisely in the gap
 * between the two entry points and a test of either one alone would have stayed green.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const previewCalls: Array<Record<string, unknown>> = [];
const executeCalls: Array<Record<string, unknown>> = [];

const EMPTY = {
    periodKey: "2026-09",
    servicePeriod: { start: "2026-09-01", end: "2026-09-30" },
    cadenceKey: "monthly",
    periodsBilled: [],
    counts: { generated: 0, unchanged: 0, notDue: 0, refused: 0, alreadyPosted: 0, errors: 0 },
    outcomes: [] as unknown[],
};

vi.mock("@/lib/financials/tuitionGeneration/previewTuitionGeneration", () => ({
    previewTuitionGeneration: async (_s: unknown, args: Record<string, unknown>) => {
        previewCalls.push(args);
        return { ...EMPTY, cadenceKey: String(args.cadenceKey ?? "monthly") };
    },
}));

vi.mock("@/lib/financials/tuitionGeneration/generateTuitionCharges", async (orig) => {
    const actual = (await orig()) as Record<string, unknown>;
    return {
        ...actual,
        generateTuitionCharges: async (_s: unknown, args: Record<string, unknown>) => {
            executeCalls.push(args);
            return { ...EMPTY, cadenceKey: String(args.cadenceKey ?? "monthly") };
        },
    };
});

vi.mock("@/lib/access/actorPermissionGrants", () => ({
    resolveActorPermissionGrants: async () => ({ permissionKeys: ["financials.generate_tuition", "fin.write"] }),
}));

import {
    BILLING_GENERATE_TUITION_ACTION_KEY,
    generationCadenceFrom,
    tuitionGenerationActions,
} from "@/lib/adminV2/actions/definitions/tuitionGenerationActions";

const action = tuitionGenerationActions.find((a) => a.actionKey === BILLING_GENERATE_TUITION_ACTION_KEY)!;
const ctx = { orgId: "org-1", userId: "u-1" };
const invocation = { entityType: "opportunity_customer_member", entityId: "", payload: {} } as never;

async function drive(payload: Record<string, unknown>) {
    previewCalls.length = 0;
    executeCalls.length = 0;
    await action.buildPreview!({ supabase: {} as never, ctx, payload, invocation } as never);
    await action.execute!({ supabase: {} as never, ctx, payload, invocation, correlationId: "c-1" } as never);
    return { preview: previewCalls[0], execute: executeCalls[0] };
}

describe("THE GATE — one payload, one plan", () => {
    beforeEach(() => { previewCalls.length = 0; executeCalls.length = 0; });

    it("reaches both planners with the same cadence and period, for weekly", async () => {
        const { preview, execute } = await drive({ period_key: "2026-09", cadence: "weekly" });
        expect(preview?.cadenceKey, "the preview plans weekly").toBe("weekly");
        expect(execute?.cadenceKey, "and so does the run").toBe("weekly");
        expect(preview?.periodKey).toBe(execute?.periodKey);
    });

    it("and for monthly", async () => {
        const { preview, execute } = await drive({ period_key: "2026-09", cadence: "monthly" });
        expect(preview?.cadenceKey).toBe("monthly");
        expect(execute?.cadenceKey).toBe("monthly");
    });

    /*
     * THE ORIGINAL SHAPE. An unstated cadence is the historical caller, and both sides must reach
     * the SAME conclusion about it — the defect was that only one side had a default.
     */
    it("agrees on the default when the operator states no cadence", async () => {
        const { preview, execute } = await drive({ period_key: "2026-09" });
        expect(preview?.cadenceKey).toBe(execute?.cadenceKey);
        expect(preview?.cadenceKey).toBe("monthly");
    });

    it("never lets the two disagree, whatever the payload says", async () => {
        for (const cadence of ["weekly", "biweekly", "monthly", "annual", "", "nonsense"]) {
            const { preview, execute } = await drive({ period_key: "2026-09", cadence });
            expect(preview?.cadenceKey, cadence).toBe(execute?.cadenceKey);
        }
    });

    /* Both entry points read the cadence through one function — there is no second opinion to hold. */
    it("resolves the cadence in exactly one place", () => {
        expect(generationCadenceFrom({ cadence: "weekly" })).toBe("weekly");
        expect(generationCadenceFrom({})).toBe("monthly");
        expect(generationCadenceFrom(undefined)).toBe("monthly");
    });
});

describe("THE GATE — the plan is echoed back for the operator to check", () => {
    it("states the cadence it planned in the preview detail", async () => {
        const preview = await action.buildPreview!({
            supabase: {} as never, ctx, payload: { period_key: "2026-09", cadence: "weekly" }, invocation,
        } as never);
        const after = (preview as { after?: Record<string, unknown> }).after ?? {};
        expect(after.cadence_key, "Confirm can be checked against what was previewed").toBe("weekly");
        expect((preview as { summary: string }).summary).toContain("weekly");
    });
});
