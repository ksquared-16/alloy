/**
 * ASKING AN OPERATIONAL QUESTION IS A READ. RECORDING THE ANSWER IS AUTHORING.
 *
 * `admin/operational-questions/answer` POST answers a question and, by default, appended the observation
 * to `org_settings.metadata` and saved it. Its only gate was an authenticated session with org
 * membership, so any portal member could cause a durable write — and could force it by passing
 * `persistHistory` in the request body. That is analysis becoming hidden authority.
 *
 * The repair gates the WRITE, not the answer: `canReadAnalytics` states the OI position as "ops keeps
 * `reports.read`, so Operational Intelligence stays readable and only authoring narrows", so taking the
 * question away from ops would have been the wrong fix. This locks both halves — the answer stays open,
 * the persistence stays gated — because either one silently flipping reintroduces the problem.
 *
 * Filesystem-only so it runs in CI with no database.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../..");
const ROUTE = join(WEB, "app/api/admin/operational-questions/answer/route.ts");
const OBSERVE = join(WEB, "lib/metrics/oiOrgCalcObserve.ts");
const DECL = join(WEB, "scripts/routeCapabilities.declared.json");

const route = readFileSync(ROUTE, "utf8");
const observe = readFileSync(OBSERVE, "utf8");

describe("Operational Intelligence write authority", () => {
    it("is not vacuous: the route and the persisting observer both exist", () => {
        expect(route).toContain("answerOperationalQuestion");
        expect(observe).toContain("persistHistory");
        // The write this test exists to gate must still be reachable in the observer.
        expect(observe).toMatch(/saveOrgMetadata\s*\(/);
    });

    it("the durable history write is gated on the analytics authoring capability", () => {
        expect(
            /canManageAnalytics\s*\(/.test(route),
            "the observation-history write lost its capability check. oiOrgCalcObserve appends to "
                + "org_settings.metadata and saves it whenever persistHistory is not false, so without "
                + "this gate any authenticated org member can write by asking a question.",
        ).toBe(true);
        expect(route).toMatch(/persistHistory:\s*body\.persistHistory !== false && mayAuthor/);
    });

    it("the caller cannot force persistence from the request body", () => {
        // `persistHistory: body.persistHistory !== false` alone would let a caller opt IN.
        const match = route.match(/persistHistory:\s*([^,\n]+)/);
        expect(match, "persistHistory is no longer passed explicitly").toBeTruthy();
        expect(
            match![1].includes("mayAuthor"),
            "persistHistory is derived from the request body alone again, so a caller can opt into a "
                + "durable write the capability was meant to gate.",
        ).toBe(true);
    });

    it("answering stays open — the read is not narrowed to authors", () => {
        // A capability check placed before the answer would take OI reads away from reports.read holders.
        const beforeAnswer = route.slice(0, route.indexOf("answerOperationalQuestion"));
        expect(
            /return\s+[^\n]*Forbidden[^\n]*canManageAnalytics|requireAnalyticsManageAccess/.test(beforeAnswer),
            "the answer itself became capability-gated. Ops holds reports.read and must keep being able "
                + "to ASK; only recording narrows.",
        ).toBe(false);
    });

    it("the conditional side-effect authority is recorded as debt, not left invisible", () => {
        const declared = JSON.parse(readFileSync(DECL, "utf8")) as {
            ROUTE_INVENTORY_CONDITIONAL_OWNER_DEBT?: { entries?: Array<Record<string, unknown>> };
        };
        const entry = (declared.ROUTE_INVENTORY_CONDITIONAL_OWNER_DEBT?.entries ?? []).find(
            (e) =>
                e.route === "app/api/admin/operational-questions/answer/route.ts" && e.method === "POST",
        );
        expect(
            entry,
            "the one-capability-per-method table cannot express a capability that gates a side effect "
                + "rather than admission, so it must be recorded as a known debt.",
        ).toBeTruthy();
        expect(String(entry!.also_requires)).toContain("reports.write");
    });
});
