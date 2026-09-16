/**
 * RL-17 — ANALYTICS TRUTH HAS AN OWNER, AND A PREVIEW IS NOT A WRITE.
 *
 * Eighteen Analytics mutations decided their own authority. Sixteen were reachable through ORG
 * CONTEXT ALONE — portal admission and no capability — so any principal who could enter the portal
 * could create, edit, copy or snapshot the organization's metrics. One asked for the `admin` role
 * title; one asked `requireAdminOrOps()`, which resolves admission and no role.
 *
 * They converge onto the keys the promoted Operational Intelligence model already uses. Nothing was
 * invented: `reports.write` owns Analytics configuration and materialisation, `reports.read` owns
 * inspection, and `canReadAnalytics` accepts EITHER key — so a Writer can read without a second
 * grant, which this lock pins rather than assumes.
 *
 * THE DISTINCTION THIS EXISTS TO HOLD. Two of the eighteen are POSTs that persist nothing:
 * `metrics/[id]/preview` and `organization-calculations/[id]/evaluate` delegate to evaluators with
 * no insert, update, upsert or delete. They take `reports.read`. Gating a computation on
 * `reports.write` because its HTTP verb is POST would withhold a preview from every Reader and
 * change nothing about what the organization knows — and `reports.write` is admin-only, while
 * `reports.read` reaches ops in every organization.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");
const API = path.join(WEB, "app", "api", "admin");
const read = (rel: string) => fs.readFileSync(path.join(API, rel), "utf8");

/** Comments explain; code decides. Prohibitions are asserted against code only. */
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

const INVENTORY = JSON.parse(
    fs.readFileSync(path.join(WEB, "scripts", "routeCapabilities.declared.json"), "utf8"),
) as { routes: Record<string, Record<string, { status: string; capability?: string; helper?: string }>> };

/** Every bounded Analytics mutation, and the owner its operation belongs to. */
const WRITES: [string, string][] = [
    ["analytics/metrics/route.ts", "POST"],
    ["analytics/metrics/[id]/route.ts", "PATCH"],
    ["analytics/metrics/[id]/copy/route.ts", "POST"],
    ["analytics/metrics/[id]/snapshot/route.ts", "POST"],
    ["analytics/placements/route.ts", "POST"],
    ["analytics/placements/[id]/route.ts", "PATCH"],
    ["analytics/rollups/route.ts", "POST"],
    ["analytics/rollups/[id]/route.ts", "PATCH"],
    ["analytics/visualizations/route.ts", "POST"],
    ["analytics/visualizations/[id]/route.ts", "PATCH"],
    ["analytics/visualizations/[id]/copy/route.ts", "POST"],
    ["analytics/surfaces/[surface]/doc/route.ts", "PUT"],
    ["analytics/surfaces/operational-intelligence/doc/route.ts", "PUT"],
    ["metrics/oi-org-calc-measurements/[id]/observe/route.ts", "POST"],
    ["analytics/snapshots/run/route.ts", "POST"],
    ["metrics/snapshots/write/route.ts", "POST"],
];

const READ_LIKE: [string, string][] = [
    ["analytics/metrics/[id]/preview/route.ts", "POST"],
    ["organization-calculations/[id]/evaluate/route.ts", "POST"],
];

/** Dual-path endpoints whose CRON branch is machine auth and must survive untouched. */
const CRON_DUAL = ["analytics/snapshots/run/route.ts", "metrics/snapshots/write/route.ts"];

function handlerBody(src: string, method: string): string {
    const m = new RegExp(`export async function ${method}\\s*\\(`).exec(src);
    if (!m) return "";
    // The parameter list can contain `{` (an inline `context: { params }` type), so match the
    // parens first and only then look for the body brace.
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

describe("RL-17 — Analytics mutations are owned, not merely reachable", () => {
    it("finds the surface it asserts over, so this lock cannot pass by measuring nothing", () => {
        expect(WRITES.length).toBe(16);
        expect(READ_LIKE.length).toBe(2);
        for (const [rel] of [...WRITES, ...READ_LIKE]) {
            expect(fs.existsSync(path.join(API, rel)), `${rel} must exist`).toBe(true);
        }
    });

    it.each(WRITES)("%s %s requires reports.write at its own call site", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method));
        // The CALL inside THIS handler — an import alone must never satisfy a gate.
        expect(body).toMatch(/requireAnalyticsManageAccess\s*\(\s*\)/);
        expect(body).toMatch(/if \(!analyticsAuth\.ok\) return analyticsAuth\.response;/);
    });

    it.each(READ_LIKE)("%s %s requires only reports.read, because it persists nothing", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method));
        expect(body).toMatch(/requireAnalyticsReadAccess\s*\(\s*\)/);
        expect(body).not.toContain("requireAnalyticsManageAccess");
    });

    it.each(READ_LIKE)("%s %s really is read-like — no canonical write in its own body", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method));
        expect(body).not.toMatch(/\.(insert|upsert|delete)\(/);
        expect(body).not.toMatch(/\.update\(/);
    });

    it.each([...WRITES, ...READ_LIKE])("%s %s decides on the grant, never a role title", (rel, method) => {
        const body = codeOnly(handlerBody(read(rel), method));
        expect(body).not.toMatch(/ctx\.role\s*[!=]==\s*["'`](admin|ops)["'`]/);
        expect(body).not.toMatch(/roleKeys/);
        // requireAdminOrOps resolves ADMISSION and no role; it may never be the whole gate here.
        if (/requireAdminOrOps\s*\(/.test(body)) {
            expect(body).toMatch(/requireAnalytics(Manage|Read)Access/);
        }
    });

    it.each([...WRITES, ...READ_LIKE])("%s %s is declared with the owner it enforces", (rel, method) => {
        const entry = INVENTORY.routes[`app/api/admin/${rel}`]?.[method];
        expect(entry?.status).toBe("declared");
        const expected = WRITES.some(([r, m]) => r === rel && m === method) ? "reports.write" : "reports.read";
        expect(entry?.capability).toBe(expected);
    });

    it("keeps the machine-auth branch of the dual-path endpoints", () => {
        // Converging the operator branch must not delete internal cron authentication, which is a
        // separate credential rather than a role title standing in for a capability.
        for (const rel of CRON_DUAL) {
            expect(codeOnly(read(rel))).toContain("isInternalCronAuthorized");
        }
    });

    it("does not re-own the Operational Intelligence routes this programme already promoted", () => {
        // A second Analytics authority over the same operations is the failure mode here.
        const oi = [
            "app/api/admin/metrics/kpi-targets/route.ts",
            "app/api/admin/metrics/oi-config/route.ts",
            "app/api/admin/organization-calculations/route.ts",
        ];
        for (const r of oi) {
            const entry = INVENTORY.routes[r];
            const decl = Object.values(entry).find((e) => e.status === "declared");
            expect(decl?.capability).toBe("reports.write");
        }
    });

    it("invents no Analytics vocabulary", () => {
        for (const [rel] of [...WRITES, ...READ_LIKE]) {
            const src = codeOnly(read(rel));
            expect(src).not.toContain("analytics.manage");
            expect(src).not.toContain("reports.configure");
            expect(src).not.toContain("dashboard.manage");
        }
    });

    it("fails when a new Analytics mutation appears without classification", () => {
        // The completeness property. Every mutating handler under analytics/ must be classified.
        const root = path.join(API, "analytics");
        const found: string[] = [];
        const walk = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, e.name);
                if (e.isDirectory()) walk(abs);
                else if (e.name === "route.ts") {
                    const src = fs.readFileSync(abs, "utf8");
                    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) {
                        if (new RegExp(`export async function ${m}\\b`).test(src)) {
                            found.push(`${path.relative(API, abs).split(path.sep).join("/")}|${m}`);
                        }
                    }
                }
            }
        };
        walk(root);
        const known = new Set([...WRITES, ...READ_LIKE].map(([r, m]) => `${r}|${m}`));
        const unclassified = found.filter((f) => !known.has(f));
        expect(
            unclassified,
            `classify these Analytics mutations as reports.write, reports.read or recorded debt: ${unclassified.join(", ")}`,
        ).toEqual([]);
    });
});
