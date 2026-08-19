/**
 * A repeat Start Enrollment must never surface as a failure.
 *
 * ## What live QA saw
 *
 * A red "Could not start the enrollment process", and then the same surface showing success. It
 * looked like competing requests or an optimistic rollback. It was neither: it was the CREATOR
 * being unable to say "this already exists".
 *
 * `createEnrollmentProcessInstance` upserts with `ignoreDuplicates: true`, and PostgREST returns NO
 * ROW on a conflict. The context branch returned `{ id: null }` for that, which is the same value it
 * returns for a genuine failure — and every caller renders a null id as "could not start". So the
 * second press on a child whose journey was already fine produced an error about a journey that was
 * perfectly healthy, while the list refetch behind it showed the success from the first press.
 *
 * The context-FREE branch never had this problem: it resolves the open instance and reports
 * `reused: true`. The two branches simply answered the same question differently. Now they do not.
 */

import { describe, expect, it } from "vitest";

import { createEnrollmentProcessInstance } from "@/lib/process/processInstances";
import { startEnrollment } from "@/lib/records/startEnrollmentService";

const ORG = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const HOUSEHOLD = "33333333-3333-4333-8333-333333333333";
const OPPORTUNITY = "44444444-4444-4444-8444-444444444444";
const EXISTING = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;

/**
 * Models the ONE behaviour this is about: a unique conflict under `ignoreDuplicates` yields no row
 * and no error. Everything else is the minimum needed to reach that statement.
 */
function client(db: { instances: Row[]; opportunities?: Row[]; inserts: number }) {
    const from = (table: string) => {
        const filters: Record<string, unknown> = {};
        let mode: "select" | "insert" | "upsert" = "select";
        let pending: Row | null = null;
        let ignoreDuplicates = false;

        const rows = () => (table === "process_instances" ? db.instances : (db.opportunities ?? []));
        const matches = (r: Row) => Object.entries(filters).every(([k, v]) => (r[k] ?? null) === v);

        const q: Record<string, unknown> = {
            select: () => q,
            eq: (c: string, v: unknown) => {
                filters[c] = v;
                return q;
            },
            is: (c: string, v: unknown) => {
                filters[c] = v;
                return q;
            },
            in: () => q,
            order: () => q,
            limit: () => q,
            insert: (r: Row) => {
                mode = "insert";
                pending = r;
                return q;
            },
            upsert: (r: Row, opts?: { ignoreDuplicates?: boolean }) => {
                mode = "upsert";
                pending = r;
                ignoreDuplicates = opts?.ignoreDuplicates === true;
                return q;
            },
            maybeSingle: async () => {
                if (mode === "select") return { data: rows().filter(matches)[0] ?? null, error: null };
                const row = pending as Row;
                const duplicate = db.instances.some(
                    (r) =>
                        r.org_id === row.org_id &&
                        r.process_key === row.process_key &&
                        r.subject_id === row.subject_id &&
                        (r.context_id ?? null) === (row.context_id ?? null),
                );
                if (duplicate) {
                    // THE BEHAVIOUR UNDER TEST: conflict + ignoreDuplicates = no row, no error.
                    if (ignoreDuplicates) return { data: null, error: null };
                    return { data: null, error: { code: "23505", message: "duplicate key" } };
                }
                const created = { id: `pi-${db.instances.length + 1}`, ...row };
                db.instances.push(created);
                db.inserts += 1;
                return { data: { id: created.id }, error: null };
            },
            then: (resolve: (v: unknown) => void) => resolve({ data: rows().filter(matches), error: null }),
        };
        return q;
    };
    return { from } as never;
}

const CONTEXT_ARGS = {
    orgId: ORG,
    subjectId: CHILD,
    contextId: OPPORTUNITY,
    stageKey: null,
    state: null,
    source: "enrollment_start",
} as const;

describe("a second Start Enrollment reports reuse, never failure", () => {
    it("resolves the existing journey instead of returning a null id", async () => {
        const db = {
            instances: [
                {
                    id: EXISTING,
                    org_id: ORG,
                    process_key: "enrollment",
                    subject_id: CHILD,
                    context_id: OPPORTUNITY,
                    state: null,
                },
            ],
            inserts: 0,
        };

        const result = await createEnrollmentProcessInstance(client(db), { ...CONTEXT_ARGS });

        expect(result.id).toBe(EXISTING);
        expect(result.reused).toBe(true);
        expect(result.error).toBeUndefined();
        // Nothing was created, and no pin is claimed for an instance this call did not create.
        expect(db.inserts).toBe(0);
        expect(result.businessProcessRevisionId).toBeUndefined();
    });

    it("still creates on the first call", async () => {
        const db = { instances: [] as Row[], inserts: 0 };
        const result = await createEnrollmentProcessInstance(client(db), { ...CONTEXT_ARGS });
        expect(result.id).toBeTruthy();
        expect(result.reused).toBeUndefined();
        expect(db.inserts).toBe(1);
    });

    it("Start Enrollment returns the existing journey rather than throwing", async () => {
        // Context-free is the shape a Records-originated start takes when the household has no live
        // episode. The creator's other branch already resolved reuse; this proves the SERVICE hands
        // that back as an outcome instead of the `!created.id` throw the operator saw as red.
        const db = {
            instances: [
                {
                    id: EXISTING,
                    org_id: ORG,
                    process_key: "enrollment",
                    subject_id: CHILD,
                    context_id: null,
                    state: null,
                },
            ],
            inserts: 0,
        };

        const result = await startEnrollment(clientWithChild(db), {
            orgId: ORG,
            customerMemberId: CHILD,
        });

        expect(result.processInstanceId).toBe(EXISTING);
        expect(result.reused).toBe(true);
        // And nothing was created behind it — a second press mutates nothing.
        expect(db.inserts).toBe(0);
    });
});

/** The child-row read Start Enrollment performs before anything else. */
function clientWithChild(db: { instances: Row[]; opportunities?: Row[]; inserts: number }) {
    const base = client(db) as unknown as { from: (t: string) => Record<string, unknown> };
    return {
        from(table: string) {
            if (table === "customer_members") {
                const q: Record<string, unknown> = {
                    select: () => q,
                    eq: () => q,
                    maybeSingle: async () => ({
                        data: { id: CHILD, customer_id: HOUSEHOLD, display_name: "QA Child" },
                        error: null,
                    }),
                };
                return q;
            }
            return base.from(table);
        },
    } as never;
}
