/**
 * P1 · Wave B — trusted-context + permission enforcement. The production entry
 * resolves org/actor/permission from the canonical admin access context; a caller
 * supplies none of them. These prove the permission gate over `resolveAuthoringContext`
 * (pure — no auth cache needed).
 */

import { describe, expect, it } from "vitest";
import {
    OE_AUTHOR_PERMISSION_KEY,
    resolveAuthoringContext,
} from "@/lib/operationalExpectations/intake/authoringServerContext";
import type { AdminAccessContextResult } from "@/lib/admin/getAdminAccessContext";

function access(over: Partial<Extract<AdminAccessContextResult, { ok: true }>> = {}): AdminAccessContextResult {
    return {
        ok: true,
        userId: "user-1",
        orgId: "org-1",
        roleKeys: ["ops"],
        permissionKeys: [OE_AUTHOR_PERMISSION_KEY],
        departmentScope: "all",
        allowedDepartmentIds: [],
        siteScope: "all",
        allowedSiteLocationIds: [],
        ...over,
    } as AdminAccessContextResult;
}

describe("resolveAuthoringContext", () => {
    it("rejects an unauthenticated caller (401 context)", () => {
        const r = resolveAuthoringContext({ ok: false, status: 401 });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.result).toMatchObject({ status: "rejected", code: "unauthorized" });
    });

    it("rejects a caller with server access but WITHOUT the authoring capability", () => {
        const r = resolveAuthoringContext(access({ permissionKeys: ["reports.read"] }));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.result).toMatchObject({ status: "rejected", code: "unauthorized" });
    });

    it("rejects a caller with workflows.write but WITHOUT operational_expectations.author", () => {
        const r = resolveAuthoringContext(access({ permissionKeys: ["workflows.write", "workflows.read"] }));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.result).toMatchObject({ status: "rejected", code: "unauthorized" });
    });

    it("admits a caller holding the dedicated operational_expectations.author capability", () => {
        const r = resolveAuthoringContext(access({ permissionKeys: ["operational_expectations.author"] }));
        expect(r.ok).toBe(true);
    });

    it("admits a capable caller and derives a TRUSTED context from the access bundle", () => {
        const r = resolveAuthoringContext(access({ orgId: "org-trusted", userId: "user-trusted" }));
        expect(r.ok).toBe(true);
        if (r.ok) {
            // org + actor come ONLY from the resolved access context.
            expect(r.context.orgId).toBe("org-trusted");
            expect(r.context.actorUserId).toBe("user-trusted");
            expect(r.context.actorAuthenticated).toBe(true);
        }
    });

    it("the authoring capability is the dedicated operational_expectations.author key", () => {
        expect(OE_AUTHOR_PERMISSION_KEY).toBe("operational_expectations.author");
    });
});
