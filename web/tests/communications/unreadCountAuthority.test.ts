/**
 * Unread is an exact count, not a sample of recent messages.
 *
 * The route used to fetch the 300 most recent inbound ids, fetch read rows for
 * them, and subtract in JavaScript. Past 300 unread it silently under-reported —
 * an operator returning to a busy tenant was told they had 300 unread replies
 * when they had more, and the number stopped moving as the backlog grew.
 *
 * Correctness beyond the old cap is proven in SQL against a real Postgres (1000
 * inbound → 1000 unread; 400 read → 600). What is guarded here is that nobody
 * reintroduces a bounded scan, because the failure is silent and only appears in
 * tenants busy enough that nobody is watching a test.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rawSource = readFileSync(
    resolve(__dirname, "../../app/api/admin/communications/unread-count/route.ts"),
    "utf8"
);

/**
 * Comments stripped before asserting. The file explains the bug it fixes, and
 * that prose necessarily names the old cap and the read table — matching against
 * it would fail on the explanation rather than on the behaviour.
 */
const routeSource = rawSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

describe("unread count authority", () => {
    it("delegates the count to the database", () => {
        expect(routeSource).toContain("communication_unread_count");
        expect(routeSource).toContain(".rpc(");
    });

    it("carries no row cap", () => {
        // Any of these reintroduces the bug in a new disguise.
        expect(routeSource).not.toContain("RECENT_CAP");
        expect(routeSource).not.toMatch(/\.limit\(/);
        // Deliberately not a bare numeric-literal scan: `status: 500` is an HTTP
        // code, and a check that flags it teaches people to work around the test
        // rather than to keep the count exact.
    });

    it("does not fetch message ids to subtract in JavaScript", () => {
        // The old shape: select ids, select reads, diff the sets.
        expect(routeSource).not.toContain("communication_message_reads");
        expect(routeSource).not.toContain("new Set(");
    });

    it("scopes the count to the caller's org and user", () => {
        expect(routeSource).toContain("p_org_id: ctx.orgId");
        expect(routeSource).toContain("p_user_id: ctx.userId");
    });

    it("normalises the bigint the function returns", () => {
        // bigint arrives as a number or a numeric string depending on driver; an
        // unnormalised string would render as a broken badge.
        expect(routeSource).toMatch(/Number\(/);
        expect(routeSource).toContain("Number.isFinite");
    });
});
