import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    loadSearchProcessConfiguration,
    resetSearchProcessConfigurationCache,
} from "@/lib/search/searchProcessConfiguration";

const ORG = "11111111-1111-4111-8111-111111111111";
const DEPT = "22222222-2222-4222-8222-222222222222";
const OTHER_DEPT = "33333333-3333-4333-8333-333333333333";

const LIFECYCLE = {
    version: 1,
    processes: [
        {
            id: "p1",
            key: "enrollment",
            name: "Enrollment",
            is_active: true,
            sort_order: 1,
            primary_entity: "customer_members",
            stages: [{ id: "s1", key: "enrolling", label: "Enrolling", is_active: true, sort_order: 1 }],
        },
    ],
};

function mockSupabase(rows: Array<Record<string, unknown>>, counter: { n: number }): SupabaseClient {
    return {
        from: () => {
            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                then: (resolve: (v: unknown) => void) => {
                    counter.n += 1;
                    return Promise.resolve({ data: rows, error: null }).then(resolve);
                },
            };
            return builder;
        },
    } as unknown as SupabaseClient;
}

const openDim = {
    departmentScope: "all" as const,
    allowedDepartmentIds: null,
    siteScope: "all" as const,
    allowedSiteLocationIds: null,
};

const rows = [{ id: DEPT, org_id: ORG, is_active: true, metadata: { lifecycle_builder_v1: LIFECYCLE } }];

describe("search process configuration cache", () => {
    beforeEach(() => resetSearchProcessConfigurationCache());

    it("reads once and serves the second call from cache", async () => {
        const counter = { n: 0 };
        const supabase = mockSupabase(rows, counter);
        const a = await loadSearchProcessConfiguration(supabase, ORG, openDim, { now: 1000 });
        const b = await loadSearchProcessConfiguration(supabase, ORG, openDim, { now: 1500 });
        expect(counter.n).toBe(1);
        expect(b.byKey.get("enrollment")?.label).toBe("Enrollment");
        expect(a).toBe(b);
    });

    it("re-reads after the TTL expires", async () => {
        const counter = { n: 0 };
        const supabase = mockSupabase(rows, counter);
        await loadSearchProcessConfiguration(supabase, ORG, openDim, { now: 1000 });
        await loadSearchProcessConfiguration(supabase, ORG, openDim, { now: 1000 + 30_001 });
        expect(counter.n).toBe(2);
    });

    it("NEVER shares an entry between operators with different access scope", async () => {
        // The vocabulary is access-filtered, so a shared entry would leak a
        // process the second operator may not reach.
        const counter = { n: 0 };
        const supabase = mockSupabase(rows, counter);

        await loadSearchProcessConfiguration(supabase, ORG, openDim, { now: 1000 });
        await loadSearchProcessConfiguration(
            supabase,
            ORG,
            {
                departmentScope: "restricted",
                allowedDepartmentIds: [OTHER_DEPT],
                siteScope: "all",
                allowedSiteLocationIds: null,
            },
            { now: 1000 }
        );
        expect(counter.n).toBe(2);
    });

    it("never shares an entry across orgs", async () => {
        const counter = { n: 0 };
        const supabase = mockSupabase(rows, counter);
        await loadSearchProcessConfiguration(supabase, ORG, openDim, { now: 1000 });
        await loadSearchProcessConfiguration(supabase, "other-org", openDim, { now: 1000 });
        expect(counter.n).toBe(2);
    });

    it("excludes a process the operator's department scope cannot reach", async () => {
        const counter = { n: 0 };
        const supabase = mockSupabase(rows, counter);
        const config = await loadSearchProcessConfiguration(
            supabase,
            ORG,
            {
                departmentScope: "restricted",
                allowedDepartmentIds: [OTHER_DEPT],
                siteScope: "all",
                allowedSiteLocationIds: null,
            },
            { now: 1000 }
        );
        // Present in the map (so a participation row can still be labelled) but
        // absent from the intent vocabulary and flagged inaccessible.
        expect(config.byKey.get("enrollment")?.operator_has_access).toBe(false);
        expect(config.vocabulary).toEqual([]);
    });
});
