/**
 * A REFUSAL IS OPERATOR COPY, NOT A ROW FROM OUR RBAC TABLE.
 *
 * A director opening Financials was told "Viewing financial work requires fin.read." That sentence
 * is true and useless: `fin.read` is a fact about `role_permission_grants`, and the person reading
 * it cannot grant themselves anything. It also quietly teaches internal vocabulary to everyone who
 * is refused, which is how a permission key ends up in a screenshot.
 *
 * The key is still the truth of the check, so it stays checkable — on the verdict as
 * `requiredPermission`, and in the routes' 403 body as `required_permission`, a field the
 * workspace never renders. What changed is which of the two a human is shown.
 *
 * These assertions are deliberately in tension: one demands the key be present for diagnostics,
 * the other demands it be absent from the message. Together they stop the two collapsing back into
 * a single string, which is exactly how the original defect was written.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
    FINANCIALS_READ_DENIED_MESSAGE,
    FINANCIALS_READ_PERMISSION_KEY,
} from "@/lib/financials/financialsPermissions";

const root = path.join(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

/** Every financial read surface that gates on `fin.read` and answers 403. */
const GATED_ROUTES = [
    "app/api/admin/financials/activity/route.ts",
    "app/api/admin/financials/overview-metrics/route.ts",
    "app/api/admin/financials/payment-flow/route.ts",
    "app/api/admin/financials/position/route.ts",
    "app/api/admin/financials/work-queue/route.ts",
];

describe("the financial read refusal", () => {
    it("says something an operator can act on", () => {
        expect(FINANCIALS_READ_DENIED_MESSAGE).toMatch(/don't have access/i);
        expect(FINANCIALS_READ_DENIED_MESSAGE).toMatch(/administrator/i);
    });

    it("never puts the grant key in the sentence a person reads", () => {
        expect(FINANCIALS_READ_DENIED_MESSAGE).not.toMatch(/fin\.read/i);
        // Not just this key — no bare `<group>.<verb>` grant token belongs in operator copy.
        expect(FINANCIALS_READ_DENIED_MESSAGE).not.toMatch(/\b[a-z_]+\.[a-z_]+\b/);
    });

    it("keeps the key available to diagnostics", () => {
        expect(FINANCIALS_READ_PERMISSION_KEY).toBe("fin.read");
    });

    /*
     * The helper is the single owner of this copy. A route that hand-rolls its own refusal string
     * is how one surface drifts back to naming the permission while the others do not.
     */
    it.each(GATED_ROUTES)("%s returns the shared message and the diagnostic field", (rel) => {
        const src = read(rel);
        expect(src, "the route uses the named guard").toContain("assertFinancialsReadAllowed");
        expect(src, "operator copy comes from the verdict").toContain("error: allowed.message");
        expect(src, "the key travels as diagnostics").toContain("required_permission: allowed.requiredPermission");
        // No route may write the key into a string of its own.
        expect(src.replace(/^\s*(\*|\/\/).*$/gm, ""), "no hand-rolled key copy").not.toMatch(
            /"[^"]*fin\.read[^"]*"/,
        );
    });
});

/*
 * ── THE GRANT ITSELF ────────────────────────────────────────────────────────────────────────────
 *
 * Fixing the sentence would have been a cosmetic answer to a real refusal. The cause was that
 * `school_director` and `regional_lead` are DEFINED system roles seeded with no grants at all —
 * the default RBAC seed enumerates `admin` and `ops` only — so the role literally named for
 * running a school could not read that school's money.
 */
describe("the director roles can read financials", () => {
    const migration = read("../supabase/migrations/20260909170000_financials_read_for_director_roles.sql");

    it("grants fin.read to the director roles at the RBAC owner, not in Financials", () => {
        expect(migration).toContain("role_permission_grants");
        expect(migration).toContain("school_director");
        expect(migration).toContain("regional_lead");
        expect(migration).toContain("'fin.read'");
    });

    /*
     * A read repair must not carry write authority in behind it. Billing a family, forgiving what
     * is owed, deciding which parent owes seventy percent and settling agency money are separate
     * decisions about who may move money.
     */
    it.each(["fin.write", "fin.adjust", "fin.responsibility", "fin.subsidy"])(
        "does not widen %s",
        (key) => {
            expect(migration).not.toContain(`'${key}'`);
        },
    );

    it("is idempotent, so re-running the chain cannot double-grant", () => {
        expect(migration).toMatch(/NOT EXISTS/i);
    });
});
