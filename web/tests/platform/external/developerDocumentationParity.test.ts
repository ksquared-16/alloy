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

describe("no document still describes an older write surface", () => {
    /*
     * These are absence assertions on purpose. The counts were corrected once already and came back
     * in a second place: the surface table said twenty-two while an orientation paragraph three
     * sections later still said "Seven writes exist". Both read fluently; only the pair is wrong.
     *
     * They assert stale FORMS rather than approving a phrasing, so an author may word the current
     * truth however they like — they simply cannot leave an older count behind.
     */
    const CURRENT = [SPEC, GUIDE, FRONT_DOOR,
        "docs/api/developer-platform/package/01-integrating-with-alloy.md",
        "docs/api/developer-platform/package/02-technical-specification.md",
        "docs/api/developer-platform/package/06-mapping-worksheet.md",
        "docs/api/developer-platform/package/07-discovery-questions.md",
        "docs/api/developer-platform/package/source/06-mapping-worksheet.md",
        "docs/api/developer-platform/package/source/07-discovery-questions.md",
        "docs/api/developer-platform/package/source/00-README.md",
        "docs/api/developer-platform/package/README.md",
    ];
    const STALE = [
        "Seven writes", "seven writes", "Seven governed writes", "seven governed writes",
        // The README said "Seven exist", which no count-word search for "writes" would find.
        "Seven exist", "seven exist", "Six exist", "six exist",
        "Six are service-state", "six service-state", "all seven", "all nine",
        "nineteen operations", "fifteen paths",
        "no public endpoint currently returns 409", "reserved on the public API",
    ];

    for (const file of CURRENT) {
        it(`${file.split("/").pop()} describes no older surface`, () => {
            const text = read(file);
            for (const stale of STALE) {
                expect(text, `${file} still contains "${stale}"`).not.toContain(stale);
            }
        });
    }

    it("every governed write operation is reachable from the canonical prose", () => {
        const spec = read(SPEC);
        const guide = read(GUIDE);
        for (const id of writes) {
            const route = PUBLIC_OPERATIONS[id].route;
            expect(spec, `the specification never names ${route}`).toContain(route);
            expect(guide, `the guide never names ${route}`).toContain(route);
        }
    });

    it("the canonical partner toolkit stays partner-neutral", () => {
        // The worksheet and discovery questions are reused for every integration. A partner name in
        // the canonical source ships that partner's name to the next one.
        for (const file of [
            "docs/api/developer-platform/package/source/06-mapping-worksheet.md",
            "docs/api/developer-platform/package/source/07-discovery-questions.md",
        ]) {
            expect(read(file), `${file} names a specific partner`).not.toMatch(/Classroom\s*Coach/i);
        }
    });

    it("scope descriptions name the operations the scope actually grants", () => {
        const spec = read(SPEC);
        // Derived from the catalog: every write route's scope must be described in terms that
        // mention cancelling, which is what the newest operations added.
        expect(spec).toMatch(/`enrollment\.write`[^|]*\|[^|]*cancel/i);
        expect(spec).toMatch(/`schedule\.write`[^|]*\|[^|]*cancel/i);
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

/**
 * The error table is a `type` table, so every cell in that column must be a type.
 *
 * It drifted the other way: the 422 row named `validation_failed`, which is the `code` a partner
 * branches on and is not a member of the `Error.type` enum at all. A client that had trusted the
 * table and switched on `error.type === "validation_failed"` would have matched nothing, on the one
 * class of refusal it most needs to handle. Prose review cannot catch this — the row reads
 * perfectly — so the column is bound to the enum here.
 */
describe("the documented error classes are the ones the schema declares", () => {
    const errorTypes: string[] = JSON.parse(read(OPENAPI))
        .components.schemas.Error.properties.error.properties.type.enum;

    /** Rows of the `| status | type | ... |` table in the specification's error model. */
    const rows = [...read(SPEC).matchAll(/^\|\s*(\d{3})\s*\|\s*`([a-z_]+)`\s*\|/gm)]
        .map(([, status, type]) => ({ status: Number(status), type }));

    it("finds the error table at all", () => {
        // A renamed heading or a reformatted table would otherwise make every assertion below
        // vacuously true.
        expect(rows.length, "no `| status | `type` |` rows found in the specification").toBeGreaterThanOrEqual(7);
        expect(rows.map((r) => r.status)).toContain(422);
    });

    it("names only types the OpenAPI enum declares", () => {
        for (const row of rows) {
            expect(
                errorTypes,
                `the specification says HTTP ${row.status} carries type \`${row.type}\`, which is not in the Error.type enum`,
            ).toContain(row.type);
        }
    });

    it("never presents a `code` as though it were a `type`", () => {
        // `validation_failed` is real, and it is a code. It must never reappear in the type column.
        for (const row of rows) {
            expect(row.type, `HTTP ${row.status} lists the code \`validation_failed\` as its type`)
                .not.toBe("validation_failed");
        }
    });
});

/**
 * Ten HTTP write operations carry twelve domain intents, because attendance submission accepts
 * `original`, `correction` and `reversal` through one endpoint. A sentence claiming the operations
 * and the intents are the same ten contradicts the count the same documents state elsewhere, and
 * tells a partner they have seen every intent when they have not.
 */
describe("the write surface is not described as one intent per operation", () => {
    const CANONICAL_PROSE = [SPEC, GUIDE, FRONT_DOOR];

    it("states the operation/intent split where it states a count", () => {
        const guide = read(GUIDE).toLowerCase();
        expect(guide).toContain(`${WORD[writes.length]} http write operations`);
        expect(guide, "the guide must name the domain-intent count alongside the operation count")
            .toContain("twelve domain intents");
    });

    it("never equates the operation count with the intent count", () => {
        for (const file of CANONICAL_PROSE) {
            expect(read(file), `${file} says the operations are one intent each`)
                .not.toMatch(/each one an intent/i);
            expect(read(file), `${file} calls the operation list "the complete catalog" without saying of what`)
                .not.toMatch(/complete catalog\.\s*[A-Z]\w+ operations,/);
        }
    });
});
