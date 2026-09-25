import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createChildEnrollmentAgreement } from "@/lib/childcareOperational/enrollmentAgreementService";
import { buildOperationalEnrollmentReadModelForAgreement } from "@/lib/childcareOperational/operationalEnrollmentReadModel";
import {
    createOperationalEnrollmentMockSupabase,
    MEMBER_ID,
    ORG_ID,
    PATTERN_ID,
    PROGRAM_ID,
    seedOperationalEnrollmentFixtures,
    SITE_ID,
    UNIT_ID,
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
 * Record, for every `.from(table)`, HOW MANY reads had already resolved when it was issued.
 *
 * That number is the stage the read belongs to. Two reads issued in the same synchronous burst see
 * the same count; a read that had to wait for another to resolve sees a strictly larger one. It is
 * the same tick-based discriminator as `countConcurrentIssue` above, kept per table so a specific
 * pair can be compared rather than only the width of the first stage.
 */
function recordIssueGenerations(client: SupabaseClient): { generationOf: (table: string) => number | null } {
    let resolved = 0;
    const gen = new Map<string, number>();
    const orig = client.from.bind(client);
    (client as unknown as { from: (t: string) => unknown }).from = (table: string) => {
        if (!gen.has(table)) gen.set(table, resolved);
        const chain = orig(table) as unknown as Record<string, unknown>;
        // Every way this mock can settle — see the note on `countConcurrentIssue`; wrapping only
        // `then` produced a plant that could not fail.
        for (const terminal of ["then", "maybeSingle", "single"]) {
            const fn = chain[terminal];
            if (typeof fn !== "function") continue;
            const bound = (fn as (...a: unknown[]) => unknown).bind(chain);
            chain[terminal] = (...args: unknown[]) => {
                const out = bound(...args);
                if (out && typeof (out as { then?: unknown }).then === "function") {
                    return (out as Promise<unknown>).then((v) => {
                        resolved += 1;
                        return v;
                    });
                }
                resolved += 1;
                return out;
            };
        }
        return chain;
    };
    return { generationOf: (table: string) => gen.get(table) ?? null };
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

/**
 * OX J5 — THE LAST FALSE EDGE IN THE READ MODEL.
 *
 * With the stage-1 burst in place the chain is still three stages deep: the agreement burst, then
 * `loadSchedulePattern`, then `buildLabels`. The third waited on the second because `buildLabels`
 * took `schedulePattern` as an argument — but its three round trips never read it. Only the
 * schedule LABEL does, and that is a pure format of a row already in hand.
 *
 * Measured n=24 on deployed staging: `children_overlay_durable_facts_ms` P50 360ms owned the overlay
 * wall in 9 of 12 sampled switches, with `overlay_children_in` P50 = 1. One child, four dependent
 * stages, at the ~90-120ms round trip this deployment measures on every other leaf. Depth, not
 * fan-out — so the repair is one fewer stage, and this is what holds it.
 *
 * Both fixtures below must exist for the edge to be reachable at all: with no placement there is
 * nothing to look a program label up for, and with no schedule assignment `loadSchedulePattern` is
 * never called. The default seed has neither, which is why this needs its own.
 */
describe("operational enrollment read model — schedule pattern does not gate the labels", () => {
    async function seedFullyPlacedAgreement() {
        const store = seedOperationalEnrollmentFixtures();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: TODAY,
            todayYmd: TODAY,
        });
        store.child_placements.push({
            id: "plc-ox-1",
            org_id: ORG_ID,
            enrollment_agreement_id: agreement.id,
            program_category_id: PROGRAM_ID,
            room_location_id: UNIT_ID,
            start_date: TODAY,
            end_date: null,
            status: "active",
            metadata: {},
        });
        store.schedule_assignments.push({
            id: "sa-ox-1",
            org_id: ORG_ID,
            subject_type: "child",
            enrollment_agreement_id: agreement.id,
            schedule_pattern_id: PATTERN_ID,
            is_primary: true,
            status: "active",
            metadata: {},
        });
        return { supabase, agreementId: agreement.id };
    }

    it("issues the schedule-pattern read and the label reads in the SAME stage", async () => {
        const { supabase, agreementId } = await seedFullyPlacedAgreement();
        const probe = recordIssueGenerations(supabase);
        await buildOperationalEnrollmentReadModelForAgreement(supabase, ORG_ID, agreementId);

        const patternGen = probe.generationOf("schedule_patterns");
        const programGen = probe.generationOf("location_program_categories");
        // Reachability first: an assertion over reads that never happened is not a passing plant.
        expect(patternGen, "schedule_patterns must actually be read by this fixture").not.toBeNull();
        expect(programGen, "location_program_categories must actually be read by this fixture").not.toBeNull();
        /*
         * Serial form: the labels are issued only after the pattern has resolved, so their
         * generation is strictly larger and this fails — which is the plant.
         */
        expect(
            programGen,
            "the program label read must not wait for the schedule pattern it never reads",
        ).toBe(patternGen);
    });

    it("still returns the same labels — the schedule label is unchanged", async () => {
        const { supabase, agreementId } = await seedFullyPlacedAgreement();
        const model = await buildOperationalEnrollmentReadModelForAgreement(supabase, ORG_ID, agreementId);
        expect(model.labels.site).toBe("Main Campus");
        expect(model.labels.program).toBe("Infant");
        expect(model.labels.room).toBe("Infant A");
        // Formatted from the pattern row, which the reordering never touched.
        expect(model.labels.schedule).toBe("Full Time (Mon, Tue, Wed, Thu, Fri)");
        expect(model.schedulePattern?.id).toBe(PATTERN_ID);
    });
});
