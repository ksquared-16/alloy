/**
 * One story, told the same way everywhere.
 *
 * ── WHY THIS EXISTS ──
 *
 * Every document in the package was individually correct when it was written. What went wrong is
 * that the surface grew: six lifecycle operations and two scopes arrived, and sentences like
 * "there is exactly one write" and "the eleven grantable scopes" quietly became false in four
 * files at once. Fixing one document while another still tells a partner the old contract is the
 * failure this suite prevents.
 *
 * So the counts are DERIVED from the runtime contract and the runtime catalog, never written down
 * here. When the surface changes again, this fails until the prose catches up — which is the point.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { allPublicScopes, allKnownScopes } from "@/lib/platform/external/scopeCatalog";
import {
    CANONICAL_OPENAPI,
    catalogOperationIds,
    implementedOperations,
    numberWord,
    openApiOperationIds,
    openApiOperations,
    surfaceInventory,
} from "../support/publicSurfaceInventory";
import { RATE_LIMIT_POLICY } from "@/lib/platform/external/rateLimit";

const WEB = path.resolve(__dirname, "../..");
const REPO = path.dirname(WEB);
const PKG = path.join(REPO, "docs/api/developer-platform/package");
/*
 * Counts are DERIVED, never pinned.
 *
 * This file used to anchor on `{ token: 1, reads: 11, writes: 7, total: 19 }`. When three lifecycle
 * operations shipped the anchor went red and stayed red, asserting a surface that had been retired
 * rather than a surface that was wrong — and replacing 19 with 22 would only have re-armed the trap
 * for the next operation. The expectation now comes from the implemented route files, and the
 * published artifact is checked against them.
 */
const inventory = surfaceInventory();
const word = numberWord;

/** The published artifact itself, for the scope and parameter claims asserted further down. */
const spec = JSON.parse(readFileSync(CANONICAL_OPENAPI, "utf8")) as {
    paths: Record<string, Record<string, { "x-required-scope"?: string }>>;
};

const read = (rel: string) => readFileSync(path.join(PKG, rel), "utf8");
const COVER = "README.md";
const GUIDE = "01-integrating-with-alloy.md";
const SPEC = "02-technical-specification.md";

describe("the package tells one consistent story", () => {
    it("the published artifact describes exactly the implemented surface", () => {
        // Neither side is the authority for the other, so publishing an operation that does not
        // exist — or shipping one and not publishing it — fails here rather than reaching a partner.
        expect(openApiOperations()).toEqual(implementedOperations());
        expect(openApiOperationIds()).toEqual(catalogOperationIds());
    });

    it("the specification states the measured operation counts", () => {
        const body = read(SPEC).toLowerCase();
        expect(body).toContain(`${word(inventory.total)} operations across ${word(inventory.paths)} paths`);
        expect(body, "the read count must be stated").toContain(`**${word(inventory.reads)} authenticated reads**`);
        expect(body, "the write count must be stated").toContain(`**${word(inventory.writes)} governed domain writes**`);
    });

    it("the specification states the measured grantable scope count", () => {
        expect(read(SPEC).toLowerCase()).toContain(`the ${word(allPublicScopes().length)} grantable scopes`);
    });

    it("every grantable scope appears in the specification's scope table", () => {
        const body = read(SPEC);
        for (const definition of allPublicScopes()) {
            expect(body, `the specification never lists \`${definition.scope}\``).toContain(`\`${definition.scope}\``);
        }
    });

    it("context.read is documented as retired, and never as grantable", () => {
        const body = read(SPEC);
        expect(body).toContain("There is no `context.read` in the grant model");
        // Still recognised at runtime, for installations that already hold it.
        expect(allKnownScopes().some((d) => d.scope === "context.read")).toBe(true);
        expect(allPublicScopes().some((d) => d.scope === "context.read")).toBe(false);
    });

    it("documents the real rate-limit policy, and the independence of the classes", () => {
        const body = read(SPEC);
        for (const [label, policy] of [
            ["Token exchange", RATE_LIMIT_POLICY.tokenExchange],
            ["Authenticated reads", RATE_LIMIT_POLICY.authenticatedRead],
            ["Authenticated governed writes", RATE_LIMIT_POLICY.authenticatedWrite],
        ] as const) {
            expect(body, `${label} is missing from the rate table`).toContain(
                `| ${label} | ${policy.limit} | ${policy.windowSeconds} s |`,
            );
        }
        /*
         * The claim that actually matters, and it is now the opposite of what it once was: each
         * class holds its own counter, proven over HTTP in rateLimitClasses.live.test.ts. If that
         * separation were ever undone, this wording would become false in a way a partner would
         * have designed around.
         */
        expect(body).toMatch(/three independent budgets/i);
        expect(body).toMatch(/Reading does not consume write capacity/i);
        expect(read(GUIDE)).toMatch(/independent\s*\n?\s*rate budgets/i);
    });

    it("no document still describes the retired shared counter", () => {
        for (const file of [COVER, GUIDE, SPEC]) {
            expect(read(file), `${file} still describes a shared counter`).not.toMatch(/share one counter/i);
            expect(read(file), `${file} still warns about reads spending writes`).not.toMatch(
                /reads? .{0,40}spending the write budget/i,
            );
        }
    });

    it("teaches sync_token between passes, and never the stale rewind", () => {
        const guide = read(GUIDE);
        const specBody = read(SPEC);
        for (const [name, body] of [[GUIDE, guide], [SPEC, specBody]] as const) {
            expect(body, `${name} still teaches rewinding a checkpoint`).not.toMatch(/rewind your checkpoint/i);
            expect(body, `${name} still teaches remembering updated_at`).not.toMatch(
                /remember the (newest|highest) `?updated_at/i,
            );
            expect(body, `${name} must teach since_token`).toMatch(/since_token/);
        }
        // The quickstart specifically — it was the last place the old advice survived.
        expect(specBody).toMatch(/store the `sync_token` from\s*\n?\s*the last page you durably processed/i);
        // And updated_since must remain in the contract as the time-based tool.
        expect(specBody).toMatch(/updated_since/);
    });

    it("no global statement survives that was only ever true of Attendance", () => {
        const STALE = [
            /there is exactly one write/i,
            /the (public )?api has exactly one write/i,
            /the one write is/i,
            /\beleven grantable scopes\b/i,
            /three endpoints exist/i,
        ];
        for (const file of [COVER, GUIDE, SPEC]) {
            const body = read(file);
            for (const pattern of STALE) {
                expect(pattern.test(body), `${file} still says ${pattern}`).toBe(false);
            }
        }
    });

    it("keeps the Attendance-scoped claims that are still true", () => {
        const body = read(SPEC);
        expect(body).toMatch(/append-only/i);
        expect(body).toMatch(/Attendance's \*\*only\*\* write/i);
        expect(body).toMatch(/no `PUT`, no `PATCH` and no `DELETE`/);
    });

    it("the contract's own parameter guidance prefers since_token", () => {
        let checked = 0;
        for (const ops of Object.values(spec.paths)) {
            for (const op of Object.values(ops) as Array<{ parameters?: Array<{ name: string; description?: string }> }>) {
                for (const parameter of op.parameters ?? []) {
                    if (parameter.name === "since_token") {
                        expect(parameter.description).toMatch(/prefer this for incremental/i);
                        checked += 1;
                    }
                    if (parameter.name === "updated_since") {
                        expect(parameter.description).toMatch(/time-based/i);
                        expect(parameter.description).toMatch(/prefer `since_token`/i);
                    }
                }
            }
        }
        expect(checked, "no collection documented a sync token").toBeGreaterThan(0);
    });

    it("every documented operation still declares the scope the catalog requires", () => {
        const grantable = new Set(allPublicScopes().map((d) => d.scope));
        for (const [p, ops] of Object.entries(spec.paths)) {
            for (const [method, op] of Object.entries(ops)) {
                const required = op["x-required-scope"];
                if (!required) {
                    expect([`/api/v1/oauth/token`, `/api/v1/context`], `${method} ${p} has no scope`).toContain(p);
                    continue;
                }
                expect(grantable.has(required), `${method} ${p} requires ungrantable ${required}`).toBe(true);
            }
        }
    });

    it("the package on disk is the one these assertions read", () => {
        for (const file of [COVER, GUIDE, SPEC, "03-openapi/alloy-public-api.v1.json"]) {
            expect(existsSync(path.join(PKG, file)), `missing ${file}`).toBe(true);
        }
    });
});
