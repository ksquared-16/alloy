/**
 * LAW 21 — an operational workspace's dataset survives its own modal unmount.
 *
 * Operations was the one workspace that reloaded everything on every open (7, 7, 7, 7 over four
 * open/close cycles, against Processing's 3, 0, 0, 2). The shared modal host unmounts children on
 * close for every workspace alike, so the only thing that can carry data across an open/close cycle
 * is module-scoped ownership. These guards freeze that ownership, and freeze the freshness contract
 * that makes reuse safe — reuse without the mutation seam would serve a pre-mutation plan.
 *
 * Every guard is positive-controlled: each reuse assertion is paired with a case that MUST fetch, so
 * a cache that silently stopped fetching altogether could not pass.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    invalidateOperationsDay,
    resetOperationsWorkspaceWarmForTests,
    warmOperationsDay,
    warmOperationsReference,
    warmOperationsWorkspace,
} from "@/lib/scheduling/operationsWorkspaceWarmCache";

const SITES = "/api/admin/scheduling?view=sites";
const ROSTER = "/api/admin/scheduling?view=roster&site_location_id=s1";
const ROSTER_OTHER = "/api/admin/scheduling?view=roster&site_location_id=s2";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    resetOperationsWorkspaceWarmForTests();
    fetchMock = vi.fn(async () => ({ json: async () => ({ ok: true }) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("Operations workspace warm lifecycle", () => {
    it("reuses reference data across a close/reopen instead of refetching", async () => {
        await warmOperationsReference(SITES);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        // The component unmounted here; the module did not.
        await warmOperationsReference(SITES);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("POSITIVE CONTROL — a different scope still fetches", async () => {
        await warmOperationsDay(ROSTER);
        await warmOperationsDay(ROSTER_OTHER);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("reuses operating-day data inside its freshness window", async () => {
        await warmOperationsDay(ROSTER);
        await warmOperationsDay(ROSTER);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("a mutation drops the day so the next read is authoritative", async () => {
        await warmOperationsDay(ROSTER);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        invalidateOperationsDay();
        await warmOperationsDay(ROSTER);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("a mutation does NOT drop configuration — an assignment change does not re-author sites", async () => {
        await warmOperationsReference(SITES);
        invalidateOperationsDay();
        await warmOperationsReference(SITES);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("concurrent identical reads share one request", async () => {
        await Promise.all([warmOperationsDay(ROSTER), warmOperationsDay(ROSTER), warmOperationsDay(ROSTER)]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("warming on nav intent warms only the site list, never a guessed site's day", async () => {
        warmOperationsWorkspace();
        await Promise.resolve();
        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain("view=sites");
    });

    it("a failed read is absorbed as an empty object, not thrown at the caller", async () => {
        fetchMock.mockRejectedValueOnce(new Error("network down"));
        await expect(warmOperationsReference("/api/admin/records/bootstrap")).resolves.toEqual({});
    });
});
