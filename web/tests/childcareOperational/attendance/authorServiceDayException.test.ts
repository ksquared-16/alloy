/**
 * Authorization for authoring a service-day exception.
 *
 * The write path uses a service-role client, so nothing downstream re-asks
 * whether the caller was allowed. Everything below is about the gate that runs
 * BEFORE anything is written — and about the door this opens staying exactly as
 * narrow as it is described.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { authorServiceDayException } from "@/lib/childcareOperational/attendance/authorServiceDayException";
import { markChildAway } from "@/lib/childcareOperational/attendance/serviceDayExceptionCommands";
import {
    OE_AUTHOR_PERMISSION_KEY,
    resolveAuthoringContext,
} from "@/lib/operationalExpectations/intake/authoringServerContext";
import type { AuthoringGateway } from "@/lib/operationalExpectations/intake/authoringGateway";
import * as grants from "@/lib/access/actorPermissionGrants";
import * as scope from "@/lib/admin/accessScope";

const ORG = "org-1";
const SITE = "site-1";
const INPUT = markChildAway({
    idempotencyKey: "k1",
    actorUserId: "user-9",
    reasonKey: "illness",
    childId: "emma",
    range: { fromDate: "2026-09-18" },
});

/** Records whether anything reached the ledger. */
function spyGateway(): AuthoringGateway & { committed: number } {
    const gw = {
        committed: 0,
        isAuthoringEnabled: async () => true,
        loadPredecessor: async () => null,
        commit: async () => {
            gw.committed += 1;
            return {
                kind: "committed" as const,
                idempotent: false,
                expectationId: "e1",
                authoringActEventId: "a1",
                transitionType: null,
                supersedesExpectationId: null,
                lineageRootId: "e1",
                standing: "proposed" as const,
                authoredAt: "2026-09-15T09:00:00.000Z",
            };
        },
    };
    return gw;
}

function withGrants(permissionKeys: string[] | null) {
    vi.spyOn(grants, "resolveActorPermissionGrants").mockResolvedValue({
        permissionKeys,
    } as unknown as Awaited<ReturnType<typeof grants.resolveActorPermissionGrants>>);
}

const supabase = {} as SupabaseClient;
const allSites = { siteScope: "all" } as unknown as scope.AdminAccessScopeDimensions;

describe("nothing is written unless the caller may act", () => {
    it("refuses a caller without the attendance capability", async () => {
        withGrants(["some.other.capability"]);
        const gateway = spyGateway();
        const out = await authorServiceDayException({
            supabase,
            orgId: ORG,
            actorUserId: "user-9",
            dim: allSites,
            siteLocationId: SITE,
            input: INPUT,
            gateway,
        });
        expect(out).toMatchObject({ status: "denied", httpStatus: 403, code: "permission_denied" });
        expect(gateway.committed).toBe(0);
    });

    it("refuses when the capability lookup itself failed", async () => {
        // An unidentified caller is not an unprivileged one; collapsing the two
        // is how a broken lookup becomes an open door.
        withGrants(null);
        const gateway = spyGateway();
        const out = await authorServiceDayException({
            supabase,
            orgId: ORG,
            actorUserId: "user-9",
            dim: allSites,
            siteLocationId: SITE,
            input: INPUT,
            gateway,
        });
        expect(out).toMatchObject({ status: "denied", code: "permission_unresolved" });
        expect(gateway.committed).toBe(0);
    });

    it("refuses a site the caller does not hold", async () => {
        withGrants(["attendance.record"]);
        vi.spyOn(scope, "locationAllowedUnderSiteScope").mockResolvedValue(false);
        const gateway = spyGateway();
        const out = await authorServiceDayException({
            supabase,
            orgId: ORG,
            actorUserId: "user-9",
            dim: { siteScope: "restricted", allowedSiteLocationIds: ["site-2"] } as never,
            siteLocationId: SITE,
            input: INPUT,
            gateway,
        });
        expect(out).toMatchObject({ status: "denied", code: "site_out_of_scope" });
        expect(gateway.committed).toBe(0);
    });

    it("authors for a caller who holds the capability at that site", async () => {
        withGrants(["attendance.record"]);
        const gateway = spyGateway();
        const out = await authorServiceDayException({
            supabase,
            orgId: ORG,
            actorUserId: "user-9",
            dim: allSites,
            siteLocationId: SITE,
            input: INPUT,
            gateway,
        });
        expect(out).toMatchObject({ status: "authored" });
        expect(gateway.committed).toBe(1);
    });

    it("stamps the authenticated actor, not anything the caller sent", async () => {
        withGrants(["attendance.record"]);
        const gateway = spyGateway();
        const commit = vi.spyOn(gateway, "commit");
        await authorServiceDayException({
            supabase,
            orgId: ORG,
            actorUserId: "user-9",
            dim: allSites,
            siteLocationId: SITE,
            input: INPUT,
            gateway,
        });
        expect(commit).toHaveBeenCalledWith(ORG, "user-9", expect.objectContaining({ authorClass: "human" }));
    });
});

describe("the narrow door did not widen the generic one", () => {
    it("still refuses generic authoring without the expectations capability", () => {
        // If this ever passes, the purpose-scoped entry has become a way to author
        // anything about anything — which is the thing it exists to avoid.
        const resolved = resolveAuthoringContext({
            ok: true,
            orgId: ORG,
            userId: "user-9",
            permissionKeys: ["attendance.record"],
        } as never);
        expect(resolved.ok).toBe(false);
    });

    it("still admits a holder of the expectations capability", () => {
        const resolved = resolveAuthoringContext({
            ok: true,
            orgId: ORG,
            userId: "user-9",
            permissionKeys: [OE_AUTHOR_PERMISSION_KEY],
        } as never);
        expect(resolved.ok).toBe(true);
    });
});
