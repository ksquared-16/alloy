/**
 * The "new partner engineer" exercise.
 *
 * ── THE RULE THIS SUITE OBEYS ──
 *
 * It may read the offline package and the governed OpenAPI, and **nothing else**. No route files,
 * no scope catalog, no internal constant. That restriction is the whole point: everyone who has
 * reviewed this contract so far could answer any question about it from memory or from the
 * repository, which is exactly why a package can feel complete while being unusable.
 *
 * Each case below is a question a partner engineer must be able to answer on their first day with
 * no one to ask. A failure here is not a broken test — it is the package failing to say something,
 * and the repair belongs in the package.
 *
 * The assertions deliberately require the SUBSTANCE of an answer rather than the presence of a
 * keyword, because a document can mention `since_token` and still never explain what to do with it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO = path.dirname(path.resolve(__dirname, "../.."));
const PKG = path.join(REPO, "docs/api/developer-platform/package");

const guide = readFileSync(path.join(PKG, "01-integrating-with-alloy.md"), "utf8");
const spec = readFileSync(path.join(PKG, "02-technical-specification.md"), "utf8");
const cover = readFileSync(path.join(PKG, "README.md"), "utf8");
const worksheet = readFileSync(path.join(PKG, "06-mapping-worksheet.md"), "utf8");
const questions = readFileSync(path.join(PKG, "07-discovery-questions.md"), "utf8");
const openapi = JSON.parse(readFileSync(path.join(PKG, "03-openapi/alloy-public-api.v1.json"), "utf8")) as {
    paths: Record<string, Record<string, { operationId?: string; "x-required-scope"?: string; parameters?: Array<{ name: string }> }>>;
    components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
};

const ALL = [cover, guide, spec, worksheet, questions].join("\n\n");

/** The package must answer in prose, not merely contain a token. */
const answers = (needles: string[], corpus = ALL) =>
    needles.every((n) => new RegExp(n, "i").test(corpus));

const operation = (method: string, p: string) => openapi.paths[p]?.[method.toLowerCase()];
const fieldsOf = (schema: string) => Object.keys(openapi.components.schemas[schema]?.properties ?? {});

describe("a partner engineer, with only this package", () => {
    it("1. can authenticate", () => {
        expect(operation("post", "/api/v1/oauth/token"), "the token endpoint is in the contract").toBeTruthy();
        expect(answers(["client_credentials", "client_id", "client_secret", "Authorization: Bearer"], guide))
            .toBe(true);
        // …and knows the token is short-lived rather than a permanent key.
        expect(answers(["expires_in", "cache", "short-lived"], guide)).toBe(true);
    });

    it("2. can discover which organization and locations they are bound to", () => {
        expect(operation("get", "/api/v1/context")).toBeTruthy();
        expect(answers(["GET /api/v1/context", "scopes", "boundary"], guide)).toBe(true);
        // And is told to go there first when something is unexpected.
        expect(answers(["call this first|check .*context first|context.*first"], guide)).toBe(true);
    });

    it("3. can bootstrap Locations", () => {
        const op = operation("get", "/api/v1/locations")!;
        expect(op["x-required-scope"]).toBe("locations.read");
        expect((op.parameters ?? []).map((p) => p.name)).toEqual(
            expect.arrayContaining(["limit", "cursor", "since_token"]),
        );
        expect(answers(["site", "unit"], spec)).toBe(true);
    });

    it("4. can bootstrap Children — and learns why there are fewer than expected", () => {
        const op = operation("get", "/api/v1/children")!;
        expect(op["x-required-scope"]).toBe("children.read");
        expect(fieldsOf("Child")).toEqual(
            expect.arrayContaining(["id", "external_id", "first_name", "date_of_birth", "household_id", "status"]),
        );
        // The rule most likely to be mistaken for a bug must be stated, not implied.
        expect(answers(["enrollment is what makes a child visible"], ALL)).toBe(true);
        expect(answers(["fewer children"], ALL)).toBe(true);
    });

    it("5. can connect a child to its household and its adults", () => {
        expect(fieldsOf("Child")).toContain("household_id");
        expect(fieldsOf("Relationship")).toEqual(expect.arrayContaining(["child_id", "household_id", "person_id"]));
        expect(operation("get", "/api/v1/households")!["x-required-scope"]).toBe("households.read");
        expect(operation("get", "/api/v1/relationships")!["x-required-scope"]).toBe("relationships.read");
        // And learns the boundary rule that makes a household safe to consume.
        expect(answers(["anchor, not a grant|anchor for grouping siblings"], ALL)).toBe(true);
        expect(answers(["household_id="], guide)).toBe(true);
    });

    it("6. can tell Enrollment, Placement, Schedule and Schedule days apart", () => {
        for (const [p, scope] of [
            ["/api/v1/enrollments", "enrollment.read"],
            ["/api/v1/placements", "enrollment.read"],
            ["/api/v1/schedule-assignments", "schedule.read"],
            ["/api/v1/schedule-days", "schedule.read"],
        ] as const) {
            expect(operation("get", p)!["x-required-scope"], p).toBe(scope);
        }
        // The distinction, in words, with a reason they change independently.
        expect(answers(["change independently|move room without", "which room", "recurring pattern"], ALL)).toBe(true);
        // And that one of the four cannot be synchronized.
        expect(answers(["no cursor and no sync token|cannot be synchronized|not synchronizable"], ALL)).toBe(true);
        expect(answers(["92"], ALL)).toBe(true);
    });

    it("7. can understand Staff without inventing a second identity", () => {
        expect(fieldsOf("Staff")).toEqual(expect.arrayContaining(["id", "person_id", "employment_status", "primary_location_id"]));
        expect(answers(["composition, not a second identity|Staff is a composition"], ALL)).toBe(true);
        expect(answers(["employed twice"], ALL)).toBe(true);
    });

    it("8. can bootstrap Attendance history and interpret it", () => {
        expect(operation("get", "/api/v1/attendance-events")!["x-required-scope"]).toBe("attendance.read");
        expect(answers(["append-only"], ALL)).toBe(true);
        expect(answers(["fold the history|supersede"], ALL)).toBe(true);
    });

    it("9. can continue an incremental sync without a gap", () => {
        // A bootstrap procedure, a continuation procedure, and a reason to prefer one token.
        expect(answers(["bootstrap"], guide)).toBe(true);
        expect(answers(["next_cursor", "sync_token", "since_token"], guide)).toBe(true);
        expect(answers(["prefer .{0,10}since_token"], ALL)).toBe(true);
        expect(answers(["skipped or repeated"], ALL)).toBe(true);
        // And knows when to keep the checkpoint.
        expect(answers(["durably processed|fully processed"], guide)).toBe(true);
    });

    it("10. can safely submit an Attendance fact", () => {
        const op = operation("post", "/api/v1/attendance-events")!;
        expect(op["x-required-scope"]).toBe("attendance.write");
        for (const outcome of ["accepted", "replayed", "conflict", "pending_mapping", "rejected"]) {
            expect(answers([outcome], ALL), `outcome ${outcome} is unexplained`).toBe(true);
        }
        expect(answers(["batch is not a transaction|not atomic"], ALL)).toBe(true);
        expect(answers(["check_in", "check_out", "absence", "room_transfer"], ALL)).toBe(true);
    });

    it("11. can retry without creating a duplicate", () => {
        expect(answers(["retry it unchanged"], ALL)).toBe(true);
        expect(answers(["cannot create a duplicate|cannot .{0,20}duplicate"], ALL)).toBe(true);
        // And knows where the identity comes from, since that is what makes it safe.
        expect(answers(["your own event identifier|external_event_id"], ALL)).toBe(true);
    });

    it("12. can explain corrections and reversals", () => {
        expect(answers(["correction"], ALL)).toBe(true);
        expect(answers(["reversal"], ALL)).toBe(true);
        expect(answers(["never by editing|not by editing|never edited"], ALL)).toBe(true);
    });

    it("13. can list what is deliberately unavailable", () => {
        for (const missing of [
            "no health, allergy, medical",
            "communications",
            "financials",
            "webhook",
            "tombstone",
            "no reason",
        ]) {
            expect(answers([missing], ALL), `the package never states: ${missing}`).toBe(true);
        }
        // The limitations must be gathered somewhere, not only scattered.
        expect(/current limitations/i.test(spec) || /current limits/i.test(guide)).toBe(true);
    });

    it("14. knows which questions remain for their own side", () => {
        expect(/UNKNOWN/.test(worksheet)).toBe(true);
        expect(answers(["deliberately not guessed|have not assumed"], ALL)).toBe(true);
        // The hardest rows are called out rather than left to be discovered late.
        expect(answers(["what identifies a child"], ALL)).toBe(true);
        expect(answers(["stable across"], ALL)).toBe(true);
    });

    it("is answerable without ever leaving the package", () => {
        // No document may send the reader somewhere they cannot reach.
        for (const [name, body] of [["cover", cover], ["guide", guide], ["spec", spec]] as const) {
            expect(/\bask your Alloy contact to send\b/i.test(body), `${name} defers a required answer`).toBe(false);
            expect(/\bsee the repository\b/i.test(body), `${name} points at a repository`).toBe(false);
            expect(/\blog in to\b/i.test(body), `${name} requires a login`).toBe(false);
        }
    });
});
