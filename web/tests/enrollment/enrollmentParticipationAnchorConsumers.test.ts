/**
 * The Enrollment Participation anchor, and the consumers that must not be "fixed" by feeding them
 * an OCM id.
 *
 * Converging `process_instances.context_type` from `opportunity` to `enrollment_participation`
 * created one hazard that no type can catch: both columns hold a bare uuid, so a consumer that
 * reads `context_id` as an Opportunity keeps compiling, keeps running, and silently matches
 * nothing — or worse, writes an OCM id into an `opportunity_id` column, where it looks like a
 * perfectly ordinary foreign key until someone follows it.
 *
 * These are the four opportunity-specific consumers and the properties that keep them honest.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stampEnrollmentDateOnProcessInstances } from "@/lib/enrollment/stampEnrollmentDateOnProcessInstances";
import {
    ENROLLMENT_CONTEXT_TYPE,
    ENROLLMENT_PARTICIPATION_CONTEXT_TYPE,
} from "@/lib/process/processInstances";

const read = (rel: string) => readFileSync(resolve(__dirname, "../../", rel), "utf8");

const ORG = "11111111-1111-4111-8111-111111111111";
const OPPORTUNITY = "22222222-2222-4222-8222-222222222222";
const OCM = "33333333-3333-4333-8333-333333333333";
const CHILD = "44444444-4444-4444-8444-444444444444";

type PiRow = Record<string, unknown> & { id: string; metadata: Record<string, unknown> };

function client(rows: PiRow[], participations: { id: string; opportunity_id: string }[]) {
    return {
        from(table: string) {
            const eqs: Record<string, unknown> = {};
            const ins: Record<string, unknown[]> = {};
            let patch: Record<string, unknown> | null = null;
            const b: Record<string, unknown> = {
                select: () => b,
                update: (p: Record<string, unknown>) => {
                    patch = p;
                    return b;
                },
                eq: (c: string, v: unknown) => {
                    eqs[c] = v;
                    return b;
                },
                in: (c: string, v: unknown[]) => {
                    ins[c] = v;
                    return b;
                },
                then: (resolve: (r: { data: unknown; error: null }) => void) => {
                    if (table === "opportunity_customer_members") {
                        return resolve({
                            data: participations.filter((r) => r.opportunity_id === eqs.opportunity_id),
                            error: null,
                        });
                    }
                    const matched = rows.filter(
                        (r) =>
                            Object.entries(eqs).every(([k, v]) => r[k] === v) &&
                            Object.entries(ins).every(([k, vals]) => vals.includes(r[k])),
                    );
                    if (patch) {
                        for (const r of matched) Object.assign(r, patch);
                        return resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
                    }
                    return resolve({ data: matched, error: null });
                },
            };
            return b;
        },
    } as never;
}

const pi = (id: string, contextType: string, contextId: string): PiRow => ({
    id,
    org_id: ORG,
    process_key: "enrollment",
    subject_type: "child",
    subject_id: CHILD,
    context_type: contextType,
    context_id: contextId,
    metadata: {},
});

describe("the two anchors are distinct types, not two spellings", () => {
    it("an OCM id can never be mistaken for an Opportunity by type", () => {
        // The whole convergence rests on this: `context_type` is what discriminates, because the
        // ids themselves are indistinguishable.
        expect(ENROLLMENT_PARTICIPATION_CONTEXT_TYPE).toBe("enrollment_participation");
        expect(ENROLLMENT_CONTEXT_TYPE).toBe("opportunity");
        expect(ENROLLMENT_PARTICIPATION_CONTEXT_TYPE).not.toBe(ENROLLMENT_CONTEXT_TYPE);
    });
});

describe("enrollment-date stamping reaches journeys under EITHER anchor", () => {
    it("stamps a participation-anchored journey — the silent-zero-rows defect", async () => {
        /*
         * Before the fix this returned `{ stamped: [] }` and no error. Stamping reports what it
         * stamped, so an empty list reads as "this Opportunity has no journeys" — indistinguishable
         * from a healthy no-op. An acquisition outcome would have recorded an enrollment date onto
         * nobody, and nothing would have said so.
         */
        // `enrollment_outcome` was never a member of EnrollmentDateStamp["source"].
        // The canonical outcome-driven stamp is `paperwork_completion_outcome`,
        // which is what stageOutcomeRuleTargetExecutor passes in production.
        const rows = [pi("pi-participation", ENROLLMENT_PARTICIPATION_CONTEXT_TYPE, OCM)];
        const result = await stampEnrollmentDateOnProcessInstances(
            client(rows, [{ id: OCM, opportunity_id: OPPORTUNITY }]),
            { orgId: ORG, opportunityId: OPPORTUNITY, enrollmentDate: "2026-09-01", source: "paperwork_completion_outcome" },
        );
        expect(result.error).toBeUndefined();
        expect(result.stamped.map((r) => r.processInstanceId)).toEqual(["pi-participation"]);
    });

    it("still stamps a journey written under the older Opportunity anchor", async () => {
        // No backfill dependency: both shapes are stamped by the same call.
        const rows = [pi("pi-legacy", ENROLLMENT_CONTEXT_TYPE, OPPORTUNITY)];
        const result = await stampEnrollmentDateOnProcessInstances(client(rows, []), {
            orgId: ORG,
            opportunityId: OPPORTUNITY,
            enrollmentDate: "2026-09-01",
            source: "paperwork_completion_outcome",
        });
        expect(result.stamped.map((r) => r.processInstanceId)).toEqual(["pi-legacy"]);
    });

    it("does not stamp a journey belonging to a DIFFERENT Opportunity", async () => {
        // The widening must not become "stamp every enrollment journey for this child".
        const rows = [pi("pi-other", ENROLLMENT_PARTICIPATION_CONTEXT_TYPE, "99999999-9999-4999-8999-999999999999")];
        const result = await stampEnrollmentDateOnProcessInstances(
            client(rows, [{ id: OCM, opportunity_id: OPPORTUNITY }]),
            { orgId: ORG, opportunityId: OPPORTUNITY, enrollmentDate: "2026-09-01", source: "paperwork_completion_outcome" },
        );
        expect(result.stamped).toEqual([]);
    });
});

describe("no consumer reads context_id as an Opportunity", () => {
    it("the materializer takes its Opportunity from the canonical graph", () => {
        const src = read("lib/childcareOperational/materializeEnrollmentFromProcessInstance.ts");
        /*
         * This is the consumer that would have written an OCM id into `opportunity_id`. Nothing
         * downstream would have rejected it — the column is a plain uuid — so the corruption would
         * only have surfaced when someone tried to follow the reference.
         */
        expect(src).toContain("resolveEnrollmentJourneyContext");
        expect(src, "an Opportunity is never derived from the context id").not.toMatch(
            /opportunity_?[Ii]d\s*[:=]\s*trimOrNull\(pi\.context_id\)/,
        );
    });

    it("stamping no longer filters on the Opportunity context type", () => {
        const src = read("lib/enrollment/stampEnrollmentDateOnProcessInstances.ts");
        expect(src).not.toContain('eq("context_type", ENROLLMENT_CONTEXT_TYPE)');
    });
});
