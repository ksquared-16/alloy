/**
 * W7-F012 — EVERY DIRECTOR SCENARIO NAMES ITS HOUSEHOLD, AND THE HOUSEHOLD IS THE ONE THE FIXTURE BUILDS.
 *
 * Two halves that must not drift: `w7Fixtures.ts` tells the Director which household a scenario is
 * run against, and the W7 section of `certification/fixtures/financials-demo-tenant.sql` is what
 * actually creates those households on staging. An id, a name, a campus or an arrangement that
 * differs between them is a scenario pointing at a household nobody built.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { SCENARIOS } from "@/lib/qa/financialsDirectorQa/scenarioCatalog";
import {
    SCENARIO_FIXTURE,
    W7_FIXTURES,
    fixtureForScenario,
    fixtureLabel,
} from "@/lib/qa/financialsDirectorQa/w7Fixtures";

const SQL = readFileSync(
    path.join(process.cwd(), "..", "certification/fixtures/financials-demo-tenant.sql"),
    "utf8",
);
const W7_SQL = SQL.slice(SQL.indexOf("W7 QA HOUSEHOLDS"), SQL.indexOf("-- All of it, or none of it."));

describe("every scenario names its fixture", () => {
    it("explicitly — no scenario falls through to a default", () => {
        const missing = SCENARIOS.map((s) => s.key).filter((k) => !(k in SCENARIO_FIXTURE));
        expect(missing).toEqual([]);
    });

    it("and every named fixture is a real one", () => {
        for (const s of SCENARIOS) {
            expect(fixtureLabel(fixtureForScenario(s.key)), s.key).toBeTruthy();
        }
    });

    it("no scenario is run against Alvarez or another unnamed staging household", () => {
        for (const s of SCENARIOS) {
            const text = [s.purpose, ...s.navigate, ...s.doThis, s.dispositionReason ?? ""].join(" ");
            expect(text, s.key).not.toMatch(/Alvarez/);
        }
    });

    it("scenarios that chain run on one household — a draft posted in one is the draft the next reads", () => {
        for (const s of SCENARIOS) {
            for (const req of s.requires) {
                if (req.kind !== "scenario_passed") continue;
                const mine = fixtureForScenario(s.key);
                const theirs = fixtureForScenario(req.scenarioKey);
                if (mine === "organization" || theirs === "organization") continue;
                expect(`${s.key} → ${mine}`).toBe(`${s.key} → ${theirs}`);
            }
        }
    });

    it("each W7 purpose is exercised by at least one scenario", () => {
        for (const f of W7_FIXTURES) {
            expect(Object.values(SCENARIO_FIXTURE), f.key).toContain(f.key);
        }
    });
});

describe("the catalog and the governed fixture describe the same households", () => {
    it("every W7 household, child and adult id is created by the fixture", () => {
        for (const f of W7_FIXTURES) {
            expect(W7_SQL, f.key).toContain(f.customerId);
            for (const c of f.children) expect(W7_SQL, c.name).toContain(c.id);
            for (const p of [...f.responsibleAdults, ...f.eligibleNotResponsible]) expect(W7_SQL, p.name).toContain(p.id);
        }
    });

    it("with the same names", () => {
        for (const f of W7_FIXTURES) {
            expect(W7_SQL).toContain(`'${f.householdLabel}'`);
            for (const c of f.children) expect(W7_SQL).toContain(`'${c.name}'`);
            for (const p of [...f.responsibleAdults, ...f.eligibleNotResponsible]) expect(W7_SQL).toContain(`'${p.name}'`);
        }
    });

    it("unmistakably QA, in the fixture's own id block", () => {
        for (const f of W7_FIXTURES) {
            expect(f.householdLabel).toMatch(/^W7 QA · /);
            expect(f.customerId).toMatch(/^fd000000-0000-4000-8000-0000007c/);
        }
    });

    it("the W7 section only ever inserts, and every insert converges", () => {
        const exec = W7_SQL.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
        expect(exec).not.toMatch(/^\s*(delete|update|truncate)\b/im);
        expect(exec).not.toMatch(/session_replication_role/i);
        const inserts = exec.match(/^\s*insert\s+into\b/gim) ?? [];
        const converging = (exec.match(/on conflict \(id\) do nothing|where not exists/gi) ?? []).length;
        expect(inserts.length).toBeGreaterThan(0);
        expect(converging).toBe(inserts.length);
    });

    it("only the Multi-Site Family carries an account billing calendar", () => {
        const policies = W7_SQL.match(/insert into financial_policies[\s\S]*?;/gi) ?? [];
        expect(policies).toHaveLength(1);
        expect(policies[0]).toMatch(/'customer', :'w7_hh_multi'/);
        expect(policies[0]).toMatch(/"cadence":"monthly"/);
    });

    it("the Split Family is 50/50 with Gale on the account and not responsible", () => {
        const split = W7_FIXTURES.find((f) => f.key === "w7_split")!;
        expect(split.responsibleAdults.map((p) => p.name)).toEqual(["Dana Split", "Rosa Split"]);
        expect(split.eligibleNotResponsible.map((p) => p.name)).toEqual(["Gale Split"]);
        expect(W7_SQL).toMatch(/:'w7_arr_split'::uuid,\s+'person', :'w7_dana'::uuid,\s+'percentage',\s+5000/);
        expect(W7_SQL).toMatch(/:'w7_arr_split'::uuid,\s+'person', :'w7_rosa'::uuid,\s+'percentage',\s+5000/);
        expect(W7_SQL).not.toMatch(/'person', :'w7_gale'/);
        expect(W7_SQL).toMatch(/:'w7_hh_split'::uuid,\s+:'w7_gale'::uuid,\s+'guardian'/);
    });

    it("the legacy households are never torn down on staging unless a reset is asked for", () => {
        expect(SQL).toMatch(/:\{\?legacy_reset\} or not exists/);
        const gate = SQL.indexOf("\\if :legacy_rebuild");
        const replica = SQL.search(/^set local session_replication_role = replica;/m);
        expect(gate).toBeGreaterThan(0);
        expect(replica).toBeGreaterThan(gate);
    });
});
