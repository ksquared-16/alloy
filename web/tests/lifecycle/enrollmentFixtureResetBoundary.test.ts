/**
 * THE FIXTURE RESET CLEANUP BOUNDARY.
 *
 * This exists because I crossed it. A reset sweep removed every Enrollment journey whose subject
 * child no longer existed — a rule that is sound in isolation, because such a row cannot point at a
 * live child, but is not SCOPED, because it reaches rows the fixture never created. Its first run
 * returned the tenant exactly to baseline, which read as vindication. Its second run deleted two
 * pre-baseline journeys the Director had explicitly said to preserve.
 *
 * The lesson these tests hold in place: a clean result from an unbounded predicate is luck wearing
 * the costume of proof. A fixture may remove what it CREATED. It may not remove everything that
 * RESEMBLES what it creates.
 *
 * These are source-level assertions on purpose. The failure mode is not a wrong value at runtime that
 * a mock could catch — it is a future edit reintroducing a predicate with no ownership behind it, and
 * the only place to catch that is the shape of the delete itself.
 */

import { describe, expect, it } from "vitest";

import { CERT_FAMILIES } from "@/lib/certification/enrollmentCertificationFixture";

/*
 * The reset moved from the seed script into the fixture library so the certification driver can call
 * the SAME bounded implementation rather than growing a second one. Two implementations of a
 * destructive boundary is the shape that produced the leak this file exists to prevent, so the test
 * follows the code rather than the code being kept where the test happened to look.
 */
const resetSource = () =>
    import("node:fs/promises").then((fs) =>
        fs.readFile(new URL("../../lib/certification/enrollmentCertificationFixture.ts", import.meta.url), "utf8"),
    );

/** The body of removeFixture, which is the only function permitted to delete anything. */
async function removeFixtureBody(): Promise<string> {
    const src = await resetSource();
    const start = src.indexOf("export async function removeEnrollmentCertificationFixture");
    expect(start).toBeGreaterThan(-1);
    // Ends at the next top-level function declaration.
    const end = src.length;
    return src.slice(start, end > start ? end : undefined);
}

describe("every deletion is scoped to something the fixture owns", () => {
    it("deletes journeys only by the fixture's own child ids", async () => {
        const body = await removeFixtureBody();
        const journeyDeletes = body
            .split("\n")
            .filter((l) => l.includes('from("process_instances")') || l.includes("process_instances"))
            .join("\n");
        // The one permitted selector: subject_id in the fixture's member ids.
        expect(journeyDeletes).toContain('.in("subject_id", memberIds)');
    });

    it("has NO unbounded journey sweep — the specific defect this file exists for", async () => {
        const body = await removeFixtureBody();
        /*
         * The sweep that crossed the line looked for journeys whose subject was absent from the live
         * child set. Any reappearance of that shape — a delete on process_instances driven by
         * set-difference against all children rather than by the fixture's own ids — is refused here.
         */
        expect(body).not.toMatch(/liveChildIds/);
        expect(body).not.toMatch(/orphanJourneyIds/);
        expect(body).not.toMatch(/from\("process_instances"\)[\s\S]{0,200}\.in\("id",/);
    });

    it("collects owned records BEFORE destroying the identity that proves ownership", async () => {
        /*
         * The root cause of every leak in this fixture: ownership is discovered through the household
         * and child, so anything owned must be collected while they still exist. Journeys and
         * Opportunities are read and deleted ahead of the child and household deletes.
         */
        const body = await removeFixtureBody();
        const journeyDelete = body.indexOf('from("process_instances").delete()');
        const memberDelete = body.indexOf('from("customer_members").delete()');
        const opportunityRead = body.indexOf('.from("opportunities")\n        .select("id")');
        const customerDelete = body.indexOf('from("customers").delete()');

        expect(journeyDelete).toBeGreaterThan(-1);
        expect(memberDelete).toBeGreaterThan(-1);
        expect(customerDelete).toBeGreaterThan(-1);

        expect(journeyDelete).toBeLessThan(memberDelete);
        expect(opportunityRead).toBeLessThan(customerDelete);
    });
});

describe("the Opportunity orphan sweep keeps BOTH halves of its selector", () => {
    /*
     * This sweep is permitted where the journey sweep was not, and the difference is the whole point:
     * it requires a null household reference AND a surname this fixture invented. Either half alone
     * over-reaches — a tenant may legitimately hold a customer-less Opportunity, and a surname match
     * alone would reach a live family's row. The pairing was measured against the live tenant before
     * it was used.
     */
    it("requires a null household reference", async () => {
        expect(await removeFixtureBody()).toContain('.is("customer_id", null)');
    });

    it("requires a fixture surname as well", async () => {
        expect(await removeFixtureBody()).toContain("orphanSurnameFilter");
    });

    it("reads those surnames off the family specs rather than retyping them", async () => {
        const src = await resetSource();
        expect(src).toContain("Object.values(CERT_FAMILIES).map((f) => f.lastName)");
        // A drifted list would make the sweep silently stop working while still reporting success.
        const surnames = Object.values(CERT_FAMILIES).map((f) => f.lastName);
        expect(surnames.length).toBeGreaterThan(0);
        expect(new Set(surnames).size).toBe(surnames.length);
    });
});

describe("what reset must never touch", () => {
    it("never deletes from tables outside the fixture's ownership graph", async () => {
        const body = await removeFixtureBody();
        const deletedTables = [...body.matchAll(/from\("([a-z_]+)"\)\s*\.delete\(\)/g)].map((m) => m[1]);
        const permitted = new Set([
            "process_instances",
            "opportunity_customer_members",
            "customer_members",
            "customers",
            "opportunities",
        ]);
        for (const t of deletedTables) expect(permitted.has(t!)).toBe(true);
    });

    it("scopes every delete to the org", async () => {
        /*
         * A delete without org scope in a multi-tenant table is a cross-tenant incident waiting for a
         * second tenant to exist. Each delete statement carries its own org filter.
         */
        const body = await removeFixtureBody();
        const deleteStatements = body.split(".delete()").slice(1);
        for (const s of deleteStatements) {
            expect(s.slice(0, 160)).toContain('.eq("org_id", orgId)');
        }
    });
});
