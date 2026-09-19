/**
 * ONCE A FRAME PROMISES PRODUCERS, EVERY PRODUCER STATE IS EXPLICIT.
 *
 * A missing producer result must never silently mean "loading forever". That exact ambiguity is what
 * left the Attendance card spinning: the card could not distinguish "the root has not produced this
 * yet" from "the root produced nothing for this subject", so it either asserted an absence it had not
 * been told about or waited for an answer that had already arrived.
 *
 * The cards now resolve it the same way — a `cards` envelope that is absent means PROVISIONING, and a
 * producer entry inside it is an explicit verdict. That only holds if the envelope is complete: one
 * producer silently omitted from the results would read, to its card, exactly like a frame that had
 * not produced yet. Forever.
 *
 * So this certifies the ENVELOPE rather than any one card: if `cards` is present, every registered
 * producer must be present in it, with a state from the canonical vocabulary, and a state whose
 * payload agrees with what that state means.
 */

import { resolveFinancialSubjectIdFromTruth } from "@/lib/adminV2/runtime/focusPanel/financialSubjectIdentity";
import { describe, expect, it } from "vitest";

import { projectFocusPanelCardProducers } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardProducers";
import type { FocusPanelCardProducerResults, ProducerState } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjectionContract";

/**
 * THE REGISTERED PRODUCERS.
 *
 * Adding a producer without adding it here is itself the defect this guards: the new card would ship
 * with a state its own frame never reports. `FocusPanelCardProducerResults` is the contract, and
 * TypeScript enforces the other direction — a key here that the contract does not have will not
 * compile.
 */
const REGISTERED_PRODUCERS: (keyof FocusPanelCardProducerResults)[] = ["attendance", "health", "financials"];

const CANONICAL_STATES: ProducerState[] = ["ready", "unavailable", "error", "forbidden"];

/** A client that answers every read with an empty set. */
function emptySupabase() {
    const b: Record<string, unknown> = {};
    Object.assign(b, {
        select: () => b,
        eq: () => b,
        in: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (res: (v: unknown) => void) => res({ data: [], error: null }),
    });
    return { from: () => b, rpc: async () => ({ data: [], error: null }) };
}

const access = (keys: string[]) =>
    ({ ok: true, userId: "u1", orgId: "org-1", roleKeys: [], permissionKeys: keys, departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null }) as never;

/** Every shape of subject a real panel presents. */
const SUBJECTS: { name: string; context: unknown }[] = [
    {
        name: "a scoped child in a household",
        context: { truth: { "customer.id": "cust-1" }, participantScope: { customerMemberId: "cm-1", displayName: "Child A" } },
    },
    { name: "a household with no scoped child", context: { truth: { "customer.id": "cust-1" }, participantScope: null } },
    { name: "a subject with no household at all", context: { truth: {}, participantScope: { customerMemberId: "cm-1", displayName: "Child A" } } },
    { name: "nothing resolved", context: { truth: {}, participantScope: null } },
];

describe("the root's producer envelope is complete and explicit", () => {
    for (const subject of SUBJECTS) {
        for (const grants of [[], ["health.view", "fin.read"]]) {
            it(`${subject.name}${grants.length ? " (granted)" : " (no grants)"} reports every producer`, async () => {
                const results = await projectFocusPanelCardProducers({
                    supabase: emptySupabase() as never,
                    orgId: "org-1",
                    context: subject.context as never,
                    financialSubjectId: resolveFinancialSubjectIdFromTruth(((subject.context as never) as { truth?: Record<string, unknown> }).truth ?? {}),
                    access: access(grants),
                });

                for (const key of REGISTERED_PRODUCERS) {
                    const entry = results[key];
                    expect(entry, `producer "${key}" is missing — its card would provision forever`).toBeDefined();
                    expect(CANONICAL_STATES, `producer "${key}" reported a state outside the vocabulary`).toContain(
                        entry.state,
                    );
                    // `data` is a promise about the state, not decoration: anything but `ready` must
                    // carry nothing, or a card can render data it was told it may not or does not have.
                    if (entry.state !== "ready") {
                        expect(entry.data, `producer "${key}" reported ${entry.state} while carrying data`).toBeNull();
                    }
                }
            });
        }
    }

    it("reports EVERY registered producer even when one of them fails", async () => {
        // The failure must be bounded to its own key, not by omitting the key.
        const failing = {
            from: () => {
                const b: Record<string, unknown> = {};
                Object.assign(b, {
                    select: () => b,
                    eq: () => b,
                    in: () => b,
                    order: () => b,
                    limit: () => b,
                    maybeSingle: async () => {
                        throw new Error("down");
                    },
                    single: async () => {
                        throw new Error("down");
                    },
                    then: (_r: unknown, rej: (e: unknown) => void) => rej(new Error("down")),
                });
                return b;
            },
            rpc: async () => {
                throw new Error("down");
            },
        };
        const results = await projectFocusPanelCardProducers({
            supabase: failing as never,
            orgId: "org-1",
            context: { truth: { "customer.id": "cust-1" }, participantScope: { customerMemberId: "cm-1" } } as never,
            financialSubjectId: resolveFinancialSubjectIdFromTruth((({ truth: { "customer.id": "cust-1" }, participantScope: { customerMemberId: "cm-1" } } as never) as { truth?: Record<string, unknown> }).truth ?? {}),
            access: access(["health.view", "fin.read"]),
        });
        for (const key of REGISTERED_PRODUCERS) {
            expect(results[key], `producer "${key}" vanished when a sibling failed`).toBeDefined();
            expect(CANONICAL_STATES).toContain(results[key].state);
        }
    });

    it("never throws, so one producer can never cost the operator the panel", async () => {
        // Including on the orchestrator's own preamble, which runs before the settled region.
        await expect(
            projectFocusPanelCardProducers({
                supabase: emptySupabase() as never,
                orgId: "org-1",
                // A context missing `truth` violates the type, and must still not reject the call.
                context: {} as never,
                financialSubjectId: resolveFinancialSubjectIdFromTruth((({} as never) as { truth?: Record<string, unknown> }).truth ?? {}),
                access: access([]),
            }),
        ).resolves.toBeDefined();
    });
});
