/**
 * Disconnect → reinstall: what the application layer owns.
 *
 * Found by the Documents D9-H1 hosted rerun (qar_31100f9d04e5): a disconnected
 * application could not be connected again. The schema half (partial unique
 * indexes) is certified by supabase/tests/developer_platform/installation_reinstall_cert.sql
 * and installationReinstall.live.test.ts. These lock the other two halves:
 *
 *   - the chooser's `alreadyInstalled` counts only installations that still hold
 *     the slot (active or suspended), never a revoked one, and an unreadable
 *     installation list is an error rather than "nothing installed";
 *   - disconnecting is terminal on the server: no state change can resurrect a
 *     revoked row, which would otherwise both mislabel it (status active with
 *     revoked_at stamped) and collide with its successor.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

let guard: { ok: boolean; ctx?: unknown; response?: unknown };
let installation: { ok: boolean; status?: number; message?: string; installation?: unknown };
const audit = vi.fn();

vi.mock("@/app/api/admin/integrations/_guard", () => ({
    requireIntegrationsAccess: async () => guard,
}));
vi.mock("@/lib/platform/admin/integrationsService", async () => {
    const actual = await vi.importActual<typeof import("@/lib/platform/admin/integrationsService")>(
        "@/lib/platform/admin/integrationsService",
    );
    return { ...actual, getInstallation: async () => installation };
});
vi.mock("@/lib/platform/admin/administrativeAudit", () => ({
    withAdministrativeAudit: (...args: unknown[]) => audit(...args),
}));

const { listApprovedApplications, occupiesInstallationSlot } = await import("@/lib/platform/admin/integrationsService");
const route = await import("@/app/api/admin/integrations/installations/[id]/route");

const ORG = "org-1";
const APP = "app-1";

/** Answers exactly the two reads listApprovedApplications makes. */
function chooserClient(installs: { application_id: string; status: string }[] | { error: string }) {
    const apps = { data: [{ id: APP, name: "Read Cert", slug: "read-cert", publisher: null, status: "active" }], error: null };
    return {
        from(table: string) {
            if (table === "developer_applications") {
                return { select: () => ({ eq: () => ({ order: async () => apps }) }) };
            }
            if (table === "app_installations") {
                return {
                    select: (cols: string) => ({
                        eq: async (col: string, val: string) => {
                            expect(cols).toContain("status");
                            expect([col, val]).toEqual(["org_id", ORG]);
                            return "error" in installs
                                ? { data: null, error: { message: installs.error } }
                                : { data: installs, error: null };
                        },
                    }),
                };
            }
            throw new Error(`unexpected table ${table}`);
        },
    } as unknown as SupabaseClient;
}

async function alreadyInstalled(installs: { application_id: string; status: string }[]) {
    const res = await listApprovedApplications(chooserClient(installs), ORG);
    expect(res.ok).toBe(true);
    return res.ok ? res.applications[0].alreadyInstalled : undefined;
}

describe("which installations hold the slot", () => {
    it("active and suspended do; revoked does not", () => {
        expect(occupiesInstallationSlot("active")).toBe(true);
        expect(occupiesInstallationSlot("suspended")).toBe(true);
        expect(occupiesInstallationSlot("revoked")).toBe(false);
        expect(occupiesInstallationSlot("REVOKED")).toBe(false);
    });

    it("a row with no stated status is treated as active, matching the column default", () => {
        expect(occupiesInstallationSlot(null)).toBe(true);
    });
});

describe("the chooser offers a disconnected application again", () => {
    it("no installation: not installed", async () => {
        expect(await alreadyInstalled([])).toBe(false);
    });

    it("only revoked history: not installed — it can be connected again", async () => {
        expect(await alreadyInstalled([
            { application_id: APP, status: "revoked" },
            { application_id: APP, status: "revoked" },
        ])).toBe(false);
    });

    it("a live installation beside revoked history: installed", async () => {
        expect(await alreadyInstalled([
            { application_id: APP, status: "revoked" },
            { application_id: APP, status: "active" },
        ])).toBe(true);
    });

    it("a suspended installation: installed — it can be reactivated, so it still holds the slot", async () => {
        expect(await alreadyInstalled([{ application_id: APP, status: "suspended" }])).toBe(true);
    });

    it("an unreadable installation list is an error, not 'nothing installed'", async () => {
        const res = await listApprovedApplications(chooserClient({ error: "permission denied" }), ORG);
        expect(res.ok).toBe(false);
    });
});

describe("disconnecting is terminal on the server", () => {
    const untouchable = new Proxy({}, { get() { throw new Error("the database must not be touched"); } });
    const params = Promise.resolve({ id: "inst-1" });
    const patch = (body: unknown) => route.PATCH({ json: async () => body } as never, { params });

    beforeEach(() => {
        audit.mockReset();
        guard = { ok: true, ctx: { supabase: untouchable, orgId: ORG, actorUserId: "user-1" } };
        installation = { ok: true, installation: { id: "inst-1", applicationId: APP, state: "revoked", grantedScopes: [] } };
    });

    for (const state of ["active", "suspended", "revoked"] as const) {
        it(`state "${state}" on a disconnected installation answers 409 and writes nothing`, async () => {
            const res = await patch({ state });
            expect(res.status).toBe(409);
            expect((await res.json()).error).toMatch(/disconnected/i);
            expect(audit).not.toHaveBeenCalled();
        });
    }

    it("a suspended installation can still be reactivated", async () => {
        installation = { ok: true, installation: { id: "inst-1", applicationId: APP, state: "suspended", grantedScopes: [] } };
        audit.mockResolvedValue({ ok: false, code: "audit_unavailable", message: "stop here" });
        const res = await patch({ state: "active" });
        expect(audit).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(503);
    });
});
