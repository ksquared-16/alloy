/**
 * Thread 8, Slice D — the administrator's answer and the front desk's answer
 * must be the same answer.
 *
 * The kiosk asks "may THIS adult collect?" one person at a time. Settings asks
 * "who may collect THIS child?" The two run in different directions over the same
 * facts, and if they ever derive independently they will eventually disagree
 * about a safeguarding decision — the one place disagreement is unacceptable.
 *
 * So the last describe block runs both against identical facts and asserts they
 * agree, rather than asserting each against a hand-written expectation.
 *
 * The other property here is that three distinct situations stay distinct:
 * never listed, listed but unscreened, and barred. They need opposite actions
 * and a single "not authorized" boolean would erase the difference.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    loadChildPickupAuthority,
    pickupStateLabel,
    relationshipRoleLabel,
    PICKUP_ROLE,
} from "@/lib/safeguarding/childPickupAdministration";
import { resolveKioskChildEligibility } from "@/lib/childcareOperational/attendance/kiosk/kioskChildEligibility";

const ORG = "org-1";
const CHILD_A = "child-a";
const NADIA = "person-nadia";
const MARCUS = "person-marcus";
const ON_DATE = "2026-09-11";

function restriction(over: Record<string, unknown> = {}) {
    return {
        id: "r-1",
        customer_member_id: CHILD_A,
        affected_person_id: MARCUS,
        affected_party_description: null,
        restriction_kind: "custody",
        operational_effect: "may_not_pick_up",
        status: "active",
        effective_from: "2026-01-01",
        effective_to: null,
        evidence_basis: "court_order",
        evidence_document_id: null,
        source: "operator",
        review_state: "approved",
        supersedes_id: null,
        ...over,
    };
}

/**
 * Tables keyed by name. The double HONOURS `.eq()` and `.in()` rather than
 * returning every row: a filter-ignoring fake would pass a test whose whole point
 * is that an ended relationship is excluded.
 */
function supa(tables: Record<string, unknown[]>) {
    function table(name: string) {
        let rows = (tables[name] ?? []) as Record<string, unknown>[];
        const api = {
            select: () => api,
            eq(col: string, val: unknown) {
                rows = rows.filter((r) => r[col] === val);
                return api;
            },
            in(col: string, vals: unknown[]) {
                rows = rows.filter((r) => vals.includes(r[col]));
                return api;
            },
            order: () => api,
            then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
                return Promise.resolve({ data: rows, error: null }).then(resolve);
            },
        };
        return api;
    }
    return { from: vi.fn((n: string) => table(n)) } as unknown as SupabaseClient;
}

function world(opts: {
    roles: Record<string, string[]>;
    screened: boolean;
    restrictions?: unknown[];
    relationshipStatus?: string;
}) {
    const people = Object.keys(opts.roles);
    return supa({
        person_child_relationships: people.map((p) => ({
            id: `rel-${p}`,
            org_id: ORG,
            person_id: p,
            customer_member_id: CHILD_A,
            status: opts.relationshipStatus ?? "active",
        })),
        person_child_relationship_roles: people.flatMap((p) =>
            opts.roles[p].map((role_key) => ({
                org_id: ORG,
                relationship_id: `rel-${p}`,
                role_key,
                is_active: true,
            })),
        ),
        child_safeguarding_restrictions: (opts.restrictions ?? []).map((r) => ({
            ...(r as Record<string, unknown>),
            org_id: ORG,
        })),
        child_safeguarding_screenings:
            opts.screened ? [{ org_id: ORG, customer_member_id: CHILD_A }] : [],
        persons: people.map((p) => ({
            id: p,
            org_id: ORG,
            first_name: p === NADIA ? "Nadia" : "Marcus",
            last_name: "R",
        })),
    });
}

describe("loadChildPickupAuthority — three situations that must not collapse", () => {
    it("authorizes an adult the family listed, on a screened child", async () => {
        const result = await loadChildPickupAuthority(
            world({ roles: { [NADIA]: ["parent", PICKUP_ROLE] }, screened: true }),
            ORG,
            CHILD_A,
            ON_DATE,
        );
        expect(result.people[0].state).toBe("authorized");
        expect(result.people[0].listedForPickup).toBe(true);
    });

    it("does NOT authorize a parent the family never listed for collection", async () => {
        // A parent role is not a collection authority. Reading it as one would be
        // Alloy inventing an authorization the family never granted.
        const result = await loadChildPickupAuthority(
            world({ roles: { [NADIA]: ["parent"] }, screened: true }),
            ORG,
            CHILD_A,
            ON_DATE,
        );
        expect(result.people[0].state).not.toBe("authorized");
        expect(result.people[0].listedForPickup).toBe(false);
    });

    it("refuses to call an unscreened child clear", async () => {
        const result = await loadChildPickupAuthority(
            world({ roles: { [NADIA]: [PICKUP_ROLE] }, screened: false }),
            ORG,
            CHILD_A,
            ON_DATE,
        );
        expect(result.people[0].state).toBe("unknown");
        expect(result.safeguardingScreened).toBe(false);
    });

    it("lets an in-force restriction beat the family's own listing", async () => {
        const result = await loadChildPickupAuthority(
            world({
                roles: { [MARCUS]: ["parent", PICKUP_ROLE] },
                screened: true,
                restrictions: [restriction()],
            }),
            ORG,
            CHILD_A,
            ON_DATE,
        );
        const marcus = result.people.find((p) => p.personId === MARCUS)!;
        expect(marcus.state).toBe("restricted");
        expect(marcus.blockingRestrictionIds).toEqual(["r-1"]);
        // Both facts are reported; the restriction constrains the action.
        expect(marcus.listedForPickup).toBe(true);
        expect(marcus.reasons.join(" ")).toContain("restriction");
    });

    it("keeps the three layers separately readable", async () => {
        const result = await loadChildPickupAuthority(
            world({ roles: { [NADIA]: ["parent"] }, screened: false }),
            ORG,
            CHILD_A,
            ON_DATE,
        );
        const p = result.people[0];
        // relationship authority, safeguarding, and the decision — three fields.
        expect(p.roleKeys).toEqual(["parent"]);
        expect(result.safeguardingScreened).toBe(false);
        expect(p.state).toBe("unknown");
    });
});

describe("loadChildPickupAuthority — authority is child-scoped", () => {
    it("reports nobody when the relationship is not active", async () => {
        // Removing authority is a relationship state change, and it must take
        // effect here without any other edit.
        const result = await loadChildPickupAuthority(
            world({ roles: { [NADIA]: [PICKUP_ROLE] }, screened: true, relationshipStatus: "ended" }),
            ORG,
            CHILD_A,
            ON_DATE,
        );
        // The query filters on active, so an ended relationship yields no people.
        expect(result.people.map((p) => p.personId)).not.toContain(NADIA);
    });

    it("returns an empty roster rather than an error for a child with no relationships", async () => {
        const result = await loadChildPickupAuthority(
            world({ roles: {}, screened: true }),
            ORG,
            CHILD_A,
            ON_DATE,
        );
        expect(result.people).toEqual([]);
        expect(result.safeguardingScreened).toBe(true);
    });
});

describe("Settings and the kiosk agree, on the same facts", () => {
    const CASES: { name: string; roles: string[]; screened: boolean; restrictions: unknown[] }[] = [
        { name: "listed and screened", roles: ["parent", PICKUP_ROLE], screened: true, restrictions: [] },
        { name: "listed but unscreened", roles: [PICKUP_ROLE], screened: false, restrictions: [] },
        { name: "parent only", roles: ["parent"], screened: true, restrictions: [] },
        {
            name: "listed but barred",
            roles: ["parent", PICKUP_ROLE],
            screened: true,
            restrictions: [restriction({ affected_person_id: NADIA })],
        },
    ];

    for (const c of CASES) {
        it(`${c.name} — the administrator sees what the front desk decides`, async () => {
            const admin = await loadChildPickupAuthority(
                world({ roles: { [NADIA]: c.roles }, screened: c.screened, restrictions: c.restrictions }),
                ORG,
                CHILD_A,
                ON_DATE,
            );

            const kiosk = resolveKioskChildEligibility({
                operation: "check_out",
                personId: NADIA,
                facts: {
                    childId: CHILD_A,
                    activeRoleKeys: c.roles,
                    restrictions: c.restrictions as never,
                    safeguardingScreened: c.screened,
                },
                onDate: ON_DATE,
            });

            const adminPerson = admin.people.find((p) => p.personId === NADIA)!;
            // The kiosk's own `pickupState` comes from the same resolver; if either
            // side ever grew its own rule this equality is what breaks.
            expect(adminPerson.state).toBe(kiosk.pickupState);
            expect(adminPerson.state === "authorized").toBe(kiosk.allowed);
        });
    }
});

describe("operator language", () => {
    it("never shows a raw role key for a role the product names", () => {
        expect(relationshipRoleLabel(PICKUP_ROLE)).toBe("Authorized to collect");
        expect(relationshipRoleLabel("parent")).toBe("Parent");
    });

    it("never shows a raw pickup state", () => {
        for (const s of ["authorized", "restricted", "unknown"] as const) {
            expect(pickupStateLabel(s)).not.toContain(s);
        }
    });
});
