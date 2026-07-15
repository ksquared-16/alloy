/**
 * P1 · Wave C · C2 — ratification permission enforcement. Ratification requires the
 * DEDICATED operational_expectations.ratify capability; authoring permission,
 * workflows.write, and mere server/service execution do NOT grant it.
 */

import { describe, expect, it } from "vitest";
import {
    OE_RATIFY_PERMISSION_KEY,
    resolveRatificationContext,
} from "@/lib/operationalExpectations/ratification/ratificationServerContext";
import type { AdminAccessContextResult } from "@/lib/admin/getAdminAccessContext";

function access(over: Partial<Extract<AdminAccessContextResult, { ok: true }>> = {}): AdminAccessContextResult {
    return {
        ok: true,
        userId: "admin-1",
        orgId: "org-1",
        roleKeys: ["admin"],
        permissionKeys: [OE_RATIFY_PERMISSION_KEY],
        departmentScope: "all",
        allowedDepartmentIds: [],
        siteScope: "all",
        allowedSiteLocationIds: [],
        ...over,
    } as AdminAccessContextResult;
}

describe("resolveRatificationContext", () => {
    it("the ratify capability is a DEDICATED key distinct from authoring", () => {
        expect(OE_RATIFY_PERMISSION_KEY).toBe("operational_expectations.ratify");
        expect(OE_RATIFY_PERMISSION_KEY).not.toBe("operational_expectations.author");
    });

    it("rejects an unauthenticated caller (401)", () => {
        const r = resolveRatificationContext({ ok: false, status: 401 });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.result).toMatchObject({ status: "rejected", code: "unauthorized" });
    });

    it("rejects a caller holding only the AUTHORING capability (author ≠ ratify)", () => {
        const r = resolveRatificationContext(access({ permissionKeys: ["operational_expectations.author"] }));
        expect(r.ok).toBe(false);
    });

    it("rejects a caller holding only workflows.write", () => {
        const r = resolveRatificationContext(access({ permissionKeys: ["workflows.write"] }));
        expect(r.ok).toBe(false);
    });

    it("admits a caller holding the dedicated ratify capability and derives a trusted context", () => {
        const r = resolveRatificationContext(access({ orgId: "org-trusted", userId: "u-trusted" }));
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.context.orgId).toBe("org-trusted");
            expect(r.context.actorUserId).toBe("u-trusted");
            expect(r.context.actorAuthenticated).toBe(true);
        }
    });
});
