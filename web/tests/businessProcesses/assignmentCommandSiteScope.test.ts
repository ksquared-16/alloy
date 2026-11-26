/**
 * BP V2 Slice 4A — the shared command boundary enforces an action's declared SITE authority before any
 * handler runs, for every assignment command; the verdict follows the Coverage doctrine.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { assignmentSiteWriteVerdict } from "@/lib/operationalAssignments/assignmentSiteAuthority";
import { runRegisteredAction } from "@/lib/adminV2/actions/actionExecutor";
import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
import type { RegisteredAction } from "@/lib/adminV2/actions/actionTypes";

const R = "site-r";
const L = "site-l";
const scope = (s: "all" | string[]): AdminAccessScopeDimensions =>
    (s === "all"
        ? { departmentScope: "all", allowedDepartmentIds: [], siteScope: "all", allowedSiteLocationIds: [] }
        : { departmentScope: "all", allowedDepartmentIds: [], siteScope: "restricted", allowedSiteLocationIds: s }) as AdminAccessScopeDimensions;

describe("assignmentSiteWriteVerdict — actor scope × touched sites", () => {
    const cases: Array<[string, AdminAccessScopeDimensions | null, Parameters<typeof assignmentSiteWriteVerdict>[1], boolean, string | null]> = [
        ["no scope (trusted internal path)", null, { kind: "sites", sites: [L] }, true, null],
        ["unrestricted", scope("all"), { kind: "sites", sites: [R, L] }, true, null],
        ["restricted R · source R", scope([R]), { kind: "sites", sites: [R] }, true, null],
        ["restricted R · source L", scope([R]), { kind: "sites", sites: [L] }, false, "site_out_of_scope"],
        ["restricted R · source R → target L", scope([R]), { kind: "sites", sites: [R, L] }, false, "site_out_of_scope"],
        ["restricted L · source R → target L", scope([L]), { kind: "sites", sites: [R, L] }, false, "site_out_of_scope"],
        ["restricted R+L · source R → target L", scope([R, L]), { kind: "sites", sites: [R, L] }, true, null],
        ["restricted · nothing resolvable", scope([R]), { kind: "unresolved", reason: "x" }, false, "site_unresolved"],
        ["restricted · empty site list", scope([R]), { kind: "sites", sites: [] }, false, "site_unresolved"],
        ["restricted · a blank site", scope([R]), { kind: "sites", sites: [R, " "] }, false, "site_unresolved"],
        ["restricted to nothing", scope([]), { kind: "sites", sites: [R] }, false, "site_out_of_scope"],
        ["unrestricted · unresolved is the writer's not-found, not a refusal", scope("all"), { kind: "unresolved", reason: "x" }, true, null],
    ];
    it.each(cases)("%s", (_name, actor, resolution, allowed, code) => {
        const v = assignmentSiteWriteVerdict(actor, resolution);
        expect(v.allowed).toBe(allowed);
        expect(v.allowed ? null : v.code).toBe(code);
    });
});

describe("runRegisteredAction enforces the declared site authority before the handler", () => {
    const fake = (verdict: { allowed: boolean }) => {
        const execute = vi.fn(async () => ({ ok: true as const, correlationId: "c", result: { actionKey: "fake", entityType: "child", entityId: "x", affectedId: null } }));
        const resolveEligibility = vi.fn(async () => ({ eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] }));
        const buildPreview = vi.fn(async () => ({ summary: "p" }) as never);
        const authorizeSites = vi.fn(async () => (verdict.allowed ? { allowed: true as const } : { allowed: false as const, code: "site_out_of_scope", message: "no" }));
        const action = {
            ...getRegisteredAction("assignment.archive")!,
            validatePayload: (p: Record<string, unknown> | undefined) => ({ ok: true as const, value: p ?? {} }),
            resolveEligibility, buildPreview, execute, authorizeSites,
        } as unknown as RegisteredAction;
        return { action, execute, resolveEligibility, buildPreview, authorizeSites };
    };

    it("a refusal returns 403 with the code and runs NO eligibility, preview or execute — in both modes", async () => {
        const { action, execute, resolveEligibility, buildPreview } = fake({ allowed: false });
        const spy = vi.spyOn(await import("@/lib/adminV2/actions/actionRegistry"), "getRegisteredAction").mockReturnValue(action);
        for (const mode of ["execute", "preview"] as const) {
            const r = await runRegisteredAction({} as never, { orgId: "o", userId: "u", accessScope: scope([R]) }, { actionKey: "assignment.archive", entityType: "child", entityId: "x", payload: {} }, mode);
            expect(r.ok).toBe(false);
            expect(!r.ok && r.status).toBe(403);
            expect(!r.ok && r.blockers?.[0]?.code).toBe("site_out_of_scope");
        }
        expect(execute).not.toHaveBeenCalled();
        expect(resolveEligibility).not.toHaveBeenCalled();
        expect(buildPreview).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it("an admitted invocation proceeds to the handler exactly as before", async () => {
        const { action, execute } = fake({ allowed: true });
        const spy = vi.spyOn(await import("@/lib/adminV2/actions/actionRegistry"), "getRegisteredAction").mockReturnValue(action);
        const r = await runRegisteredAction({} as never, { orgId: "o", userId: "u", accessScope: scope([R]) }, { actionKey: "assignment.archive", entityType: "child", entityId: "x", payload: {} });
        expect(r.ok).toBe(true);
        expect(execute).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});

describe("every assignment-writing command declares its site authority", () => {
    const KEYS = ["assignment.create", "assignment.change_room", "assignment.set_primary", "assignment.archive", "assignment.promote_proposed", "assignment.delete_proposed", "assignment.set_time", "schedule.create"];
    it.each(KEYS)("%s", (key) => {
        expect(typeof getRegisteredAction(key)?.authorizeSites).toBe("function");
    });

    it("an unrestricted actor is never charged a read (no client is touched)", async () => {
        for (const key of KEYS) {
            const v = await getRegisteredAction(key)!.authorizeSites!({ supabase: {} as never, ctx: { orgId: "o", userId: "u", accessScope: scope("all") }, invocation: { actionKey: key, entityType: "child", entityId: "x", payload: {} }, payload: {} });
            expect(v.allowed).toBe(true);
        }
    });

    it("the scheduling route applies the same authority with the actor's real scope (no more accessScope: null)", () => {
        const route = readFileSync(join(process.cwd(), "app/api/admin/scheduling/route.ts"), "utf8");
        expect(route).toMatch(/authorizeActionSites\(action, scheduleDeps\)/);
        expect(route).toMatch(/accessScope: scopeDimensionsFromAccess\(access\)/);
        expect(route).not.toMatch(/accessScope: null/);
    });
});
