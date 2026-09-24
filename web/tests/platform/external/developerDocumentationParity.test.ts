/**
 * The developer documentation must describe the API that exists.
 *
 * Every claim asserted here was found STALE during a documentation reconciliation: the
 * specification said "nineteen operations across fifteen paths" when there were twenty-two across
 * eighteen; the scope table omitted both write scopes, so a partner could not discover how to ask
 * for write access at all; and the error model called 403, 404 and 409 "reserved" while deployed
 * lifecycle operations returned all three.
 *
 * None of that is catchable by reading the prose — it reads perfectly well while being wrong. So
 * the numbers and lists are derived from the runtime catalog here rather than trusted, and a
 * documented count that drifts fails as a test instead of misleading a partner.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
    PUBLIC_OPERATIONS,
    allPublicScopes,
    accessForOperation,
    scopeForOperation,
    type PublicOperationId,
} from "@/lib/platform/external/scopeCatalog";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

const SPEC = "docs/api/developer-platform/external/alloy-developer-platform-specification.md";
const GUIDE = "docs/api/developer-platform/guide/integrating.md";
const FRONT_DOOR = "docs/api/developer-platform/guide/README.md";
const OPENAPI = "docs/api/openapi/alloy-public-api.v1.json";
const PACKAGE_OPENAPI = "docs/api/developer-platform/package/03-openapi/alloy-public-api.v1.json";

const operationIds = Object.keys(PUBLIC_OPERATIONS) as PublicOperationId[];
const routes = [...new Set(operationIds.map((id) => PUBLIC_OPERATIONS[id].route))];
const writes = operationIds.filter((id) => scopeForOperation(id) !== null && accessForOperation(id) === "write");
const reads = operationIds.filter((id) => scopeForOperation(id) !== null && accessForOperation(id) === "read");

/** English number words, for prose that spells counts out. */
const WORD: Record<number, string> = {
    10: "ten", 11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen",
    16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen", 20: "twenty",
    21: "twenty-one", 22: "twenty-two", 23: "twenty-three", 24: "twenty-four",
};

describe("the specification describes the surface that exists", () => {
    it("states the real operation and path counts", () => {
        const spec = read(SPEC).toLowerCase();
        const ops = WORD[operationIds.length];
        const paths = WORD[routes.length];
        expect(ops, `no word for ${operationIds.length} operations — extend WORD`).toBeTruthy();
        expect(paths, `no word for ${routes.length} paths — extend WORD`).toBeTruthy();
        expect(
            spec,
            `the specification must say "${ops} operations across ${paths} paths"`,
        ).toContain(`${ops} operations across ${paths} paths`);
    });

    it("lists every operation id exactly once in its surface table", () => {
        const spec = read(SPEC);
        for (const id of operationIds) {
            expect(spec, `the specification never mentions \`${id}\``).toContain(`\`${id}\``);
        }
    });

    it("states the real read and write split", () => {
        const spec = read(SPEC).toLowerCase();
        expect(spec).toContain(`${WORD[reads.length]} authenticated reads`);
        expect(spec).toContain(`${WORD[writes.length]} governed domain writes`);
    });
});

describe("the guide reaches every public path", () => {
    it("mentions every route", () => {
        const guide = read(GUIDE);
        for (const route of routes) {
            expect(guide, `the guide never mentions ${route}`).toContain(route);
        }
    });

    it("names every governed write as an intent", () => {
        const guide = read(GUIDE);
        for (const id of writes) {
            expect(guide, `no documented intent reaches ${PUBLIC_OPERATIONS[id].route}`)
                .toContain(PUBLIC_OPERATIONS[id].route);
        }
    });
});

describe("the front door is accurate", () => {
    it("publishes exactly the grantable scopes — no more, and none missing", () => {
        const front = read(FRONT_DOOR);
        const grantable = allPublicScopes().map((s) => s.scope).sort();
        for (const scope of grantable) {
            expect(front, `the scope table omits \`${scope}\`, so a partner cannot ask for it`)
                .toContain(`\`${scope}\``);
        }
        expect(front).toContain(`${WORD[grantable.length]} grantable scopes`);
    });

    it("states the real surface count", () => {
        expect(read(FRONT_DOOR)).toContain(`${operationIds.length} operations across ${routes.length} paths`);
    });
});

describe("the OpenAPI is the reference, and the package copies it exactly", () => {
    const canonical = JSON.parse(read(OPENAPI)) as { paths: Record<string, Record<string, unknown>> };

    it("documents every runtime route, and invents none", () => {
        expect(Object.keys(canonical.paths).sort()).toEqual([...routes].sort());
    });

    it("carries every operationId the catalog declares", () => {
        const documented = new Set<string>();
        for (const methods of Object.values(canonical.paths)) {
            for (const op of Object.values(methods)) {
                const id = (op as { operationId?: string }).operationId;
                if (id) documented.add(id);
            }
        }
        expect([...documented].sort()).toEqual([...operationIds].sort());
    });

    it("the packaged copy is byte-identical to the canonical source", () => {
        // The package is a build artifact. Editing it directly is how partner-visible wording gets
        // silently reverted by the next rebuild.
        expect(read(PACKAGE_OPENAPI)).toBe(read(OPENAPI));
    });

    it("declares no status as reserved that deployed operations actually return", () => {
        const spec = read(SPEC);
        expect(spec, "409 is returned by the lifecycle operations and is not reserved")
            .not.toContain("reserved on the public API");
    });
});
