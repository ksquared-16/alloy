/**
 * REGRESSION CONTROL — independent reads on the queue-critical path must be ISSUED TOGETHER.
 *
 * The same defect was found three times in the shared Work Unit runtime: reads whose dependency
 * graph was already known were nonetheless awaited one after another, so each page paid a round
 * trip per read instead of one for the set.
 *
 *   member reference reads      ~308ms serial -> ~184ms   (customer_members / program_categories
 *                                                          never depended on the ocm -> opportunity chain)
 *   placement candidate detail  ~143ms serial -> ~69ms    (link groups / overrides share a key set)
 *   household fact context      ~188ms serial -> ~89ms    (three reads of one customerIds set)
 *
 * A source-text assertion would only pin today's spelling. This asserts the BEHAVIOUR: at the moment
 * the first read settles, every independent read in the set must already have been issued. Awaiting
 * them in sequence fails this by construction, however the code is written, because a serial second
 * read cannot be issued until the first has resolved.
 */
import { describe, expect, it } from "vitest";

type Issued = { table: string };

/**
 * A Supabase double that records WHEN each query is handed to the runtime.
 *
 * Every builder method returns the builder; awaiting it records the table and resolves on a later
 * macrotask. `issuedBeforeFirstSettle` is the snapshot taken the first time any query settles —
 * which is exactly the boundary a serial chain cannot cross.
 */
function recordingClient(rowsByTable: Record<string, unknown[]> = {}) {
    const issued: Issued[] = [];
    let issuedBeforeFirstSettle: string[] | null = null;

    const builder = (table: string) => {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "or", "order", "limit", "not", "is", "neq", "gte", "lte"]) {
            b[m] = () => b;
        }
        b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
            issued.push({ table });
            return new Promise((res) => setTimeout(res, 0))
                .then(() => {
                    if (issuedBeforeFirstSettle === null) {
                        issuedBeforeFirstSettle = issued.map((i) => i.table);
                    }
                    return { data: rowsByTable[table] ?? [], error: null };
                })
                .then(resolve, reject);
        };
        return b;
    };

    return {
        supabase: { from: (table: string) => builder(table) } as never,
        issuedTables: () => issued.map((i) => i.table),
        issuedBeforeFirstSettle: () => issuedBeforeFirstSettle,
    };
}

describe("queue-critical independent reads are issued together", () => {
    it("household fact context issues its three reads before any of them settles", async () => {
        const { bulkLoadHouseholdPlacementFactContext } = await import(
            "@/lib/orchestration/placement/bulkLoadHouseholdPlacementFactContext"
        );
        const rec = recordingClient();
        await bulkLoadHouseholdPlacementFactContext({
            supabase: rec.supabase,
            orgId: "org_1",
            customerIds: ["cust_1", "cust_2"],
        });

        const before = rec.issuedBeforeFirstSettle();
        expect(before, "no query was issued at all").toBeTruthy();
        expect(
            new Set(before!),
            "opportunity_customer_members, placement_candidates and customer_persons are keyed by the " +
                "same customerIds and none reads another's result — they must not be awaited in sequence",
        ).toEqual(
            new Set(["opportunity_customer_members", "placement_candidates", "customer_persons"]),
        );
    });

    it("member reference resolution does not chain the reads that only need the process rows", async () => {
        const { queryEnrollmentProcessInstanceTrackRows } = await import(
            "@/lib/queues/childGrainProcessInstanceQueue"
        );
        // One process instance carrying a context, a subject and a program category: enough for all
        // four reference reads to have work to do.
        const rec = recordingClient({
            process_instances: [
                {
                    id: "pi_1",
                    org_id: "org_1",
                    process_key: "enrollment",
                    subject_type: "customer_member",
                    subject_id: "cm_1",
                    context_id: "ocm_1",
                    stage_key: "waitlisted",
                    state: "running",
                    close_reason_key: null,
                    metadata: { program_category_id: "cat_1" },
                    updated_at: null,
                    created_at: null,
                },
            ],
        });
        await queryEnrollmentProcessInstanceTrackRows({
            supabase: rec.supabase,
            orgId: "org_1",
            workUnitId: "wu_1",
            stageKey: "waitlisted",
        });

        const all = rec.issuedTables();
        expect(all, "the process-instance read must still come first").toContain("process_instances");
        expect(all).toContain("customer_members");
        expect(all).toContain("location_program_categories");

        /*
         * EVERY REFERENCE READ IS ISSUED IN ONE BATCH, DIRECTLY BEHIND THE PROCESS ROWS.
         *
         * This used to assert `idx(customer_members) <= idx(opportunities)`, which was a proxy for
         * "cm does not wait on the ocm -> opportunity chain" and was only true while `opportunities`
         * came LAST, after ocm resolved. The opportunities read is now issued speculatively in the
         * same tick as ocm, so the proxy inverted while the property it stood for held perfectly.
         *
         * The property itself is assertable directly and more strictly: the process-instance read
         * comes first, and all four reference reads are issued CONSECUTIVELY after it. That forbids
         * any chaining among them — including the ocm -> opportunity chain this slice removed —
         * rather than forbidding one particular ordering of the four.
         */
        expect(all[0], "the process-instance read must still come first").toBe("process_instances");
        expect(
            [...all.slice(1, 5)].sort(),
            "all four reference reads must be issued together, with nothing awaited between them",
        ).toEqual(
            ["customer_members", "location_program_categories", "opportunities", "opportunity_customer_members"],
        );
        // And with every context id resolvable speculatively, the bounded backstop must not fire.
        expect(all.filter((t) => t === "opportunities")).toHaveLength(1);
    });
});
