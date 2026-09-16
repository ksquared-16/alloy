/**
 * RL-19 — A CAPABILITY IN FRONT OF A STRICTER ROLE TITLE IS NOT AN AUTHORITY.
 *
 * `financials/accounts` POST and `financials/accounts/[id]` PATCH were DECLARED `fin.write`, called
 * `assertFinancialsWriteAllowed`, and then ran `ctx.role !== "admin"` immediately afterwards. Every
 * instrument the programme had said those routes were capability-owned: the declaration named the
 * key, the checker's three joins passed, and the helper genuinely enforced. The declaration was
 * still false, because the title behind it refused a custom Financial Writer who held the key while
 * admitting an admin whose package withheld it.
 *
 * That is the defect class the route inventory cannot see. It binds DECLARED authority to a helper
 * call; it has no opinion about what runs NEXT. This lock is the missing half: for every Financials
 * mutation, the EFFECTIVE authority — what the handler actually does, in order — must be the
 * capability and nothing stricter.
 *
 * The same shape was found and repaired in Analytics (`requireAnalyticsV2AdminMutate`) and Workflows
 * (`requireAdmin`). Financials is the third, which is why the generic detector below exists rather
 * than three bespoke assertions.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const API = path.join(WEB, "app", "api", "admin");
const INVENTORY = JSON.parse(
    fs.readFileSync(path.join(WEB, "scripts", "routeCapabilities.declared.json"), "utf8"),
) as { routes: Record<string, Record<string, { status: string; capability?: string; note?: string }>> };

/** Comments explain; code decides. */
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

/** One exported handler's body. The parameter list may contain `{`, so match the parens first. */
function handlerBody(src: string, method: string): string | null {
    const m = new RegExp(`export async function ${method}\\s*\\(`).exec(src);
    if (!m) return null;
    let i = m.index + m[0].length - 1;
    let depth = 0;
    for (; i < src.length; i += 1) {
        if (src[i] === "(") depth += 1;
        else if (src[i] === ")") {
            depth -= 1;
            if (depth === 0) break;
        }
    }
    const b = src.indexOf("{", i);
    depth = 0;
    for (let j = b; j < src.length; j += 1) {
        if (src[j] === "{") depth += 1;
        else if (src[j] === "}") {
            depth -= 1;
            if (depth === 0) return src.slice(b, j + 1);
        }
    }
    return src.slice(b);
}

/** A role TITLE decision — any spelling, either direction. */
const ROLE_TITLE = /ctx\.role\s*[!=]==\s*["'`](admin|ops)["'`]|auth\.role\s*[!=]==\s*["'`](admin|ops)["'`]|roleKeys\s*\.\s*includes/;
/** A Financial capability gate. */
const FIN_GATE = /assertFinancials[A-Za-z]*\s*\(|requireFinancial[A-Za-z]*\s*\(/;

const MUTATIONS = ["POST", "PATCH", "PUT", "DELETE"] as const;

/** Every Financials-family route file, discovered rather than listed. */
function financialsRouteFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const abs = path.join(dir, e.name);
            if (e.isDirectory()) walk(abs);
            else if (e.name === "route.ts") out.push(path.relative(API, abs).split(path.sep).join("/"));
        }
    };
    walk(path.join(API, "financials"));
    walk(path.join(API, "financial"));
    return out.sort();
}

/** Handlers whose DECLARED capability is a fin.* key, wherever they live. */
function declaredFinancialHandlers(): [string, string][] {
    const out: [string, string][] = [];
    for (const [route, methods] of Object.entries(INVENTORY.routes)) {
        for (const [method, decl] of Object.entries(methods)) {
            if (!decl || typeof decl !== "object") continue;
            if (decl.status === "declared" && (decl.capability ?? "").startsWith("fin.")) {
                out.push([route.replace("app/api/admin/", ""), method]);
            }
        }
    }
    return out.sort();
}

describe("RL-19 — declared Financial authority is the EFFECTIVE authority", () => {
    const declared = declaredFinancialHandlers();

    it("finds the surface it asserts over, so this lock cannot pass by measuring nothing", () => {
        expect(declared.length).toBeGreaterThanOrEqual(20);
        expect(financialsRouteFiles().length).toBeGreaterThanOrEqual(10);
    });

    it("no handler declaring a fin.* capability also decides on a role title", () => {
        /*
         * THE GENERIC DETECTOR. This is the assertion the route inventory could not make: a
         * declaration binds to a helper CALL, and says nothing about a stricter check running after
         * it. Any handler that claims a capability and then consults a job title is claiming an
         * authority it does not actually implement.
         */
        const offenders: string[] = [];
        for (const [route, method] of declared) {
            const abs = path.join(API, route);
            if (!fs.existsSync(abs)) continue;
            const body = handlerBody(codeOnly(fs.readFileSync(abs, "utf8")), method);
            if (body && ROLE_TITLE.test(body)) offenders.push(`${method} ${route}`);
        }
        expect(
            offenders,
            `these declare a fin.* capability and then narrow on a role title, which makes the declaration false: ${offenders.join(", ")}`,
        ).toEqual([]);
    });

    it("the two repaired Accounts handlers ask the capability and nothing stricter", () => {
        for (const [route, method] of [
            ["financials/accounts/route.ts", "POST"],
            ["financials/accounts/[id]/route.ts", "PATCH"],
        ] as const) {
            const body = handlerBody(codeOnly(fs.readFileSync(path.join(API, route), "utf8")), method)!;
            expect(body).toMatch(FIN_GATE);
            expect(body).not.toMatch(ROLE_TITLE);
        }
    });

    it("every Financials mutation is capability-gated, portal-reviewed, or explained debt", () => {
        /*
         * Completeness. A new Financials mutation must be classified — it cannot simply appear with
         * no capability and no recorded reason.
         */
        const unexplained: string[] = [];
        for (const route of financialsRouteFiles()) {
            const src = codeOnly(fs.readFileSync(path.join(API, route), "utf8"));
            for (const method of MUTATIONS) {
                const body = handlerBody(src, method);
                if (!body) continue;
                if (FIN_GATE.test(body)) continue;
                const decl = INVENTORY.routes[`app/api/admin/${route}`]?.[method];
                if (decl?.status === "none") continue;            // reviewed, reason recorded
                if (decl?.note) continue;                          // explained debt
                unexplained.push(`${method} ${route}`);
            }
        }
        expect(
            unexplained,
            `classify these Financials mutations: gate them on a fin.* capability, review them as 'none', or record the debt: ${unexplained.join(", ")}`,
        ).toEqual([]);
    });
});

describe("RL-19 — the fin.* distinctions are not collapsed", () => {
    it("money-truth operations keep fin.post rather than generic fin.write", () => {
        for (const route of ["payments/run/route.ts", "payments/[id]/route.ts"]) {
            const entry = INVENTORY.routes[`app/api/admin/${route}`];
            const decl = Object.values(entry ?? {}).find((e) => e?.status === "declared");
            expect(decl?.capability, `${route} posts money truth`).toBe("fin.post");
        }
    });

    it("the destructive commercial-catalogue deletes stay named debt, not silently converged", () => {
        const routes = [
            "addons/[id]/route.ts",
            "pricing-dimension-values/[id]/route.ts",
            "pricing-dimensions/[id]/route.ts",
            "pricing-modes/[id]/route.ts",
            "service-offerings/[id]/route.ts",
            "service-plan-templates/[id]/route.ts",
        ];
        for (const route of routes) {
            const decl = INVENTORY.routes[`app/api/admin/${route}`]?.DELETE;
            expect(decl?.status, `${route} DELETE`).toBe("pending");
            expect(decl?.note ?? "", `${route} DELETE`).toContain("FINANCIAL_DESTRUCTIVE_AUTHORITY_DEBT");
            // ...and it must not have been quietly given the key its siblings hold.
            const body = handlerBody(codeOnly(fs.readFileSync(path.join(API, route), "utf8")), "DELETE")!;
            expect(body).not.toMatch(FIN_GATE);
        }
    });

    it("invents no Financial vocabulary", () => {
        const helper = codeOnly(
            fs.readFileSync(path.join(WEB, "lib", "financials", "financialsPermissions.ts"), "utf8"),
        );
        const keys = [...helper.matchAll(/["'](fin\.[a-z_.]+)["']/g)].map((m) => m[1]);
        for (const k of keys) {
            expect(
                ["fin.read", "fin.write", "fin.post", "fin.adjust", "fin.responsibility", "fin.subsidy"],
                `${k} is not part of the promoted Financials model`,
            ).toContain(k);
        }
    });
});
