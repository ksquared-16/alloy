import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { offersFinancialsSurface } from "@/lib/access/financialsSurfaceVisibility";
import {
    RESOLVED_UNION_BASIS_LABEL,
    WORKSPACE_SURFACE_KEYS,
    WORKSPACE_VISIBILITY_SURFACES,
    resolveWorkspaceVisibility,
    workspaceSurfaceRendered,
    workspaceVisibilityFromAdminAuth,
    type HeldRoleGrants,
} from "@/lib/access/workspaceVisibility";

const ME = { userId: "user-1", orgId: "org-1" };
const perRole = (...roles: HeldRoleGrants[]) => ({ kind: "per_role" as const, roles });
const role = (roleKey: string, grantedPermissionKeys: string[] | null): HeldRoleGrants => ({ roleKey, grantedPermissionKeys });
const states = (v: ReturnType<typeof resolveWorkspaceVisibility>) =>
    Object.fromEntries(WORKSPACE_SURFACE_KEYS.map((k) => [k, v.surfaces[k].state]));

describe("S5 workspace visibility — role defaults from held-role grants", () => {
    it("a held role that grants a workspace's read capability shows it, naming the role", () => {
        const v = resolveWorkspaceVisibility({ principal: ME, grants: perRole(role("bookkeeper", ["fin.read"])) });
        expect(v.surfaces.financials).toEqual({ state: "shown", shownBy: ["bookkeeper"] });
        expect(v.surfaces.inbox.state).toBe("hidden_by_role_default");
        expect(v.surfaces.analytics.state).toBe("hidden_by_role_default");
    });

    it("multiple held roles combine as a union, with per-surface provenance", () => {
        const v = resolveWorkspaceVisibility({
            principal: ME,
            grants: perRole(role("front_desk", ["communications.read"]), role("director", ["reports.read", "communications.read"])),
        });
        expect(v.surfaces.inbox).toEqual({ state: "shown", shownBy: ["front_desk", "director"] });
        expect(v.surfaces.analytics).toEqual({ state: "shown", shownBy: ["director"] });
        expect(v.surfaces.financials.state).toBe("hidden_by_role_default");
    });

    it("analytics follows its read helper: reports.write alone also shows it", () => {
        const v = resolveWorkspaceVisibility({ principal: ME, grants: perRole(role("analyst", ["reports.write"])) });
        expect(v.surfaces.analytics.state).toBe("shown");
    });

    it("no held roles is a known answer: governed workspaces are hidden by role default", () => {
        const v = resolveWorkspaceVisibility({ principal: ME, grants: perRole() });
        expect(states(v)).toMatchObject({ financials: "hidden_by_role_default", inbox: "hidden_by_role_default", analytics: "hidden_by_role_default" });
    });

    it("role NAMES never decide: an admin-named role without the grant does not show the workspace", () => {
        const v = resolveWorkspaceVisibility({ principal: ME, grants: perRole(role("admin", []), role("finance_admin", [])) });
        expect(v.surfaces.financials.state).toBe("hidden_by_role_default");
    });

    it("the server-resolved union (AdminAuthContext) is a valid basis", () => {
        const v = resolveWorkspaceVisibility({
            principal: ME,
            grants: { kind: "resolved_union", roleKeys: ["ops", "director"], permissionKeys: ["communications.read"] },
        });
        expect(v.surfaces.inbox).toEqual({ state: "shown", shownBy: [RESOLVED_UNION_BASIS_LABEL] });
        expect(v.surfaces.financials.state).toBe("hidden_by_role_default");
    });
});

describe("S5 workspace visibility — fails closed on unknown or loading data", () => {
    it("unknown grants never show a governed workspace, and say unknown rather than hidden", () => {
        for (const grants of [null, undefined]) {
            const v = resolveWorkspaceVisibility({ principal: ME, grants });
            expect(states(v)).toMatchObject({ financials: "unknown", inbox: "unknown", analytics: "unknown" });
        }
    });

    it("unknown or blank principal is unknown even when grants are present", () => {
        const grants = perRole(role("bookkeeper", ["fin.read"]));
        for (const principal of [null, undefined, { userId: "", orgId: "org-1" }, { userId: "user-1", orgId: "  " }]) {
            const v = resolveWorkspaceVisibility({ principal, grants });
            expect(v.principal).toBeNull();
            expect(v.surfaces.financials.state).toBe("unknown");
        }
    });

    it("a held role whose grants are unknown does not count as 'hidden', and cannot hide what a known role shows", () => {
        const onlyUnknown = resolveWorkspaceVisibility({ principal: ME, grants: perRole(role("custom_x", null)) });
        expect(onlyUnknown.surfaces.financials.state).toBe("unknown");
        const mixed = resolveWorkspaceVisibility({ principal: ME, grants: perRole(role("custom_x", null), role("bookkeeper", ["fin.read"])) });
        expect(mixed.surfaces.financials).toEqual({ state: "shown", shownBy: ["bookkeeper"] });
        expect(mixed.surfaces.inbox.state).toBe("unknown");
    });

    it("a blank role key is treated as unknown", () => {
        const v = resolveWorkspaceVisibility({ principal: ME, grants: perRole(role("  ", ["fin.read"])) });
        expect(v.surfaces.financials.state).toBe("unknown");
    });

    it("the Admin V2 projection is unknown without auth or without supplied grants", () => {
        expect(workspaceVisibilityFromAdminAuth(null).surfaces.inbox.state).toBe("unknown");
        const noKeys = workspaceVisibilityFromAdminAuth({ userId: "user-1", orgId: "org-1", roleKeys: ["admin"], permissionKeys: null });
        expect(noKeys.surfaces.inbox.state).toBe("unknown");
        expect(workspaceSurfaceRendered(noKeys, ME, "inbox")).toBe(false);
        expect(workspaceSurfaceRendered(noKeys, ME, "analytics")).toBe(false);
    });
});

describe("S5 workspace visibility — stale principal never applies", () => {
    it("a result for another user or organization renders no governed workspace", () => {
        const v = resolveWorkspaceVisibility({ principal: ME, grants: perRole(role("director", ["fin.read", "communications.read"])) });
        expect(workspaceSurfaceRendered(v, ME, "inbox")).toBe(true);
        expect(workspaceSurfaceRendered(v, { userId: "user-2", orgId: "org-1" }, "inbox")).toBe(false);
        expect(workspaceSurfaceRendered(v, { userId: "user-1", orgId: "org-2" }, "inbox")).toBe(false);
        expect(workspaceSurfaceRendered(v, null, "inbox")).toBe(false);
    });
});

describe("S5 workspace visibility — optional per-user overrides can only HIDE", () => {
    const grants = perRole(role("director", ["fin.read", "communications.read", "reports.read"]));

    it("an override for this principal hides a shown workspace", () => {
        const v = resolveWorkspaceVisibility({ principal: ME, grants, override: { principal: ME, hiddenSurfaceKeys: ["inbox"] } });
        expect(v.surfaces.inbox).toEqual({ state: "hidden_by_override", shownBy: [] });
        expect(v.surfaces.financials.state).toBe("shown");
        expect(workspaceSurfaceRendered(v, ME, "inbox")).toBe(false);
    });

    it("an override never shows what the role default hides, nor what is unknown", () => {
        const hiddenByRole = resolveWorkspaceVisibility({
            principal: ME,
            grants: perRole(role("front_desk", ["communications.read"])),
            override: { principal: ME, hiddenSurfaceKeys: [] },
        });
        expect(hiddenByRole.surfaces.financials.state).toBe("hidden_by_role_default");
        const unknown = resolveWorkspaceVisibility({ principal: ME, grants: null, override: { principal: ME, hiddenSurfaceKeys: [] } });
        expect(unknown.surfaces.financials.state).toBe("unknown");
        // There is no "show" field in the override contract at all.
        const keys: (keyof NonNullable<Parameters<typeof resolveWorkspaceVisibility>[0]["override"]>)[] = ["principal", "hiddenSurfaceKeys"];
        expect(keys).toHaveLength(2);
    });

    it("an override bound to another user or organization is ignored (stale)", () => {
        for (const other of [{ userId: "user-2", orgId: "org-1" }, { userId: "user-1", orgId: "org-2" }]) {
            const v = resolveWorkspaceVisibility({ principal: ME, grants, override: { principal: other, hiddenSurfaceKeys: ["inbox", "financials"] } });
            expect(v.surfaces.inbox.state).toBe("shown");
            expect(v.surfaces.financials.state).toBe("shown");
        }
    });

    it("unknown surface keys in an override are ignored; an override cannot show what admission hides", () => {
        const v = resolveWorkspaceVisibility({ principal: ME, grants, override: { principal: ME, hiddenSurfaceKeys: ["nonsense", "tasks"] } });
        // `director` here holds no portal.access, so Tasks is hidden by its role default either way.
        expect(v.surfaces.tasks.state).toBe("hidden_by_role_default");
        expect(v.surfaces.inbox.state).toBe("shown");
        expect(workspaceSurfaceRendered(v, ME, "tasks")).toBe(false);
    });

    it("an override hides a portal-admission workspace the role default shows", () => {
        const v = resolveWorkspaceVisibility({
            principal: ME,
            grants: perRole(role("ops", ["portal.access"])),
            override: { principal: ME, hiddenSurfaceKeys: ["operations"] },
        });
        expect(v.surfaces.operations.state).toBe("hidden_by_override");
        expect(v.surfaces.tasks.state).toBe("shown");
        expect(v.surfaces.processing.state).toBe("shown");
    });

    it("the Admin V2 projection applies no override (no override store exists yet)", () => {
        const v = workspaceVisibilityFromAdminAuth({ userId: "user-1", orgId: "org-1", roleKeys: ["director"], permissionKeys: ["communications.read"] });
        expect(v.surfaces.inbox.state).toBe("shown");
    });
});

describe("S5 workspace visibility — command permissions are invariant", () => {
    it("never mutates its inputs and returns no permission data", () => {
        const granted = Object.freeze(["fin.read", "fin.write", "communications.send"]);
        const roles = Object.freeze([Object.freeze(role("director", granted as unknown as string[]))]);
        const v = resolveWorkspaceVisibility({
            principal: ME,
            grants: { kind: "per_role", roles },
            override: { principal: ME, hiddenSurfaceKeys: ["financials", "inbox", "analytics", "tasks", "processing", "operations"] },
        });
        expect(granted).toEqual(["fin.read", "fin.write", "communications.send"]);
        const serialized = JSON.stringify(v);
        for (const key of granted) expect(serialized).not.toContain(key);
        for (const k of WORKSPACE_SURFACE_KEYS) expect(Object.keys(v.surfaces[k]).sort()).toEqual(["shownBy", "state"]);
    });

    it("hiding a workspace leaves every existing authorization answer unchanged", () => {
        const permissionKeys = ["fin.read", "communications.read", "reports.read"];
        const before = { fin: offersFinancialsSurface(permissionKeys), comms: permissionKeys.includes("communications.read") };
        resolveWorkspaceVisibility({
            principal: ME,
            grants: { kind: "resolved_union", roleKeys: ["director"], permissionKeys },
            override: { principal: ME, hiddenSurfaceKeys: ["financials", "inbox"] },
        });
        expect({ fin: offersFinancialsSurface(permissionKeys), comms: permissionKeys.includes("communications.read") }).toEqual(before);
        expect(permissionKeys).toEqual(["fin.read", "communications.read", "reports.read"]);
    });
});

describe("S5 workspace visibility — the registry is grounded in declared route enforcement", () => {
    const declared = JSON.parse(readFileSync(path.resolve(__dirname, "../../scripts/routeCapabilities.declared.json"), "utf8")) as unknown;
    const routes = new Map<string, Record<string, { status?: string; capability?: string }>>();
    (function walk(o: unknown) {
        if (!o || typeof o !== "object") return;
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
            if (k.startsWith("app/api/")) routes.set(k, v as Record<string, { status?: string; capability?: string }>);
            else walk(v);
        }
    })(declared);

    it.each([
        ["financials", "app/api/admin/financials/activity/route.ts", "fin.read"],
        ["inbox", "app/api/admin/communications/unread-count/route.ts", "communications.read"],
        ["inbox", "app/api/admin/communications/threads/route.ts", "communications.read"],
        ["analytics", "app/api/admin/intelligence/operational/route.ts", "reports.read"],
    ] as const)("%s: %s GET declares %s", (surface, route, capability) => {
        expect(routes.get(route)?.GET).toMatchObject({ status: "declared", capability });
        const entry = WORKSPACE_VISIBILITY_SURFACES[surface];
        expect(entry.governed && entry.readCapabilities.includes(capability)).toBe(true);
    });

    it("Tasks, Processing and Operations read routes still declare no DOMAIN capability", () => {
        for (const route of [
            "app/api/admin/operational-tasks/route.ts",
            "app/api/admin/processing/queue/route.ts",
            "app/api/admin/records/bootstrap/route.ts",
            "app/api/admin/scheduling/route.ts",
        ]) {
            expect(routes.get(route)?.GET?.status).toBe("pending");
        }
    });
});

describe("S5 workspace visibility — portal-admission workspaces mirror the EXISTING admission rule", () => {
    const src = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
    const getHandler = (rel: string) => {
        const text = src(rel);
        const at = text.search(/export (async )?function GET\b/);
        expect(at).toBeGreaterThanOrEqual(0);
        return text.slice(at, at + 2500);
    };

    it("the literal matches PORTAL_ADMISSION_CAPABILITY, and both resolvers derive admission from it", () => {
        expect(src("lib/access/portalAdmissionKey.ts")).toContain('export const PORTAL_ADMISSION_CAPABILITY_KEY = "portal.access";');
        expect(src("lib/admin/portalAdmission.ts")).toContain("export const PORTAL_ADMISSION_CAPABILITY = PORTAL_ADMISSION_CAPABILITY_KEY;");
        // The client registry names the key from the leaf, never from the server admission module.
        expect(src("lib/access/workspaceVisibility.ts")).toContain('from "@/lib/access/portalAdmissionKey"');
        expect(src("lib/access/workspaceVisibility.ts")).not.toContain("@/lib/admin/portalAdmission");
        expect(src("lib/admin/resolveAdminAccessCore.ts")).toContain("isPortalAdmitted(portalAdmissionFromPermissionKeys(permissionKeys))");
        expect(src("lib/admin/resolveAdminPortalOrgCore.ts")).toContain("portalEligible: isPortalAdmitted(admission)");
        for (const k of ["tasks", "processing", "operations"] as const) {
            const entry = WORKSPACE_VISIBILITY_SURFACES[k];
            expect(entry.governed && entry.basis === "portal_admission" && entry.readCapabilities).toEqual(["portal.access"]);
        }
        for (const k of ["financials", "inbox", "analytics"] as const) {
            const entry = WORKSPACE_VISIBILITY_SURFACES[k];
            expect(entry.governed && entry.basis).toBe("domain_capability");
        }
    });

    it("the admission helpers refuse exactly a principal without portal admission", () => {
        expect(src("lib/admin/getAdminContext.ts")).toContain("if (!bundle.portalEligible) {");
        expect(src("lib/admin/getAdminOrgContextLight.ts")).toContain("if (!core.portalEligible) {");
        // Despite its name, requireAdminOrOps is the light portal context, not a role literal.
        const adminAuth = src("lib/adminAuth.ts");
        const at = adminAuth.indexOf("export async function requireAdminOrOps()");
        expect(adminAuth.slice(at, at + 300)).toContain("getAdminOrgContextLightCached()");
    });

    it.each([
        ["tasks", "app/api/admin/operational-tasks/route.ts", "requireAdminOrgContextLight()"],
        ["processing", "app/api/admin/processing/queue/route.ts", "getAdminContextCached()"],
        ["processing", "app/api/admin/forms/route.ts", "getAdminContextCached()"],
        ["operations", "app/api/admin/scheduling/route.ts", "getAdminContextCached()"],
        ["operations", "app/api/admin/records/bootstrap/route.ts", "requireAdminOrOps()"],
    ] as const)("%s: %s GET is admitted by %s", (_surface, route, helper) => {
        expect(getHandler(route)).toContain(helper);
    });

    it("the rail consumers read only those routes", () => {
        const ops = src("lib/scheduling/operationsWorkspaceWarmCache.ts").match(/\/api\/admin\/[a-z/_-]+/g) ?? [];
        expect([...new Set(ops)].sort()).toEqual(["/api/admin/records/bootstrap", "/api/admin/scheduling"]);
        const proc = [
            ...(src("lib/pos/processingQueueWarmCache.ts").match(/\/api\/admin\/[a-z/_-]+/g) ?? []),
            ...(src("lib/pos/processingFormsWarmCache.ts").match(/\/api\/admin\/[a-z/_-]+/g) ?? []),
        ];
        expect([...new Set(proc)].sort()).toEqual(["/api/admin/forms", "/api/admin/processing/queue"]);
        const tasksApi = src("lib/agent/taskAssist/taskAssistV11OpportunityApi.ts");
        expect(tasksApi).toContain("/api/admin/operational-tasks");
    });

    it("a portal.access holder sees all three; a role without it sees none (no new reach either way)", () => {
        const admitted = resolveWorkspaceVisibility({ principal: ME, grants: perRole(role("ops", ["portal.access"])) });
        expect(states(admitted)).toEqual({
            financials: "hidden_by_role_default",
            inbox: "hidden_by_role_default",
            analytics: "hidden_by_role_default",
            tasks: "shown",
            processing: "shown",
            operations: "shown",
        });
        const notAdmitted = resolveWorkspaceVisibility({ principal: ME, grants: perRole(role("bookkeeper", ["fin.read"])) });
        expect(states(notAdmitted)).toMatchObject({ financials: "shown", tasks: "hidden_by_role_default", processing: "hidden_by_role_default", operations: "hidden_by_role_default" });
    });

    it("multiple roles: admission from one role, domain reads from another, with provenance", () => {
        const v = resolveWorkspaceVisibility({ principal: ME, grants: perRole(role("ops", ["portal.access"]), role("bookkeeper", ["fin.read"])) });
        expect(v.surfaces.tasks).toEqual({ state: "shown", shownBy: ["ops"] });
        expect(v.surfaces.financials).toEqual({ state: "shown", shownBy: ["bookkeeper"] });
    });

    it("unknown grants or principal leave the three unknown, never shown", () => {
        for (const v of [
            resolveWorkspaceVisibility({ principal: ME, grants: null }),
            resolveWorkspaceVisibility({ principal: null, grants: perRole(role("ops", ["portal.access"])) }),
            resolveWorkspaceVisibility({ principal: ME, grants: perRole(role("custom", null)) }),
        ]) {
            for (const k of ["tasks", "processing", "operations"] as const) {
                expect(v.surfaces[k].state).toBe("unknown");
                expect(workspaceSurfaceRendered(v, ME, k)).toBe(false);
            }
        }
    });

    it("the admission decision itself is untouched: portal.access stays in the grants whatever is hidden", () => {
        const permissionKeys = Object.freeze(["portal.access", "fin.read"]);
        resolveWorkspaceVisibility({
            principal: ME,
            grants: { kind: "resolved_union", roleKeys: ["ops"], permissionKeys },
            override: { principal: ME, hiddenSurfaceKeys: ["tasks", "processing", "operations"] },
        });
        expect(permissionKeys.includes("portal.access")).toBe(true);
        expect(permissionKeys).toEqual(["portal.access", "fin.read"]);
    });

    it("Financials in the rail keeps its legacy fail-open module (documented, not harmonized)", () => {
        const rail = src("app/adminV2/components/SidebarModalNavItems.tsx");
        expect(rail).toContain("offersFinancialsSurface(auth?.permissionKeys)");
        expect(rail).not.toContain('useWorkspaceSurfaceRendered("financials")');
        for (const k of ["inbox", "analytics", "tasks", "processing", "operations"]) expect(rail).toContain(`useWorkspaceSurfaceRendered("${k}")`);
        expect(src("lib/access/financialsSurfaceVisibility.ts")).toContain("if (permissionKeys == null) return true;");
    });
});
