/**
 * EVERY MUTATING SCHEDULE SURFACE ENFORCES THE SAME AUTHORITY.
 *
 * `scheduling.write` governed `schedules` POST, `schedules/[id]` PATCH, `schedules/[id]/location` PATCH
 * and `schedules/[id]/cancel` POST — but NOT `schedules/[id]/reschedule` POST, and not
 * `admin/scheduling` POST. Both enforced only `getAdminContextCached()`: an authenticated session with
 * org membership. So cancelling a visit required a capability and MOVING one did not, and since the
 * Operations temporal convergence `admin/scheduling` POST commits a supersession of effective-dated
 * child schedule truth.
 *
 * The inconsistency is what made this worth locking rather than just fixing. A capability that governs
 * three siblings and not the fourth reads, in review, as though the area is covered.
 *
 * Source-level on purpose: this is a question about which gate EXISTS in a handler, and a behavioural
 * test cannot distinguish "the caller happened to be an admin" from "the route checks".
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../..");
const API = join(WEB, "app/api");
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/** Session admission alone. Real authority, but not a capability and not a role. */
const SESSION_ONLY = /getAdminContextCached|getAdminAccessContextCached/;
const CAPABILITY = /requireSchedulingJobsCapability|requireCapability|assertCapability|hasCapability/;
const ROLE = /requireAdminOrOps|requireAdmin\b|requireOps\b|requireRole/;
const EXTERNAL = /externalOperationRoute|resolveAccessTokenPrincipal|requireScope/;

function walk(dir: string, out: string[] = []): string[] {
    let entries: string[] = [];
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const e of entries) {
        if (e === "node_modules" || e.startsWith(".")) continue;
        const full = join(dir, e);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\/route\.tsx?$/.test(full)) out.push(full);
    }
    return out;
}

/**
 * The body of one exported handler, so an IMPORT of a gate helper cannot be mistaken for a CALL to it.
 *
 * An earlier version of this test matched the whole file and passed when the gate call was deleted,
 * because the import line still named the helper. That is a false green of exactly the kind this file
 * exists to prevent, so the check is scoped to the handler.
 */
function handlerBody(src: string, method: string): string {
    const start = src.search(
        new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${method}\\b`),
    );
    if (start < 0) return "";
    const rest = src.slice(start + 1);
    const next = rest.search(/\nexport\s+(async\s+)?(function|const)\s+[A-Za-z_]/);
    return next < 0 ? rest : rest.slice(0, next);
}

function exportedWriteMethods(src: string): string[] {
    return WRITE_METHODS.filter(
        (m) =>
            new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${m}\\b`).test(src)
            || new RegExp(`export\\s*\\{[^}]*\\b${m}\\b`).test(src),
    );
}

/** Handlers that mutate `schedules` or `schedule_assignments` directly, or commit a schedule decision. */
function schedulingWriteRoutes(): Array<{ path: string; methods: string[]; src: string }> {
    const out: Array<{ path: string; methods: string[]; src: string }> = [];
    for (const file of walk(API)) {
        const rel = relative(WEB, file);
        if (!/\/(schedules|scheduling|schedule-assignments|schedule-patterns)(\/|$)/.test(rel)) continue;
        const src = readFileSync(file, "utf8");
        const methods = exportedWriteMethods(src);
        if (methods.length) out.push({ path: rel, methods, src });
    }
    return out;
}

describe("scheduling write authority", () => {
    const routes = schedulingWriteRoutes();

    it("finds the schedule write surfaces, so a parser failure cannot report a clean census", () => {
        const paths = routes.map((r) => r.path);
        expect(routes.length).toBeGreaterThan(4);
        expect(paths).toContain("app/api/admin/scheduling/route.ts");
        expect(paths).toContain("app/api/admin/schedules/[id]/reschedule/route.ts");
        expect(paths).toContain("app/api/admin/schedules/[id]/cancel/route.ts");
    });

    it("the two converged surfaces enforce scheduling.write, not session admission alone", () => {
        for (const path of [
            "app/api/admin/scheduling/route.ts",
            "app/api/admin/schedules/[id]/reschedule/route.ts",
        ]) {
            const route = routes.find((r) => r.path === path);
            expect(route, `${path} not found`).toBeTruthy();
            const body = handlerBody(route!.src, "POST");
            expect(body, `${path} has no POST body to inspect`).not.toBe("");
            expect(
                CAPABILITY.test(body),
                `${path} POST lost its capability gate. It mutates schedule truth, and its siblings `
                    + "have required scheduling.write for months; session admission alone let any "
                    + "portal member commit the change.",
            ).toBe(true);
            expect(body).toMatch(/SCHEDULING_WRITE/);
        }
    });

    it("no schedule write surface is left with session admission as its only authority", () => {
        const offenders = routes
            .flatMap((r) =>
                r.methods.map((m) => ({ path: r.path, method: m, body: handlerBody(r.src, m) })),
            )
            .filter((h) => {
                if (!h.body) return false;
                const hasReal = CAPABILITY.test(h.body) || ROLE.test(h.body) || EXTERNAL.test(h.body);
                // `externalOperationRoute` wraps the whole module rather than appearing in a handler.
                const wrapped = EXTERNAL.test(h.body) || /externalOperationRoute/.test(h.body);
                return !hasReal && !wrapped && SESSION_ONLY.test(h.body);
            })
            .map((h) => `${h.path} [${h.method}]`);
        expect(
            offenders,
            "a schedule mutation is reachable by any authenticated org member. Bind it to the authority "
                + "its siblings use (scheduling.write via requireSchedulingJobsCapability) rather than "
                + "leaving portal admission as the control.",
        ).toEqual([]);
    });

    it("admin/scheduling POST gates BOTH of its authorities, one per branch", () => {
        /*
         * One key here would be wrong, not merely coarse. The handler forks: one branch creates a visit
         * in `schedules`, the other edits a child's enrollment participation through the same
         * `applyChildParticipationEdit` that `admin/child-participation` POST calls. Authority follows
         * the business consequence, and `assignments-authority-model-debt.md` rules explicitly that
         * `scheduling.write` does not own child-agreement scheduling.
         */
        const src = readFileSync(join(API, "admin/scheduling/route.ts"), "utf8");
        const body = handlerBody(src, "POST");
        expect(body).toMatch(/requireSchedulingJobsCapability/);
        expect(body).toMatch(/SCHEDULING_WRITE/);
        expect(
            /requireEnrollmentCapability/.test(body) && /ENROLLMENT_RECORD_MANAGE/.test(body),
            "the participation branch lost its enrollment authority. It edits a child's participation "
                + "and now supersedes effective-dated schedule truth; scheduling.write does not own that.",
        ).toBe(true);
    });

    it("the conditional owner is recorded as debt rather than understated as one capability", () => {
        const declared = JSON.parse(
            readFileSync(join(WEB, "scripts/routeCapabilities.declared.json"), "utf8"),
        ) as {
            ROUTE_INVENTORY_CONDITIONAL_OWNER_DEBT?: { entries?: Array<Record<string, unknown>> };
        };
        const entries = declared.ROUTE_INVENTORY_CONDITIONAL_OWNER_DEBT?.entries ?? [];
        const entry = entries.find(
            (e) => e.route === "app/api/admin/scheduling/route.ts" && e.method === "POST",
        );
        expect(
            entry,
            "the one-capability-per-method table cannot express this handler's fork, so the second "
                + "authority must be recorded as a known debt rather than left invisible.",
        ).toBeTruthy();
        expect(entry!.also_requires).toBe("enrollment.record.manage");
    });

    it("the declared capability table agrees with the source for both converged surfaces", () => {
        // A declaration that drifts from the handler is how the original gap read as covered.
        const declared = JSON.parse(
            readFileSync(join(WEB, "scripts/routeCapabilities.declared.json"), "utf8"),
        ) as { routes: Record<string, Record<string, { status?: string; capability?: string }>> };
        for (const path of [
            "app/api/admin/scheduling/route.ts",
            "app/api/admin/schedules/[id]/reschedule/route.ts",
        ]) {
            const entry = declared.routes[path]?.POST;
            expect(entry?.status, `${path} POST should be declared`).toBe("declared");
            expect(entry?.capability, `${path} POST should declare scheduling.write`).toBe(
                "scheduling.write",
            );
        }
    });
});
