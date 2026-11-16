/**
 * Access V3 S5 — own-user, hide-only workspace visibility overrides: input contract, own-user route,
 * client loader, resolver wiring and controls. Mocked only: the store is an in-memory fake standing in
 * for `workspace_visibility_overrides`, so nothing here is persisted or runtime acceptance. The real
 * adapter's offline proof is `workspaceVisibilityOverrideStore.test.ts`.
 */

import { readFileSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { offersFinancialsSurface } from "@/lib/access/financialsSurfaceVisibility";
import {
    WORKSPACE_SURFACE_KEYS,
    resolveWorkspaceVisibility,
    workspaceSurfaceRendered,
    workspaceVisibilityFromAdminAuth,
    type VisibilityPrincipal,
} from "@/lib/access/workspaceVisibility";
import {
    OVERRIDABLE_WORKSPACE_SURFACE_KEYS,
    overrideFromStored,
    ownWorkspaceControlRows,
    parseHiddenSurfaceKeys,
    parseOverrideResponse,
    parseOverrideSaveInput,
    toggleDraftHidden,
} from "@/lib/access/workspaceVisibilityOverrides";
import { WorkspaceVisibilityOverrideLoader, appliedOverride } from "@/lib/access/workspaceVisibilityOverrideLoader";

const ME: VisibilityPrincipal = { userId: "user-1", orgId: "org-1" };
const OTHER_USER: VisibilityPrincipal = { userId: "user-2", orgId: "org-1" };
const OTHER_ORG: VisibilityPrincipal = { userId: "user-1", orgId: "org-2" };

// ── Mocked gate and store ──────────────────────────────────────────────────────────────────────────

const { gate, storeState } = vi.hoisted(() => ({
    gate: { current: null as null | { userId: string; orgId: string } | "unauthenticated" | "forbidden" },
    storeState: {
        present: false,
        absentKind: false,
        rows: new Map<string, string[]>(),
        calls: [] as Array<{ op: string; principal: { userId: string; orgId: string }; keys?: readonly string[] }>,
        failWrite: false,
        failRead: false,
        rawRead: null as null | unknown[],
    },
}));

vi.mock("@/lib/admin/getAdminOrgContextLight", () => ({
    requireAdminOrgContextLight: async () => {
        if (gate.current === "unauthenticated") return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        if (gate.current === "forbidden" || gate.current == null) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
        return { ok: true, userId: gate.current.userId, orgId: gate.current.orgId, role: "ops", roleKeys: ["ops"] };
    },
}));

vi.mock("@/lib/access/workspaceVisibilityOverrideStore", () => {
    const k = (p: { userId: string; orgId: string }) => `${p.orgId}|${p.userId}`;
    class WorkspaceVisibilityOverrideStoreNotProvisioned extends Error {}
    // Not provisioned = the migration is not applied here: the real adapter throws this on first use.
    const provisioned = () => {
        if (!storeState.present) throw new WorkspaceVisibilityOverrideStoreNotProvisioned("not applied");
    };
    return {
        WorkspaceVisibilityOverrideStoreNotProvisioned,
        getWorkspaceVisibilityOverrideStore: () =>
            storeState.absentKind ? { kind: "absent", reason: "not_provisioned" }
            :   {
                    kind: "available",
                    store: {
                        read: async (p: { userId: string; orgId: string }) => {
                            provisioned();
                            storeState.calls.push({ op: "read", principal: { ...p } });
                            if (storeState.failRead) throw new Error("read failed");
                            if (storeState.rawRead) return { hiddenSurfaceKeys: storeState.rawRead as string[] };
                            const row = storeState.rows.get(k(p));
                            return row ? { hiddenSurfaceKeys: row } : null;
                        },
                        write: async (p: { userId: string; orgId: string }, keys: readonly string[]) => {
                            provisioned();
                            storeState.calls.push({ op: "write", principal: { ...p }, keys: [...keys] });
                            if (storeState.failWrite) throw new Error("write failed");
                            storeState.rows.set(k(p), [...keys]);
                        },
                        clear: async (p: { userId: string; orgId: string }) => {
                            provisioned();
                            storeState.calls.push({ op: "clear", principal: { ...p } });
                            if (storeState.failWrite) throw new Error("write failed");
                            storeState.rows.delete(k(p));
                        },
                    },
                },
    };
});

import { DELETE, GET, PUT } from "@/app/api/admin/me/workspace-visibility/route";

const URL_BASE = "http://localhost/api/admin/me/workspace-visibility";
const req = (method: string, query = "", body?: unknown) =>
    new NextRequest(`${URL_BASE}${query}`, {
        method,
        ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
    });
const q = (p: VisibilityPrincipal) => `?user_id=${p.userId}&org_id=${p.orgId}`;

beforeEach(() => {
    gate.current = { ...ME };
    storeState.present = false;
    storeState.absentKind = false;
    storeState.rows.clear();
    storeState.calls.length = 0;
    storeState.failWrite = false;
    storeState.failRead = false;
    storeState.rawRead = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
});

// ── Input contract ─────────────────────────────────────────────────────────────────────────────────

describe("S5 override input — principal-bound, strict", () => {
    it("accepts known overridable keys, trimmed, de-duplicated, in registry order", () => {
        expect(parseHiddenSurfaceKeys([" operations", "inbox", "inbox"])).toEqual({ ok: true, hiddenSurfaceKeys: ["inbox", "operations"] });
        expect(parseHiddenSurfaceKeys([])).toEqual({ ok: true, hiddenSurfaceKeys: [] });
    });

    it("refuses malformed lists and unknown keys instead of dropping them", () => {
        expect(parseHiddenSurfaceKeys("inbox")).toMatchObject({ ok: false, error: "malformed_keys" });
        expect(parseHiddenSurfaceKeys(null)).toMatchObject({ ok: false, error: "malformed_keys" });
        expect(parseHiddenSurfaceKeys(["inbox", 3])).toMatchObject({ ok: false, error: "malformed_keys" });
        expect(parseHiddenSurfaceKeys(["inbox", " "])).toMatchObject({ ok: false, error: "malformed_keys" });
        expect(parseHiddenSurfaceKeys(new Array(100).fill("inbox"))).toMatchObject({ ok: false, error: "malformed_keys" });
        expect(parseHiddenSurfaceKeys(["inbox", "payroll", "fin.read"])).toEqual({ ok: false, error: "unknown_key", keys: ["payroll", "fin.read"] });
    });

    it("refuses Financials: its rail keeps the legacy module, so an override would be saved and ignored", () => {
        expect(OVERRIDABLE_WORKSPACE_SURFACE_KEYS).not.toContain("financials");
        expect(parseHiddenSurfaceKeys(["financials"])).toEqual({ ok: false, error: "not_overridable", keys: ["financials"] });
    });

    it("a save body may name only the caller, and nothing but the known fields", () => {
        expect(parseOverrideSaveInput({ hidden_surface_keys: ["inbox"] }, ME)).toMatchObject({ ok: true });
        expect(parseOverrideSaveInput({ hidden_surface_keys: ["inbox"], user_id: "user-1", org_id: "org-1" }, ME)).toMatchObject({ ok: true });
        expect(parseOverrideSaveInput({ hidden_surface_keys: ["inbox"], user_id: "user-2" }, ME)).toMatchObject({ error: "principal_mismatch" });
        expect(parseOverrideSaveInput({ hidden_surface_keys: ["inbox"], org_id: "org-2" }, ME)).toMatchObject({ error: "principal_mismatch" });
        expect(parseOverrideSaveInput({ hidden_surface_keys: ["inbox"], user_id: 1 }, ME)).toMatchObject({ error: "principal_mismatch" });
        expect(parseOverrideSaveInput({ hidden_surface_keys: ["inbox"], permission_keys: ["fin.read"] }, ME)).toEqual({
            ok: false,
            error: "unexpected_field",
            keys: ["permission_keys"],
        });
        expect(parseOverrideSaveInput([], ME)).toMatchObject({ error: "malformed_body" });
        expect(parseOverrideSaveInput("x", ME)).toMatchObject({ error: "malformed_body" });
    });

    it("stored values are trusted less than input: unknown keys are ignored and reported, never applied", () => {
        expect(overrideFromStored(ME, { hiddenSurfaceKeys: ["inbox", "retired_surface", "financials"] })).toEqual({
            override: { principal: ME, hiddenSurfaceKeys: ["inbox"] },
            ignoredKeys: ["retired_surface", "financials"],
        });
        expect(overrideFromStored(ME, { hiddenSurfaceKeys: "inbox" })).toEqual({ override: null, ignoredKeys: [] });
        expect(overrideFromStored(ME, null)).toEqual({ override: null, ignoredKeys: [] });
    });

    it("a client accepts a response only for the principal it asked about", () => {
        const body = { user_id: "user-1", org_id: "org-1", store: "available", hidden_surface_keys: ["inbox"] };
        expect(parseOverrideResponse(body, ME)?.override?.hiddenSurfaceKeys).toEqual(["inbox"]);
        expect(parseOverrideResponse(body, OTHER_USER)).toBeNull();
        expect(parseOverrideResponse(body, OTHER_ORG)).toBeNull();
        expect(parseOverrideResponse({ ...body, store: "maybe" }, ME)).toBeNull();
        expect(parseOverrideResponse({ ...body, hidden_surface_keys: "inbox" }, ME)).toBeNull();
        expect(parseOverrideResponse({ ...body, store: "unavailable" }, ME)).toEqual({ store: "unavailable", unavailableReason: "not_provisioned", override: null });
        expect(parseOverrideResponse({ ...body, store: "unavailable", unavailable_reason: "read_failed" }, ME)).toMatchObject({ unavailableReason: "read_failed", override: null });
    });
});

// ── Own-user route ─────────────────────────────────────────────────────────────────────────────────

describe("S5 own-user route — store not provisioned (migration not applied in this database)", () => {
    it("GET answers explicitly unavailable; PUT and DELETE answer 503 not saved; no store is touched", async () => {
        const g = await GET(req("GET", q(ME)));
        expect(g.status).toBe(200);
        expect(await g.json()).toEqual({
            user_id: "user-1",
            org_id: "org-1",
            store: "unavailable",
            unavailable_reason: "not_provisioned",
            hidden_surface_keys: [],
        });
        const p = await PUT(req("PUT", "", { hidden_surface_keys: ["inbox"] }));
        expect(p.status).toBe(503);
        expect(await p.json()).toMatchObject({ store: "unavailable", saved: false });
        const d = await DELETE(req("DELETE"));
        expect(d.status).toBe(503);
        expect(await d.json()).toMatchObject({ saved: false });
        expect(storeState.calls).toEqual([]);
    });

    it("input is still validated before the absence is reported", async () => {
        const p = await PUT(req("PUT", "", { hidden_surface_keys: ["payroll"] }));
        expect(p.status).toBe(400);
        expect(await p.json()).toEqual({ error: "unknown_key", keys: ["payroll"], saved: false });
    });

    it("an availability of `absent` answers the same, without touching any store", async () => {
        storeState.absentKind = true;
        storeState.present = true;
        expect(await (await GET(req("GET", q(ME)))).json()).toMatchObject({ store: "unavailable", unavailable_reason: "not_provisioned" });
        const p = await PUT(req("PUT", "", { hidden_surface_keys: ["inbox"] }));
        expect(p.status).toBe(503);
        expect(await p.json()).toMatchObject({ store: "unavailable", unavailable_reason: "not_provisioned", saved: false });
        expect((await DELETE(req("DELETE"))).status).toBe(503);
        expect(storeState.calls).toEqual([]);
    });
});

describe("S5 own-user route — mocked store", () => {
    beforeEach(() => {
        storeState.present = true;
    });

    it("same principal: hide, save, reload, reset", async () => {
        expect(await (await GET(req("GET", q(ME)))).json()).toMatchObject({ store: "available", hidden_surface_keys: [] });

        const saved = await PUT(req("PUT", q(ME), { user_id: "user-1", org_id: "org-1", hidden_surface_keys: ["operations", "inbox"] }));
        expect(saved.status).toBe(200);
        expect(await saved.json()).toEqual({ user_id: "user-1", org_id: "org-1", store: "available", hidden_surface_keys: ["inbox", "operations"], saved: true });

        expect(await (await GET(req("GET", q(ME)))).json()).toMatchObject({ hidden_surface_keys: ["inbox", "operations"] });

        const reset = await DELETE(req("DELETE", q(ME)));
        expect(await reset.json()).toMatchObject({ hidden_surface_keys: [], saved: true });
        expect(await (await GET(req("GET", q(ME)))).json()).toMatchObject({ hidden_surface_keys: [] });

        // Every store call was addressed by the server-resolved principal.
        expect(new Set(storeState.calls.map((c) => `${c.principal.orgId}|${c.principal.userId}`))).toEqual(new Set(["org-1|user-1"]));
    });

    it("an empty save is a reset (clears, does not write an empty row)", async () => {
        await PUT(req("PUT", "", { hidden_surface_keys: ["inbox"] }));
        await PUT(req("PUT", "", { hidden_surface_keys: [] }));
        expect(storeState.calls.map((c) => c.op)).toEqual(["write", "clear"]);
        expect(storeState.rows.size).toBe(0);
    });

    it.each([
        ["another user", OTHER_USER],
        ["another organization", OTHER_ORG],
    ])("refuses %s in the query (403) on every method without touching the store", async (_label, other) => {
        expect((await GET(req("GET", q(other)))).status).toBe(403);
        expect((await PUT(req("PUT", q(other), { hidden_surface_keys: ["inbox"] }))).status).toBe(403);
        expect((await DELETE(req("DELETE", q(other)))).status).toBe(403);
        expect(storeState.calls).toEqual([]);
    });

    it.each([
        ["another user", { user_id: "user-2" }],
        ["another organization", { org_id: "org-2" }],
    ])("refuses %s in the save body (403) without writing", async (_label, named) => {
        const r = await PUT(req("PUT", "", { ...named, hidden_surface_keys: ["inbox"] }));
        expect(r.status).toBe(403);
        expect(await r.json()).toEqual({ error: "principal_mismatch", saved: false });
        expect(storeState.calls).toEqual([]);
    });

    it("one principal's override is never another principal's answer", async () => {
        await PUT(req("PUT", "", { hidden_surface_keys: ["inbox"] }));
        gate.current = { ...OTHER_USER };
        expect(await (await GET(req("GET"))).json()).toMatchObject({ user_id: "user-2", hidden_surface_keys: [] });
        gate.current = { ...OTHER_ORG };
        expect(await (await GET(req("GET"))).json()).toMatchObject({ org_id: "org-2", hidden_surface_keys: [] });
    });

    it("the existing portal gate still decides admission; refused callers never reach the store", async () => {
        gate.current = "unauthenticated";
        expect((await GET(req("GET"))).status).toBe(401);
        expect((await PUT(req("PUT", "", { hidden_surface_keys: ["inbox"] }))).status).toBe(401);
        gate.current = "forbidden";
        expect((await GET(req("GET"))).status).toBe(403);
        expect((await DELETE(req("DELETE"))).status).toBe(403);
        expect(storeState.calls).toEqual([]);
    });

    it("malformed JSON, malformed keys, unknown keys and extra fields are 400 and write nothing", async () => {
        expect((await PUT(req("PUT", "", "{not json"))).status).toBe(400);
        expect((await PUT(req("PUT", "", { hidden_surface_keys: "inbox" }))).status).toBe(400);
        expect((await PUT(req("PUT", "", { hidden_surface_keys: ["payroll"] }))).status).toBe(400);
        expect((await PUT(req("PUT", "", { hidden_surface_keys: ["financials"] }))).status).toBe(400);
        expect((await PUT(req("PUT", "", { hidden_surface_keys: ["inbox"], show_surface_keys: ["analytics"] }))).status).toBe(400);
        expect(storeState.calls).toEqual([]);
    });

    it("an unknown stored key is ignored on read and reported", async () => {
        storeState.rawRead = ["inbox", "retired_surface"];
        expect(await (await GET(req("GET"))).json()).toMatchObject({ hidden_surface_keys: ["inbox"], ignored_keys: ["retired_surface"] });
    });

    it("a failed write answers not saved; a failed read answers unavailable, never an empty override", async () => {
        storeState.failWrite = true;
        const p = await PUT(req("PUT", "", { hidden_surface_keys: ["inbox"] }));
        expect(p.status).toBe(500);
        expect(await p.json()).toEqual({ error: "save_failed", saved: false });
        storeState.failRead = true;
        expect(await (await GET(req("GET"))).json()).toMatchObject({ store: "unavailable", unavailable_reason: "read_failed" });
    });
});

// ── Client loader ──────────────────────────────────────────────────────────────────────────────────

type Pending = { url: string; init?: RequestInit; resolve: (status: number, body: unknown) => void };

function fakeFetch() {
    const pending: Pending[] = [];
    const fetchImpl = (url: string, init?: RequestInit) =>
        new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((res) => {
            pending.push({ url, init, resolve: (status, body) => res({ ok: status >= 200 && status < 300, status, json: async () => body }) });
        });
    return { pending, fetchImpl };
}
const answer = (p: VisibilityPrincipal, keys: string[], extra: Record<string, unknown> = {}) => ({
    user_id: p.userId,
    org_id: p.orgId,
    store: "available",
    hidden_surface_keys: keys,
    ...extra,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("S5 client loader — principal-bound cache", () => {
    it("same principal: load, hide and save, reload, reset", async () => {
        const { pending, fetchImpl } = fakeFetch();
        const loader = new WorkspaceVisibilityOverrideLoader(fetchImpl);
        const loaded = loader.load(ME);
        expect(pending[0].url).toBe("/api/admin/me/workspace-visibility?user_id=user-1&org_id=org-1");
        pending[0].resolve(200, answer(ME, []));
        await loaded;
        expect(loader.get(ME)?.status).toBe("loaded");

        const save = loader.save(ME, ["inbox"]);
        expect(pending[1].init?.method).toBe("PUT");
        expect(JSON.parse(String(pending[1].init?.body))).toEqual({ user_id: "user-1", org_id: "org-1", hidden_surface_keys: ["inbox"] });
        // No optimistic update: nothing changes until the server says saved.
        expect(appliedOverride(loader.get(ME), ME)).toBeNull();
        pending[1].resolve(200, answer(ME, ["inbox"], { saved: true }));
        expect(await save).toEqual({ saved: true });
        expect(appliedOverride(loader.get(ME), ME)?.hiddenSurfaceKeys).toEqual(["inbox"]);

        const reload = loader.load(ME);
        pending[2].resolve(200, answer(ME, ["inbox"]));
        await reload;
        expect(appliedOverride(loader.get(ME), ME)?.hiddenSurfaceKeys).toEqual(["inbox"]);

        const reset = loader.reset(ME);
        expect(pending[3].init?.method).toBe("DELETE");
        pending[3].resolve(200, answer(ME, [], { saved: true }));
        expect(await reset).toEqual({ saved: true });
        expect(appliedOverride(loader.get(ME), ME)).toBeNull();
    });

    it("an older load that returns after a save is discarded", async () => {
        const { pending, fetchImpl } = fakeFetch();
        const loader = new WorkspaceVisibilityOverrideLoader(fetchImpl);
        const staleLoad = loader.load(ME);
        const save = loader.save(ME, ["analytics"]);
        pending[1].resolve(200, answer(ME, ["analytics"], { saved: true }));
        await save;
        pending[0].resolve(200, answer(ME, []));
        await staleLoad;
        expect(appliedOverride(loader.get(ME), ME)?.hiddenSurfaceKeys).toEqual(["analytics"]);
    });

    it("a response naming another principal is never applied", async () => {
        const { pending, fetchImpl } = fakeFetch();
        const loader = new WorkspaceVisibilityOverrideLoader(fetchImpl);
        const l = loader.load(ME);
        pending[0].resolve(200, answer(OTHER_USER, ["inbox"]));
        await l;
        expect(loader.get(ME)?.status).toBe("error");
        expect(appliedOverride(loader.get(ME), ME)).toBeNull();

        const s = loader.save(ME, ["inbox"]);
        pending[1].resolve(200, answer(OTHER_ORG, ["inbox"], { saved: true }));
        expect(await s).toEqual({ saved: false, reason: "failed" });
        expect(appliedOverride(loader.get(ME), ME)).toBeNull();
    });

    it("entries are read by principal; a user or org switch drops the previous one and discards its in-flight answer", async () => {
        const { pending, fetchImpl } = fakeFetch();
        const loader = new WorkspaceVisibilityOverrideLoader(fetchImpl);
        const l = loader.load(ME);
        pending[0].resolve(200, answer(ME, ["inbox"]));
        await l;
        expect(loader.get(OTHER_USER)).toBeNull();
        expect(loader.get(OTHER_ORG)).toBeNull();
        expect(appliedOverride(loader.get(ME), OTHER_USER)).toBeNull();

        const inflight = loader.load(ME);
        loader.retainOnly(OTHER_ORG);
        expect(loader.get(ME)).toBeNull();
        pending[1].resolve(200, answer(ME, ["analytics"]));
        await inflight;
        expect(loader.get(ME)).toBeNull();
    });

    it("invalidate drops the cache (sign-out) and a save in flight reports superseded, not saved", async () => {
        const { pending, fetchImpl } = fakeFetch();
        const loader = new WorkspaceVisibilityOverrideLoader(fetchImpl);
        const s = loader.save(ME, ["inbox"]);
        loader.invalidate();
        pending[0].resolve(200, answer(ME, ["inbox"], { saved: true }));
        expect(await s).toEqual({ saved: false, reason: "superseded" });
        expect(loader.get(ME)).toBeNull();
    });

    it("ensure loads once per principal", async () => {
        const { pending, fetchImpl } = fakeFetch();
        const loader = new WorkspaceVisibilityOverrideLoader(fetchImpl);
        loader.ensure(ME);
        loader.ensure(ME);
        expect(pending).toHaveLength(1);
        loader.ensure(OTHER_USER);
        expect(pending).toHaveLength(2);
    });

    it("store absent: unavailable, saves report store_unavailable, role defaults apply", async () => {
        const { pending, fetchImpl } = fakeFetch();
        const loader = new WorkspaceVisibilityOverrideLoader(fetchImpl);
        const l = loader.load(ME);
        pending[0].resolve(200, { user_id: "user-1", org_id: "org-1", store: "unavailable", unavailable_reason: "not_provisioned", hidden_surface_keys: [] });
        await l;
        expect(loader.get(ME)?.status).toBe("unavailable");
        const s = loader.save(ME, ["inbox"]);
        pending[1].resolve(503, { user_id: "user-1", org_id: "org-1", store: "unavailable", hidden_surface_keys: [], saved: false });
        expect(await s).toEqual({ saved: false, reason: "store_unavailable" });
        expect(loader.get(ME)?.lastSave).toEqual({ saved: false, reason: "store_unavailable" });
        expect(appliedOverride(loader.get(ME), ME)).toBeNull();
    });

    it("a refused or failed save keeps the previous saved override in force", async () => {
        const { pending, fetchImpl } = fakeFetch();
        const loader = new WorkspaceVisibilityOverrideLoader(fetchImpl);
        const l = loader.load(ME);
        pending[0].resolve(200, answer(ME, ["inbox"]));
        await l;
        const refused = loader.save(ME, ["inbox", "analytics"]);
        pending[1].resolve(400, { error: "unknown_key", saved: false });
        expect(await refused).toEqual({ saved: false, reason: "refused" });
        const failed = loader.save(ME, ["analytics"]);
        pending[2].resolve(500, { error: "save_failed", saved: false });
        expect(await failed).toEqual({ saved: false, reason: "failed" });
        expect(appliedOverride(loader.get(ME), ME)?.hiddenSurfaceKeys).toEqual(["inbox"]);
    });

    it("a failed load is retried by ensure; a store read failure is an error, not 'no store'", async () => {
        const { pending, fetchImpl } = fakeFetch();
        const loader = new WorkspaceVisibilityOverrideLoader(fetchImpl);
        loader.ensure(ME);
        pending[0].resolve(200, { user_id: "user-1", org_id: "org-1", store: "unavailable", unavailable_reason: "read_failed", hidden_surface_keys: [] });
        await flush();
        expect(loader.get(ME)?.status).toBe("error");
        loader.ensure(ME);
        expect(pending).toHaveLength(2);
        pending[1].resolve(200, answer(ME, ["inbox"]));
        await flush();
        expect(appliedOverride(loader.get(ME), ME)?.hiddenSurfaceKeys).toEqual(["inbox"]);
        loader.ensure(ME);
        expect(pending).toHaveLength(2);
    });

    it("a failed write with no known answer settles to a retryable error, never stuck loading", async () => {
        const { pending, fetchImpl } = fakeFetch();
        const loader = new WorkspaceVisibilityOverrideLoader(fetchImpl);
        const staleLoad = loader.load(ME);
        const s = loader.save(ME, ["inbox"]);
        pending[1].resolve(500, { error: "save_failed", saved: false });
        expect(await s).toEqual({ saved: false, reason: "failed" });
        pending[0].resolve(200, answer(ME, []));
        await staleLoad;
        expect(loader.get(ME)).toMatchObject({ status: "error", saving: false });
        loader.ensure(ME);
        expect(pending).toHaveLength(3);
    });

    it("a network error is an error state, not an empty override", async () => {
        const loader = new WorkspaceVisibilityOverrideLoader(() => Promise.reject(new Error("offline")));
        await loader.load(ME);
        expect(loader.get(ME)?.status).toBe("error");
        await flush();
        expect(appliedOverride(loader.get(ME), ME)).toBeNull();
    });
});

// ── Resolver wiring, grants and authorization ──────────────────────────────────────────────────────

const auth = (permissionKeys: string[] | null, p: VisibilityPrincipal = ME) => ({ ...p, roleKeys: ["ops"], permissionKeys });

describe("S5 resolver wiring — hide only, grants untouched", () => {
    it("an applied override hides a role-shown workspace", () => {
        const v = workspaceVisibilityFromAdminAuth(auth(["communications.read", "portal.access"]), { principal: ME, hiddenSurfaceKeys: ["inbox"] });
        expect(v.surfaces.inbox.state).toBe("hidden_by_override");
        expect(v.surfaces.tasks.state).toBe("shown");
        expect(workspaceSurfaceRendered(v, ME, "inbox")).toBe(false);
        expect(workspaceSurfaceRendered(v, ME, "tasks")).toBe(true);
    });

    it("an override can never show a role-hidden workspace", () => {
        const v = workspaceVisibilityFromAdminAuth(auth(["portal.access"]), { principal: ME, hiddenSurfaceKeys: ["inbox", "analytics"] });
        expect(v.surfaces.inbox.state).toBe("hidden_by_role_default");
        expect(v.surfaces.analytics.state).toBe("hidden_by_role_default");
        const unknownGrants = workspaceVisibilityFromAdminAuth(auth(null), { principal: ME, hiddenSurfaceKeys: [] });
        for (const k of WORKSPACE_SURFACE_KEYS) expect(unknownGrants.surfaces[k].state).toBe("unknown");
    });

    it("an override for another user or organization is ignored", () => {
        for (const other of [OTHER_USER, OTHER_ORG]) {
            const v = workspaceVisibilityFromAdminAuth(auth(["communications.read"]), { principal: other, hiddenSurfaceKeys: ["inbox"] });
            expect(v.surfaces.inbox.state).toBe("shown");
        }
    });

    it("without an override the defaults are exactly the role defaults", () => {
        const grants = ["communications.read", "reports.read", "portal.access", "fin.read"];
        expect(workspaceVisibilityFromAdminAuth(auth(grants))).toEqual(
            resolveWorkspaceVisibility({ principal: ME, grants: { kind: "resolved_union", roleKeys: ["ops"], permissionKeys: grants } }),
        );
    });

    it("applying an override does not read or change grants, and the answer carries none", () => {
        const permissionKeys = Object.freeze(["communications.read", "reports.read", "portal.access"]) as unknown as string[];
        const a = Object.freeze(auth(permissionKeys));
        const v = workspaceVisibilityFromAdminAuth(a, Object.freeze({ principal: ME, hiddenSurfaceKeys: Object.freeze(["inbox", "analytics"]) }));
        expect(a.permissionKeys).toEqual(["communications.read", "reports.read", "portal.access"]);
        const serialized = JSON.stringify(v);
        for (const key of permissionKeys) expect(serialized).not.toContain(key);
    });

    it("Financials keeps its legacy fail-open module, unaffected by overrides", () => {
        expect(offersFinancialsSurface(null)).toBe(true);
        expect(offersFinancialsSurface(["fin.read"])).toBe(true);
        const rail = readFileSync(path.resolve(__dirname, "../../app/adminV2/components/SidebarModalNavItems.tsx"), "utf8");
        expect(rail).toContain("offersFinancialsSurface(auth?.permissionKeys)");
        expect(rail).not.toContain('useWorkspaceSurfaceRendered("financials")');
    });
});

describe("S5 direct-route authorization and route declarations — unchanged", () => {
    const src = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
    const declared = JSON.parse(src("scripts/routeCapabilities.declared.json")) as { routes: Record<string, Record<string, { status: string; capability?: string }>> };

    it("the workspaces' own read routes still declare their capabilities (hiding is not a gate)", () => {
        expect(declared.routes["app/api/admin/communications/preferences/route.ts"].GET).toMatchObject({ status: "declared", capability: "communications.read" });
        expect(declared.routes["app/api/admin/me/workspace-visibility/route.ts"]).toEqual({
            GET: expect.objectContaining({ status: "none" }),
            PUT: expect.objectContaining({ status: "none" }),
            DELETE: expect.objectContaining({ status: "none" }),
        });
    });

    it("the override route and modules hold no authorization authority and address no other user", () => {
        const route = src("app/api/admin/me/workspace-visibility/route.ts");
        expect(route.match(/requireAdminOrgContextLight\(\)/g)).toHaveLength(3);
        for (const forbidden of ["params", "createAdminClient", "permission_keys", "role_permissions", "user_roles"]) {
            expect(route).not.toContain(forbidden);
        }
        for (const rel of ["lib/access/workspaceVisibilityOverrides.ts", "lib/access/workspaceVisibilityOverrideLoader.ts"]) {
            expect(src(rel)).not.toMatch(/from "@\/lib\/(admin|supabase)/);
        }
        // Workspace rail routes are not touched: the sidebar only hides entries.
        const rail = src("app/adminV2/components/SidebarModalNavItems.tsx");
        expect(rail).toContain("useOwnWorkspaceVisibility()");
    });
});

// ── Own-user controls ──────────────────────────────────────────────────────────────────────────────

describe("S5 own-user controls — hide/reset only", () => {
    const defaults = workspaceVisibilityFromAdminAuth(auth(["communications.read", "portal.access"]));

    it("only role-shown workspaces get a control; role-hidden and Financials get none", () => {
        const rows = ownWorkspaceControlRows(defaults, ["inbox"]);
        expect(rows.map((r) => r.key)).toEqual(["inbox", "analytics", "tasks", "processing", "operations"]);
        expect(rows.find((r) => r.key === "inbox")).toMatchObject({ hideable: true, hidden: true, note: null });
        expect(rows.find((r) => r.key === "analytics")).toMatchObject({ hideable: false, hidden: false, note: "not_in_roles" });
        const unknown = ownWorkspaceControlRows(workspaceVisibilityFromAdminAuth(auth(null)), []);
        expect(unknown.every((r) => !r.hideable && r.note === "grants_unknown")).toBe(true);
    });

    it("toggling hides and un-hides a role-shown workspace; a role-hidden one cannot be toggled", () => {
        const rows = ownWorkspaceControlRows(defaults, []);
        expect(toggleDraftHidden(rows, [], "tasks")).toEqual(["tasks"]);
        expect(toggleDraftHidden(rows, ["tasks"], "tasks")).toEqual([]);
        expect(toggleDraftHidden(rows, [], "analytics")).toEqual([]);
    });

    it("the controls address only the caller and say so when nothing can be saved", () => {
        const ui = src("app/adminV2/components/AdminV2WorkspaceVisibilityControls.tsx");
        expect(ui).not.toMatch(/userId\s*=\s*props|targetUser|params/);
        expect(ui).toContain("Personal workspace choices can't be saved yet.");
        expect(ui).toContain("disabled={!available || busy");
        const menu = src("app/adminV2/components/AdminV2ProfileMenu.tsx");
        expect(menu).toContain("workspaceVisibilityOverrideLoader.invalidate();");
    });

    function src(rel: string) {
        return readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
    }
});
