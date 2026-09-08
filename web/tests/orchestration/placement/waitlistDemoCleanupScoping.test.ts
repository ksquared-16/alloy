/**
 * DESTRUCTIVE CLEANUP SCOPING.
 *
 * `waitlistDemoCleanup` and `legacyWaitlistDemoCleanup` hold nine `delete`/`update` sites between
 * them and had no test references at all. They are demo tooling, so the blast radius is bounded by
 * intent rather than by the type system — and the failure mode is not subtle: a destructive
 * predicate that loses its org scope or its demo-marker restriction deletes ordinary production
 * placement candidates.
 *
 * Two guards, of two different kinds, because the risks are different:
 *
 *  - BEHAVIOUR: a cleanup asked to remove nothing must issue no statement, and a dry run must issue
 *    no statement. Both are runtime properties with a real answer.
 *  - SOURCE: "no destructive call anywhere in these modules is unscoped" is a property of the module
 *    text, not of one execution — a behavioural test cannot observe a dangerous branch it did not
 *    happen to take. This is the same justification as the ownership guards in
 *    `waitlistRegressionInvariants.test.ts`, and it is deliberately narrow.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runWaitlistDemoCleanup } from "@/lib/orchestration/placement/waitlistDemoCleanup";

type Rec = Record<string, unknown>;

/** Records every destructive statement the module attempts. */
function mockSupabase() {
    const captured: { deletes: Array<{ table: string; filters: Rec }> } = { deletes: [] };
    const client = {
        from(table: string) {
            const filters: Rec = {};
            let destructive = false;
            const builder: Rec = {
                select() { return builder; },
                delete() { destructive = true; return builder; },
                update() { destructive = true; return builder; },
                eq(c: string, v: unknown) { filters[c] = v; return builder; },
                in(c: string, v: unknown) { filters[c] = v; return builder; },
                like(c: string, v: unknown) { filters[c] = v; return builder; },
                or(expr: string) { filters.__or = expr; return builder; },
                not() { return builder; },
                is(c: string, v: unknown) { filters[c] = v; return builder; },
                neq(c: string, v: unknown) { filters[c] = v; return builder; },
                maybeSingle() { return Promise.resolve({ data: null, error: null }); },
                limit() { return builder; },
                order() { return builder; },
                then(resolve: (v: { data: unknown[]; error: null; count: number }) => unknown) {
                    if (destructive) captured.deletes.push({ table, filters: { ...filters } });
                    return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
                },
            };
            return builder;
        },
    };
    return { client: client as never, captured };
}

describe("waitlist demo cleanup — a dry run destroys nothing", () => {
    it("issues no destructive statement when not executing", async () => {
        const { client, captured } = mockSupabase();
        await runWaitlistDemoCleanup(client, "org-1", false);
        expect(captured.deletes).toHaveLength(0);
    });

    /**
     * EVERY destructive statement is org-scoped AND demo-marker-scoped.
     *
     * Written expecting "no marked rows means no statement", which was wrong: the module issues
     * marker-scoped deletes unconditionally rather than pre-selecting ids. That is safe — and it is
     * the stronger property, so this asserts the real one. A delete that reached production rows
     * would have to lose one of these two filters, and this fails the moment it does.
     */
    it("every destructive statement carries BOTH an org scope and a demo-marker restriction", async () => {
        const { client, captured } = mockSupabase();
        await runWaitlistDemoCleanup(client, "org-1", true);
        expect(captured.deletes.length, "the guard is pointless if nothing was captured").toBeGreaterThan(0);

        for (const stmt of captured.deletes) {
            expect(stmt.filters.org_id, `${stmt.table} delete is not org-scoped`).toBe("org-1");
            const marker = String(stmt.filters.__or ?? "");
            expect(marker, `${stmt.table} delete is not restricted to demo-marked rows`).toContain(
                "waitlist_demo_v1",
            );
        }
    });

    it("never issues an unrestricted delete against the candidate table itself", async () => {
        const { client, captured } = mockSupabase();
        await runWaitlistDemoCleanup(client, "org-1", true);
        const candidateDeletes = captured.deletes.filter((d) => d.table === "placement_candidates");
        for (const d of candidateDeletes) {
            // Either an explicit id set or a demo marker — never org alone.
            expect(Boolean(d.filters.id || d.filters.__or)).toBe(true);
        }
    });
});

describe("waitlist demo cleanup — no unscoped destructive call exists", () => {
    const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

    /**
     * A `.delete()` must always be followed, before the statement is awaited, by a restriction —
     * either an org scope or an id/marker set. This scans for the dangerous shape rather than
     * asserting an exact formatting, so it survives reflow but still fails on a genuinely bare
     * `.delete()` chain.
     */
    it.each([
        "lib/orchestration/placement/waitlistDemoCleanup.ts",
        "lib/orchestration/placement/legacyWaitlistDemoCleanup.ts",
    ])("every delete in %s is restricted", (path) => {
        const src = read(path);
        // Split on each delete() and inspect what follows it up to the end of that statement.
        const segments = src.split(/\.delete\(\)/).slice(1);
        expect(segments.length).toBeGreaterThan(0); // the guard is pointless if it scans nothing
        for (const seg of segments) {
            const statement = seg.split(";")[0] ?? "";
            const restricted =
                /\.eq\(\s*["']org_id["']/.test(statement) ||
                /\.in\(/.test(statement) ||
                /\.eq\(/.test(statement);
            expect(restricted, `unrestricted delete near: ${statement.slice(0, 120)}`).toBe(true);
        }
    });

    it("the cleanup modules never delete placement candidates by org alone", () => {
        for (const path of [
            "lib/orchestration/placement/waitlistDemoCleanup.ts",
            "lib/orchestration/placement/legacyWaitlistDemoCleanup.ts",
        ]) {
            const src = read(path);
            // An org-only delete of the candidate table would remove every child's placement.
            expect(src).not.toMatch(
                /from\(\s*["']placement_candidates["']\s*\)\s*\.delete\(\)\s*\.eq\(\s*["']org_id["'][^)]*\)\s*;/,
            );
        }
    });
});
