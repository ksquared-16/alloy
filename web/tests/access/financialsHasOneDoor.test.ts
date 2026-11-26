/**
 * FINANCIAL DATA HAS ONE DOOR, AND IT IS `fin.read`.
 *
 * ── THE GAP THIS CLOSES ──
 *
 * The promoted Financials Workspace enforced `fin.read` on its five read routes and the role editor
 * now offers "View Financials" as a control an organization sets. Meanwhile `/financials/ledger`,
 * `/journal-entries`, `/statements`, `/snapshot`, `/accounts`, `/tuition-plans`, the household card
 * and the charge preview returned the same money to any principal the portal admitted — no role
 * test, no grant test, because `getAdminContextCached` resolves admission and stops.
 *
 * So "this role cannot see Financials" was true of the workspace and false of the data. A control
 * that claims to withhold financial information while a second door serves it is worse than no
 * control: an administrator sets it, believes it, and is wrong.
 *
 * ── WHY THE ASSERTION IS OVER THE DIRECTORY AND NOT OVER A LIST ──
 *
 * A list of routes to check is a list somebody must remember to extend, and the next financial read
 * route added would be exempt by omission — which is exactly how the first eight came to be exempt.
 * This walks the tree instead: every exported handler under the Financials API surface must be
 * accounted for, either by declaring a Financials capability or by appearing below with a reason.
 * Adding a route with neither fails here.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const TABLE = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "web/scripts/routeCapabilities.declared.json"), "utf8"),
) as { routes: Record<string, Record<string, { status: string; capability?: string; helper?: string }>> };

/**
 * THE GATES THAT SATISFY EACH CAPABILITY, and the argument each must carry.
 *
 * Two shapes are canonical. `assertFinancials*Allowed` carries the capability in its NAME, so the
 * name is the proof and there is no argument to check. `requireFinancialsCapability` takes the
 * capability as an argument — it is the shape the fin.read permission read was moved to when that
 * read went from 211 ms to 0.2 ms — so the name proves nothing and the argument is the proof.
 *
 * A helper absent from this table cannot satisfy a Financials declaration, which is the property
 * that stops a route claiming the capability via some other module that happens to mention the key.
 */
const FINANCIALS_GATES: Record<string, Record<string, string | null>> = {
    "fin.read": {
        assertFinancialsReadAllowed: null,
        requireFinancialsCapability: "FINANCIALS_READ_PERMISSION_KEY",
    },
    "fin.write": {
        assertFinancialsWriteAllowed: null,
        requireFinancialsCapability: "FINANCIALS_WRITE_PERMISSION_KEY",
    },
};

/** Comments and string bodies blanked, so a mention can never read as a call. */
const executable = (src: string) =>
    src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

/** The API surface that serves financial records. */
const FINANCIALS_API = "web/app/api/admin/financials";

/**
 * Handlers under that surface that legitimately hold no Financials capability, each with the reason.
 *
 * Kept deliberately short. An entry here is a claim that the route serves no financial information,
 * and it is checkable by reading the handler — not a place to park a conversion nobody did.
 */
const REASONED_EXEMPTIONS: Record<string, string> = {};

function handlerMethods(source: string): string[] {
    return [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\s*\(/g)].map((m) => m[1]!);
}

function walk(dir: string, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.name === "route.ts") out.push(full);
    }
    return out;
}

const ROUTE_FILES = walk(path.join(REPO_ROOT, FINANCIALS_API));

describe("the Financials API surface", () => {
    it("is a real surface — the walk found it", () => {
        // Non-vacuity: an instrument that discovered nothing would pass every assertion below.
        expect(ROUTE_FILES.length).toBeGreaterThan(8);
    });

    it("declares a Financials capability on every handler that serves financial records", () => {
        const undeclared: string[] = [];
        for (const file of ROUTE_FILES) {
            const rel = path.relative(path.join(REPO_ROOT, "web"), file).replace(/\\/g, "/");
            const source = fs.readFileSync(file, "utf8");
            const entry = TABLE.routes[rel] ?? {};
            for (const method of handlerMethods(source)) {
                const key = `${rel}:${method}`;
                if (key in REASONED_EXEMPTIONS) continue;
                const declared = entry[method];
                const capability = declared?.capability ?? "";
                if (!capability.startsWith("fin.")) undeclared.push(`${key} → ${declared?.status ?? "absent"}`);
            }
        }
        expect(
            undeclared,
            "these Financials handlers serve financial records without declaring a Financials capability — "
                + "a role withheld from Financials can read them",
        ).toEqual([]);
    });

    /*
     * A DECLARATION IS A CHECKED CLAIM, NOT A COMMENT. The declaration lock binds each entry to
     * source by three joins; this adds the one property that is specific to Financials — the helper
     * named is the Financials one, so a route cannot satisfy the table with some other module that
     * happens to mention the key.
     */
    it("names the Financials gate, and the handler calls it", () => {
        for (const file of ROUTE_FILES) {
            const rel = path.relative(path.join(REPO_ROOT, "web"), file).replace(/\\/g, "/");
            const source = fs.readFileSync(file, "utf8");
            for (const [method, decl] of Object.entries(TABLE.routes[rel] ?? {})) {
                if (!decl.capability?.startsWith("fin.")) continue;
                const gate = FINANCIALS_GATES[decl.capability];
                expect(
                    gate ? Object.keys(gate) : [],
                    `${rel}:${method} declares ${decl.capability}, which names no Financials gate`,
                ).not.toEqual([]);
                expect(
                    Object.keys(gate ?? {}),
                    `${rel}:${method} declares ${decl.capability} with the wrong helper`,
                ).toContain(decl.helper);
                /*
                 * The helper must be CALLED, not merely mentioned. Both helper names appear in these
                 * routes' own comments and both survive as imports after a call is deleted, so a
                 * substring test passes on a route whose gate has been removed outright.
                 */
                const code = executable(source);
                const helper = decl.helper ?? "\u0000";
                expect(
                    new RegExp(`\\b${helper}\\s*\\(`).test(code),
                    `${rel}:${method} declares ${helper} and does not call it`,
                ).toBe(true);
                /*
                 * ── AND THE CAPABILITY IT IS CALLED WITH ─────────────────────────────────────────
                 *
                 * `assertFinancialsReadAllowed` could only ever allow reading: the capability was in
                 * its name, so naming the helper settled the question. `requireFinancialsCapability`
                 * takes the capability as an ARGUMENT, so its name settles nothing — the same call
                 * gates read or write depending on what is passed.
                 *
                 * Without this, a route could declare `fin.read`, call the right helper, and hand it
                 * the write key (or the reverse: a mutation gated only by the read key, which is the
                 * precise failure "WRITE IS NOT READ" below exists to prevent). The lock checks the
                 * argument wherever the helper takes one.
                 */
                const argument = gate?.[helper];
                if (argument) {
                    expect(
                        new RegExp(`\\b${helper}\\s*\\([^)]*\\b${argument}\\b`).test(code),
                        `${rel}:${method} declares ${decl.capability} but does not pass ${argument} to ${helper}`,
                    ).toBe(true);
                }
            }
        }
    });

    /*
     * WRITE IS NOT READ. A mutation declaring `fin.read` would let a viewer change the books, and it
     * is the mistake a mechanical conversion makes — every handler gets the read helper because most
     * of them needed it.
     */
    it("gates mutations on fin.write, not on fin.read", () => {
        for (const file of ROUTE_FILES) {
            const rel = path.relative(path.join(REPO_ROOT, "web"), file).replace(/\\/g, "/");
            for (const [method, decl] of Object.entries(TABLE.routes[rel] ?? {})) {
                if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) continue;
                if (!decl.capability?.startsWith("fin.")) continue;
                expect(decl.capability, `${rel}:${method} is a mutation gated on a read capability`).not.toBe(
                    "fin.read",
                );
            }
        }
    });
});
