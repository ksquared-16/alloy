/**
 * GET /api/admin/financials/annual-catalog-billing — fin.read, read-only, says it is not active.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.fn();
const allowed = vi.fn();
const read = vi.fn();

vi.mock("@/lib/admin/getAdminContext", () => ({ getAdminContextCached: () => ctx() }));
vi.mock("@/lib/financials/financialsPermissions", () => ({ assertFinancialsReadAllowed: (a: unknown) => allowed(a) }));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({ marker: "admin" }) }));
vi.mock("@/lib/financials/businessDate", () => ({ fetchOrgBusinessDate: async () => "2026-11-03" }));
vi.mock("@/lib/financials/catalogRecurring/readAnnualCatalogFeeSchedule", () => ({
    readAnnualCatalogFeeSchedule: (...a: unknown[]) => read(...a),
}));

import { GET } from "@/app/api/admin/financials/annual-catalog-billing/route";

describe("annual Catalog billing preview route", () => {
    beforeEach(() => {
        ctx.mockReset(); allowed.mockReset(); read.mockReset();
        ctx.mockResolvedValue({ ok: true, orgId: "org-1", userId: "u-1" });
        read.mockResolvedValue({ asOf: "2026-11-03", items: [], names: { children: {}, households: {} } });
    });

    it("signed out is 401 and reads nothing", async () => {
        ctx.mockResolvedValue({ ok: false, status: 401 });
        expect((await GET()).status).toBe(401);
        expect(read).not.toHaveBeenCalled();
    });

    it("without fin.read is 403, names the permission, and reads nothing", async () => {
        allowed.mockResolvedValue({ ok: false, message: "Financials read is required.", requiredPermission: "fin.read" });
        const res = await GET();
        expect(res.status).toBe(403);
        expect((await res.json()).required_permission).toBe("fin.read");
        expect(read).not.toHaveBeenCalled();
    });

    it("with fin.read: this org's schedule on its business date, active:false and the proposed timing", async () => {
        allowed.mockResolvedValue({ ok: true });
        const res = await GET();
        expect(res.status).toBe(200);
        expect(read).toHaveBeenCalledWith({ marker: "admin" }, "org-1", "2026-11-03");
        const body = await res.json();
        expect(body.active).toBe(false);
        expect(body.timing).toMatch(/^Proposed:/);
    });
});
