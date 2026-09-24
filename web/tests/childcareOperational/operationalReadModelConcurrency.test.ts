import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createChildEnrollmentAgreement } from "@/lib/childcareOperational/enrollmentAgreementService";
import { buildOperationalEnrollmentReadModelForAgreement } from "@/lib/childcareOperational/operationalEnrollmentReadModel";
import {
    createOperationalEnrollmentMockSupabase,
    MEMBER_ID,
    ORG_ID,
    seedOperationalEnrollmentFixtures,
    SITE_ID,
} from "./mockOperationalEnrollmentSupabase";

const TODAY = "2026-06-15";

/**
 * Count `.from()` calls issued BEFORE the first query resolves.
 *
 * This is the discriminator, and it is deliberately tick-based rather than wall-clock: a mock
 * resolves on microtasks, so serial and parallel chains differ by a TICK and not by milliseconds,
 * and a timing threshold here would be both flaky and disconnected from the thing being asserted.
 *
 * Concurrent issue: every `.from()` of a stage happens in one synchronous burst, so the count is the
 * width of that stage. Serial issue: the next `.from()` cannot happen until the previous await has
 * resolved, so the count is 1.
 */
function countConcurrentIssue(client: SupabaseClient): { width: () => number } {
    let resolvedAny = false;
    let before = 0;
    const orig = client.from.bind(client);
    (client as unknown as { from: (t: string) => unknown }).from = (table: string) => {
        if (!resolvedAny) before += 1;
        const chain = orig(table) as unknown as Record<string, unknown>;
        /*
         * EVERY terminal, not just `then`.
         *
         * A first version wrapped only `then` and passed with the serial chain restored — a false
         * green. This mock's reads resolve through `maybeSingle()` and `single()`, which are plain
         * async methods, so the `then` wrapper never ran, `resolvedAny` stayed false, and the count
         * was simply every `.from()` in the function. A plant that cannot fail proves nothing, so
         * each way the chain can actually settle is wrapped.
         */
        for (const terminal of ["then", "maybeSingle", "single"]) {
            const fn = chain[terminal];
            if (typeof fn !== "function") continue;
            const bound = (fn as (...a: unknown[]) => unknown).bind(chain);
            chain[terminal] = (...args: unknown[]) => {
                const out = bound(...args);
                if (out && typeof (out as { then?: unknown }).then === "function") {
                    return (out as Promise<unknown>).then((v) => {
                        resolvedAny = true;
                        return v;
                    });
                }
                resolvedAny = true;
                return out;
            };
        }
        return chain;
    };
    return { width: () => before };
}

/**
 * OX J5 — THE READ MODEL'S SERIAL CHAIN.
 *
 * Measured on deployed c619afee/d88755c8, n=11 warm J5 samples: `durableFacts` was the longest of the
 * three overlay legs in 11/11 at P50 556ms, against placementLabeled 0ms and processInstances 106ms,
 * and it explained the overlay wall exactly (residual P50 0ms). The children input was ONE, so the
 * cost is not the per-child fan-out — it is one agreement's read model, built as seven serial round
 * trips where only three stages are genuinely dependent.
 *
 * `getOperationalPlacementForAgreement` and `getOperationalScheduleAssignmentForAgreement` are keyed
 * by `agreementId` alone and read nothing the agreement query returns. This asserts they are issued
 * WITH it rather than after it.
 */
describe("operational enrollment read model concurrency", () => {
    it("issues the agreement, placement and schedule-assignment reads TOGETHER", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const agreement = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: TODAY,
            todayYmd: TODAY,
        });
        const probe = countConcurrentIssue(supabase);
        await buildOperationalEnrollmentReadModelForAgreement(supabase, ORG_ID, agreement.id);
        /*
         * Three is the width of the first stage. The serial form issues one read, waits for it, and
         * only then issues the next — so it scores 1 and this fails, which is the plant.
         */
        expect(
            probe.width(),
            "agreement, placement and schedule-assignment must be issued in one burst, not in sequence",
        ).toBeGreaterThanOrEqual(3);
    });

    it("still returns the same model — concurrency changed the schedule, not the answer", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const agreement = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: TODAY,
            todayYmd: TODAY,
        });
        const model = await buildOperationalEnrollmentReadModelForAgreement(supabase, ORG_ID, agreement.id);
        expect(model.agreement?.id).toBe(agreement.id);
        expect(model.labels.site).toBe("Main Campus");
        // The warnings are derived from the same four inputs and must be unchanged by scheduling.
        expect(model.warnings).toContain("missing_placement");
        expect(model.warnings).toContain("missing_schedule_assignment");
    });

    it("a missing agreement still yields the empty model", async () => {
        // The early return moved BELOW the parallel issue, so this pins that its answer did not move.
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const model = await buildOperationalEnrollmentReadModelForAgreement(
            supabase,
            ORG_ID,
            "00000000-0000-0000-0000-000000000000",
        );
        expect(model.agreement).toBeNull();
        expect(model.placement).toBeNull();
        expect(model.scheduleAssignment).toBeNull();
        expect(model.schedulePattern).toBeNull();
        expect(model.labels).toEqual({ site: null, program: null, room: null, schedule: null });
        expect(model.warnings).toEqual([]);
    });
});
