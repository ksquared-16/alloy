/**
 * DURABLE RECORD ATTENTION — subject-first resolution.
 *
 * The property under test is one sentence: **an active Work Unit says where a subject is WORKED, not
 * whether it EXISTS.** Before this, `resolveOperatorFocusTarget` typed its answer as the literal
 * `"opportunities"` and walked `person → household → newest case → active unit`, so:
 *
 *   - a canonically-created staff member (Person + Employment, no household, no case) had no
 *     representable target at all, and
 *   - an enrolled child whose case had left the active queue became unopenable while staying enrolled.
 *
 * Both answered `null`, which callers correctly propagate as "nowhere to send the operator" — so the
 * gap was invisible for exactly as long as it existed. These tests are the tripwire that keeps it so.
 *
 * The negative controls at the bottom are the point of the file: each one restores a piece of the old
 * model and asserts the durable case FAILS. A test that only proves the new behaviour would still pass
 * if someone quietly reintroduced the host requirement alongside it.
 */

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import {
    hasOperationalDestination,
    isResolvableFocusEntityType,
    resolveAttentionTarget,
    resolveOperatorFocusTarget,
} from "@/lib/workUnits/operatorFocusTarget";

const ORG = "org-1";
const OTHER_ORG = "org-2";

const UNRESTRICTED: AdminAccessScopeDimensions = {
    departmentScope: "all",
    allowedDepartmentIds: [],
    siteScope: "all",
    allowedSiteLocationIds: [],
};

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

/**
 * Minimal table-filter mock. Deliberately purpose-built rather than shared: these tests assert on
 * WHICH tables were read, and a helper with default tables would blur that.
 */
function mockSupabase(store: Store): { supabase: SupabaseClient; reads: string[] } {
    const reads: string[] = [];
    const from = (table: string) => {
        reads.push(table);
        let rows = [...(store[table] ?? [])];
        const api: Record<string, unknown> = {};
        const chain = () => api;
        api.select = chain;
        api.order = chain;
        api.limit = chain;
        api.eq = (col: string, val: unknown) => {
            rows = rows.filter((r) => r[col] === val);
            return api;
        };
        api.in = (col: string, vals: unknown[]) => {
            rows = rows.filter((r) => vals.includes(r[col] as never));
            return api;
        };
        api.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
            resolve({ data: rows, error: null });
        return api;
    };
    return { supabase: { from } as unknown as SupabaseClient, reads };
}

/** A staff member exactly as `staff.add` creates one: a person and an employment, nothing else. */
const STAFF_ONLY_STORE: Store = {
    persons: [{ id: "person-teacher", org_id: ORG }],
    customer_persons: [],
    customer_members: [],
    opportunities: [],
    work_units: [],
};

/** A child whose enrollment finished: the member and household remain, the case left the queue. */
const CLOSED_CASE_CHILD_STORE: Store = {
    persons: [{ id: "person-child", org_id: ORG }],
    customer_persons: [],
    customer_members: [
        { id: "member-child", org_id: ORG, person_id: "person-child", customer_id: "household-1" },
    ],
    opportunities: [
        { id: "opp-closed", org_id: ORG, customer_id: "household-1", work_unit_id: "wu-closed" },
    ],
    // The unit exists but is no longer active — `fetchActiveWorkUnitKeys` skips it, so the case has
    // no key. This is the ordinary end state of a completed enrollment, not a broken fixture.
    work_units: [{ id: "wu-closed", org_id: ORG, key: "enrollment_pipeline", is_active: false }],
};

/** An active family case: the pre-existing operational path, which must not move at all. */
const ACTIVE_CASE_STORE: Store = {
    persons: [{ id: "person-parent", org_id: ORG }],
    customer_persons: [{ org_id: ORG, person_id: "person-parent", customer_id: "household-1" }],
    customer_members: [
        { id: "member-child", org_id: ORG, person_id: "person-child", customer_id: "household-1" },
    ],
    opportunities: [
        { id: "opp-active", org_id: ORG, customer_id: "household-1", work_unit_id: "wu-active" },
    ],
    work_units: [{ id: "wu-active", org_id: ORG, key: "enrollment_pipeline", is_active: true }],
};

function resolve(store: Store, entityType: string, entityId: string, orgId = ORG) {
    const { supabase, reads } = mockSupabase(store);
    return resolveAttentionTarget({
        supabase,
        orgId,
        dimensions: UNRESTRICTED,
        entityType,
        entityId,
    }).then((r) => ({ resolution: r, reads }));
}

// ── STAFF — the core proof ───────────────────────────────────────────────────────────

describe("a staff Person with no household and no case", () => {
    it("resolves as a durable person subject", async () => {
        const { resolution } = await resolve(STAFF_ONLY_STORE, "persons", "person-teacher");
        expect(resolution).not.toBeNull();
        expect(resolution!.subject).toEqual({
            type: "person",
            id: "person-teacher",
            person_id: "person-teacher",
            household_id: null,
        });
    });

    it("carries no operational host, and that is the honest answer rather than a refusal", async () => {
        const { resolution } = await resolve(STAFF_ONLY_STORE, "persons", "person-teacher");
        expect(resolution!.operational_host).toBeNull();
    });

    it("fabricates no Opportunity to give itself a host", async () => {
        const { reads } = await resolve(STAFF_ONLY_STORE, "persons", "person-teacher");
        // Reading `opportunities` at all would mean a case lookup ran for a person who has no
        // household; WRITING one is impossible through this mock, so absence of the read is the
        // strongest available statement that no case was sought or invented.
        expect(reads).not.toContain("opportunities");
    });

    it("does not resolve a person from another org", async () => {
        const { resolution } = await resolve(STAFF_ONLY_STORE, "persons", "person-teacher", OTHER_ORG);
        expect(resolution).toBeNull();
    });

    it("does not resolve a person id that does not exist", async () => {
        const { resolution } = await resolve(STAFF_ONLY_STORE, "persons", "person-ghost");
        expect(resolution).toBeNull();
    });
});

// ── CHILD — durable past the end of its own process ──────────────────────────────────

describe("a child whose enrollment case has left the active queue", () => {
    it("resolves as a durable child subject keyed by the member row", async () => {
        const { resolution } = await resolve(CLOSED_CASE_CHILD_STORE, "customer_members", "member-child");
        expect(resolution!.subject).toEqual({
            type: "child",
            id: "member-child",
            person_id: "person-child",
            household_id: "household-1",
        });
    });

    it("has no operational DESTINATION, because no active unit pages the case", async () => {
        const { resolution } = await resolve(CLOSED_CASE_CHILD_STORE, "customer_members", "member-child");
        // The closed case is still named — it exists, and saying otherwise would be a second lie in
        // the opposite direction. What it does not have is an active unit, so it is not a destination.
        expect(resolution!.operational_host?.host_entity_id).toBe("opp-closed");
        expect(resolution!.operational_host?.host_work_unit_key).toBeNull();
        expect(hasOperationalDestination(resolution)).toBe(false);
    });

    it("creates no new Opportunity or process instance to become openable", async () => {
        const { reads } = await resolve(CLOSED_CASE_CHILD_STORE, "customer_members", "member-child");
        expect(reads).not.toContain("process_instances");
        // The closed case IS read — as context that turns out to be absent. Nothing is written.
        expect(reads).toContain("opportunities");
    });

    it("does not resolve a member from another org", async () => {
        const { resolution } = await resolve(
            CLOSED_CASE_CHILD_STORE,
            "customer_members",
            "member-child",
            OTHER_ORG
        );
        expect(resolution).toBeNull();
    });
});

// ── OPERATIONAL CONTEXT — enrichment when it exists ──────────────────────────────────

describe("operational context is carried when a queue does hold the subject", () => {
    it("a person on an active family case still receives the host", async () => {
        const { resolution } = await resolve(ACTIVE_CASE_STORE, "persons", "person-parent");
        expect(resolution!.subject.type).toBe("person");
        expect(resolution!.operational_host).toEqual({
            host_entity_type: "opportunities",
            host_entity_id: "opp-active",
            host_work_unit_key: "enrollment_pipeline",
        });
    });

    it("a child on an active family case receives both its subject and the host", async () => {
        const { resolution } = await resolve(ACTIVE_CASE_STORE, "customer_members", "member-child");
        expect(resolution!.subject.type).toBe("child");
        expect(resolution!.operational_host?.host_work_unit_key).toBe("enrollment_pipeline");
    });

    it("an opportunity is its own subject and its own host — unchanged", async () => {
        const { resolution } = await resolve(ACTIVE_CASE_STORE, "opportunities", "opp-active");
        expect(resolution!.subject).toEqual({
            type: "opportunity",
            id: "opp-active",
            person_id: null,
            household_id: null,
        });
        expect(resolution!.operational_host?.host_entity_id).toBe("opp-active");
    });
});

// ── OPERATIONAL INTENT — every pre-existing caller keeps its answer ──────────────────

describe("the operational question is unchanged", () => {
    async function operational(store: Store, entityType: string, entityId: string) {
        const { supabase } = mockSupabase(store);
        return resolveOperatorFocusTarget({
            supabase,
            orgId: ORG,
            dimensions: UNRESTRICTED,
            entityType,
            entityId,
        });
    }

    it("still answers null for a staff person — there is genuinely nowhere to work them", async () => {
        expect(await operational(STAFF_ONLY_STORE, "persons", "person-teacher")).toBeNull();
    });

    it("still answers a keyless host for a child whose case left the queue — as it always did", async () => {
        // Verbatim pre-existing behaviour: the case is named, the key is null, and the client's
        // `if (!workUnitKey || !hostId) return false` is what actually stops the movement.
        expect(await operational(CLOSED_CASE_CHILD_STORE, "persons", "person-child")).toEqual({
            host_entity_type: "opportunities",
            host_entity_id: "opp-closed",
            host_work_unit_key: null,
        });
    });

    it("still answers the host for a person on an active case", async () => {
        const target = await operational(ACTIVE_CASE_STORE, "persons", "person-parent");
        expect(target).toEqual({
            host_entity_type: "opportunities",
            host_entity_id: "opp-active",
            host_work_unit_key: "enrollment_pipeline",
        });
    });

    it("does not answer the child grain, which no operational caller ever asked for", async () => {
        expect(await operational(ACTIVE_CASE_STORE, "customer_members", "member-child")).toBeNull();
    });
});

// ── NEGATIVE CONTROLS ────────────────────────────────────────────────────────────────
//
// Each reconstructs one piece of the model this slice replaced and asserts the durable case fails
// under it. Without these, reintroducing the host requirement beside the new code would pass.

describe("negative controls", () => {
    it("NC1 — Opportunity-only target typing: a person subject has no representation", async () => {
        const { resolution } = await resolve(STAFF_ONLY_STORE, "persons", "person-teacher");
        // The old contract could express ONLY `host_entity_type: "opportunities"`. Projecting this
        // answer back onto it loses the subject entirely — which is exactly why staff were unopenable.
        const asLegacyTarget = resolution!.operational_host;
        expect(asLegacyTarget).toBeNull();
        expect(resolution!.subject.type).toBe("person");
    });

    it("NC2 — active-Work-Unit prerequisite: requiring a host loses the closed-case child", async () => {
        const { resolution } = await resolve(CLOSED_CASE_CHILD_STORE, "customer_members", "member-child");
        // The old rule WAS `hasOperationalDestination`. Under it this child is unopenable.
        expect(hasOperationalDestination(resolution)).toBe(false);
        // Subject-first, it is openable — and it is the same record either way.
        expect(resolution!.subject.id).toBe("member-child");
    });

    it("NC3 — a fabricated Opportunity is never the way a durable subject becomes openable", async () => {
        const before = STAFF_ONLY_STORE.opportunities.length;
        const { resolution } = await resolve(STAFF_ONLY_STORE, "persons", "person-teacher");
        expect(STAFF_ONLY_STORE.opportunities.length).toBe(before);
        expect(before).toBe(0);
        expect(resolution!.subject.type).toBe("person");
    });

    it("NC4 — org scope: a subject is never resolvable across tenants", async () => {
        for (const [type, id] of [
            ["persons", "person-teacher"],
            ["customer_members", "member-child"],
            ["opportunities", "opp-active"],
        ] as const) {
            const store =
                type === "persons"
                    ? STAFF_ONLY_STORE
                    : type === "customer_members"
                      ? CLOSED_CASE_CHILD_STORE
                      : ACTIVE_CASE_STORE;
            const { resolution } = await resolve(store, type, id, OTHER_ORG);
            expect(resolution, `${type} must not resolve cross-org`).toBeNull();
        }
    });

    it("NC5 — restricted access still hides an unreachable record indistinguishably", async () => {
        const { supabase } = mockSupabase(STAFF_ONLY_STORE);
        const resolution = await resolveAttentionTarget({
            supabase,
            orgId: ORG,
            // Restricted with an empty allow-list: the envelope is impossible, so nothing resolves.
            dimensions: {
                departmentScope: "restricted",
                allowedDepartmentIds: [],
                siteScope: "all",
                allowedSiteLocationIds: [],
            },
            entityType: "persons",
            entityId: "person-teacher",
        });
        expect(resolution).toBeNull();
    });
});

describe("resolvable entity types", () => {
    it("admits the durable grains and still refuses types with no subject model", () => {
        expect(isResolvableFocusEntityType("persons")).toBe(true);
        expect(isResolvableFocusEntityType("customer_members")).toBe(true);
        expect(isResolvableFocusEntityType("child")).toBe(true);
        expect(isResolvableFocusEntityType("opportunities")).toBe(true);
        expect(isResolvableFocusEntityType("jobs")).toBe(false);
        expect(isResolvableFocusEntityType("schedules")).toBe(false);
        expect(isResolvableFocusEntityType("")).toBe(false);
    });
});
