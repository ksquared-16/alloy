/**
 * The public API surface, derived three independent ways so the doc suites can assert parity.
 *
 * ── WHY THIS EXISTS ──
 *
 * Four documentation suites each carried their own hand-written copy of the surface: two nineteen-
 * line lists of `METHOD path`, a `toBe(19)`, and an anchor pinning `{ reads: 11, writes: 7,
 * total: 19 }`. When three lifecycle operations shipped (`enrollments/void`, `placements/cancel`,
 * `schedule-assignments/cancel`) all four went red at once and stayed red — they were asserting a
 * retired surface, not a wrong one, so nothing in the failure said which side to move.
 *
 * Replacing 19 with 22 would have rebuilt exactly that trap. So the expectations are derived:
 *
 *   implementedOperations()  the ROUTE FILES on disk — what actually answers a request
 *   openApiOperations()      the canonical OpenAPI artifact — what is published
 *   catalogOperationIds()    PUBLIC_OPERATIONS — what the runtime authorizes
 *
 * None of the three is the authority for the others, so a change to one and not the rest fails as a
 * parity assertion. Adding a route without publishing it, or publishing one that does not exist,
 * now breaks a test instead of misleading a partner.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { PUBLIC_OPERATIONS, type PublicOperationId } from "@/lib/platform/external/scopeCatalog";

const WEB = path.resolve(__dirname, "../..");
const REPO = path.dirname(WEB);
const V1 = path.join(WEB, "app/api/v1");

export const CANONICAL_OPENAPI = path.join(REPO, "docs/api/openapi/alloy-public-api.v1.json");

/** `GET /api/v1/children` — the identity used to compare the three sources. */
export type OperationKey = string;

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) return routeFiles(full);
        return entry === "route.ts" ? [full] : [];
    });
}

/**
 * What answers a request today, read from the route files.
 *
 * A Next.js route handler is an export named for its method, whether it is written as a function or
 * assigned from a factory — both forms are in use on this surface, so both are recognised.
 */
export function implementedOperations(): OperationKey[] {
    const keys: OperationKey[] = [];
    for (const file of routeFiles(V1)) {
        const source = readFileSync(file, "utf8");
        const route = `/api/v1${path.dirname(file).slice(V1.length)}`;
        for (const method of HTTP_METHODS) {
            const exported = new RegExp(`export\\s+(?:async\\s+function|const)\\s+${method}\\b`).test(source);
            if (exported) keys.push(`${method} ${route}`);
        }
    }
    return keys.sort();
}

/** What is published, read from the canonical OpenAPI artifact. */
export function openApiOperations(): OperationKey[] {
    const doc = JSON.parse(readFileSync(CANONICAL_OPENAPI, "utf8")) as {
        paths: Record<string, Record<string, unknown>>;
    };
    const lower = HTTP_METHODS.map((m) => m.toLowerCase());
    return Object.entries(doc.paths)
        .flatMap(([route, methods]) =>
            Object.keys(methods)
                .filter((m) => lower.includes(m))
                .map((m) => `${m.toUpperCase()} ${route}`),
        )
        .sort();
}

/** What the runtime authorizes, from the scope catalog. */
export function catalogOperationIds(): PublicOperationId[] {
    return (Object.keys(PUBLIC_OPERATIONS) as PublicOperationId[]).sort();
}

/** The operationIds the OpenAPI publishes, for parity against the catalog. */
export function openApiOperationIds(): string[] {
    const doc = JSON.parse(readFileSync(CANONICAL_OPENAPI, "utf8")) as {
        paths: Record<string, Record<string, { operationId?: string }>>;
    };
    const ids: string[] = [];
    for (const methods of Object.values(doc.paths)) {
        for (const op of Object.values(methods)) if (op.operationId) ids.push(op.operationId);
    }
    return ids.sort();
}

export type SurfaceInventory = {
    /** Unauthenticated token exchange: no credential, no scope. */
    token: number;
    /** Token-authenticated self-description: a credential, but no scope. */
    context: number;
    /** Scoped reads. */
    reads: number;
    /** Scoped governed writes. */
    writes: number;
    total: number;
    paths: number;
};

/**
 * Counted from the implemented surface, in the decomposition the documentation states.
 *
 * The two scope-less operations are counted apart from the rest, because they are what the published
 * "ten authenticated reads / ten governed writes" excludes. Folding token exchange in as a write, or
 * `context` in as a read, makes both published counts wrong by one — which is exactly the kind of
 * off-by-one that reads as a documentation error and is not one.
 */
export function surfaceInventory(keys: OperationKey[] = implementedOperations()): SurfaceInventory {
    let token = 0;
    let context = 0;
    let reads = 0;
    let writes = 0;
    for (const key of keys) {
        const [method, route] = key.split(" ");
        if (route.endsWith("/oauth/token")) token += 1;
        else if (route.endsWith("/api/v1/context")) context += 1;
        else if (method === "GET") reads += 1;
        else writes += 1;
    }
    return {
        token,
        context,
        reads,
        writes,
        total: token + context + reads + writes,
        paths: new Set(keys.map((k) => k.split(" ")[1])).size,
    };
}

/** English number words, for prose that spells its counts out. */
export const WORD: Record<number, string> = {
    1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight",
    9: "nine", 10: "ten", 11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen",
    15: "fifteen", 16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen", 20: "twenty",
    21: "twenty-one", 22: "twenty-two", 23: "twenty-three", 24: "twenty-four",
};

/** A count with no word is a bug in this table, not a reason to print a digit into prose. */
export function numberWord(n: number): string {
    const word = WORD[n];
    if (!word) throw new Error(`no English word for ${n} — extend WORD in publicSurfaceInventory.ts`);
    return word;
}
